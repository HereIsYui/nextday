import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P1 内天地派驻系统", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-inner-world-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("未解锁玩家可查看预告，但不能派驻", async () => {
    const { token } = await createP1InnerWorldPlayer(app, prisma, "未开", "qi");

    const summary = await request(app.getHttpServer())
      .get("/api/inner-world/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(summary.body.data.state.unlocked).toBe(false);
    expect(summary.body.data.state.unlock_hint).toContain("化神");
    expect(summary.body.data.creatures).toHaveLength(3);

    const rejected = await request(app.getHttpServer())
      .post("/api/inner-world/dispatch")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_inner_locked_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji" })
      .expect(400);

    expect(rejected.body.message).toContain("内天地需");
  });

  it("化神或第四章后可异步派驻，重复幂等键不重复创建派驻", async () => {
    const { token, playerId } = await createUnlockedInnerWorldPlayer(app, prisma, "派驻", "qi");

    const idempotencyKey = `idem_p1_inner_dispatch_${Date.now()}_${randomSuffix()}`;
    const first = await request(app.getHttpServer())
      .post("/api/inner-world/dispatch")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ province_id: "ji" })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/inner-world/dispatch")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ province_id: "ji" })
      .expect(201);

    expect(first.body.data.assignment.province_name).toBe("冀州");
    expect(first.body.data.assignment.status).toBe("active");
    expect(repeated.body.data.record_id).toBe(first.body.data.record_id);
    expect(await prisma.innerWorldAssignment.count({ where: { playerId, idempotencyKey } })).toBe(
      1,
    );
  });

  it("派驻完成后可收取绑定材料和法则经验，且不会产出付费或限定产物", async () => {
    const { token, playerId } = await createUnlockedInnerWorldPlayer(app, prisma, "收取", "body");

    const dispatched = await request(app.getHttpServer())
      .post("/api/inner-world/dispatch")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_inner_claim_dispatch_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji" })
      .expect(201);
    const assignmentId = dispatched.body.data.assignment.assignment_id as string;
    await prisma.innerWorldAssignment.update({
      where: { assignmentId },
      data: { endsAt: new Date(Date.now() - 60_000) },
    });

    const claimed = await request(app.getHttpServer())
      .post("/api/inner-world/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_inner_claim_${Date.now()}_${randomSuffix()}`)
      .send({})
      .expect(201);

    expect(claimed.body.data.assignments[0].status).toBe("claimed");
    expect(claimed.body.data.law_exp_gained).toBeGreaterThan(0);
    expect(claimed.body.data.rewards.jade_paid).toBeUndefined();
    expect(claimed.body.data.rewards.jade_bound).toBeUndefined();
    for (const item of claimed.body.data.rewards.items) {
      expect(item.bind_type).toBe("bound");
      expect(item.item_id).not.toContain("ancient");
      expect(item.item_id).not.toContain("gubao");
      expect(item.item_id).not.toContain("limited");
    }
    expect(
      await prisma.playerItem.count({ where: { playerId, sourceType: "inner_world_assignment" } }),
    ).toBeGreaterThan(0);
  });

  it("不同幂等键并发收取同一派驻时只结算一次", async () => {
    const { token, playerId } = await createUnlockedInnerWorldPlayer(app, prisma, "收取并发", "qi");
    const dispatched = await request(app.getHttpServer())
      .post("/api/inner-world/dispatch")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_inner_concurrent_dispatch_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji" })
      .expect(201);
    await prisma.innerWorldAssignment.update({
      where: { assignmentId: dispatched.body.data.assignment.assignment_id },
      data: { endsAt: new Date(Date.now() - 60_000) },
    });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post("/api/inner-world/claim")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `idem_p1_inner_concurrent_claim_a_${Date.now()}_${randomSuffix()}`)
        .send({}),
      request(app.getHttpServer())
        .post("/api/inner-world/claim")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `idem_p1_inner_concurrent_claim_b_${Date.now()}_${randomSuffix()}`)
        .send({}),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
    expect(
      await prisma.innerWorldAssignment.count({ where: { playerId, status: "claimed" } }),
    ).toBe(1);
    expect(await prisma.innerWorldLawRecord.count({ where: { playerId } })).toBe(1);
  });

  it("内天地升级、生灵培养和九州支援受材料、法则经验与每日次数约束", async () => {
    const { token, playerId } = await createUnlockedInnerWorldPlayer(app, prisma, "养成", "qi");
    await seedInnerWorldGrowthCost(prisma, playerId);

    const upgradedWorld = await request(app.getHttpServer())
      .post("/api/inner-world/upgrade")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_inner_world_upgrade_${Date.now()}_${randomSuffix()}`)
      .send({ target_type: "world" })
      .expect(201);
    expect(upgradedWorld.body.data.state.world_level).toBe(2);

    const summary = await request(app.getHttpServer())
      .get("/api/inner-world/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const idleCreature = summary.body.data.creatures.find(
      (creature: { status: string }) => creature.status === "idle",
    );
    expect(idleCreature).toBeTruthy();

    const upgradedCreature = await request(app.getHttpServer())
      .post("/api/inner-world/upgrade")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_inner_creature_upgrade_${Date.now()}_${randomSuffix()}`)
      .send({ target_type: "creature", creature_id: idleCreature.creature_id })
      .expect(201);
    expect(upgradedCreature.body.data.creature.level).toBe(2);

    await prisma.innerWorldState.update({
      where: { playerId },
      data: { lawExp: 50, supportCountToday: 0, supportResetKey: todayKey() },
    });
    for (let index = 0; index < 3; index += 1) {
      const supported = await request(app.getHttpServer())
        .post("/api/inner-world/support")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `idem_p1_inner_support_${index}_${Date.now()}_${randomSuffix()}`)
        .send({ province_id: "ji", support_type: "spirit_vein" })
        .expect(201);
      expect(supported.body.data.support.support_type).toBe("spirit_vein");
    }

    const fourth = await request(app.getHttpServer())
      .post("/api/inner-world/support")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_inner_support_limit_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", support_type: "spirit_vein" })
      .expect(400);
    expect(fourth.body.message).toContain("次数已用完");
  });

  it("内天地配置和后台校验会拒绝付费货币、九大古宝和可交易产物", async () => {
    const config = await request(app.getHttpServer()).get("/api/config/inner_world").expect(200);
    const configText = JSON.stringify(config.body.data.payload);
    expect(config.body.data.config_type).toBe("inner_world");
    expect(configText).not.toContain("jade_paid");
    expect(configText).not.toContain("ancient_treasure");
    expect(configText).not.toContain('"tradeable":true');

    const rejected = await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", "nextday-admin-dev")
      .set("Idempotency-Key", `idem_p1_inner_bad_config_${Date.now()}_${randomSuffix()}`)
      .send({
        config_type: "inner_world",
        config_version: `inner_bad_${Date.now()}`,
        payload: {
          province_rewards: [
            { province_id: "ji", reward: { jade_paid: "1", items: [] }, law_exp_gain: 1 },
          ],
        },
      })
      .expect(400);

    expect(rejected.body.message).toContain("内天地配置不能产出");
  });
});

async function createUnlockedInnerWorldPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const player = await createP1InnerWorldPlayer(app, prisma, namePrefix, route);
  await prisma.player.update({
    where: { playerId: player.playerId },
    data: { currentRealm: 5, currentStage: 3, currentLevel: 7 },
  });
  await prisma.playerProgress.update({
    where: { playerId: player.playerId },
    data: { chapterId: 4 },
  });

  return player;
}

async function createP1InnerWorldPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix}${Date.now().toString(36).slice(-5)}${randomSuffix()}`.slice(
    0,
    16,
  );
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p1_inner_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p1_inner_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await request(app.getHttpServer())
    .get("/api/game/overview")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function seedInnerWorldGrowthCost(prisma: PrismaClient, playerId: string) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: 3000n } },
  });
  await prisma.innerWorldState.upsert({
    where: { playerId },
    create: {
      playerId,
      lawExp: 60,
      configVersion: "inner_world_p1_v1",
      rewardConfigVersion: "reward_inner_world_p1_v1",
    },
    update: { lawExp: 60 },
  });
  for (const [itemId, count] of [
    ["inner_seed", 3],
    ["law_dust", 3],
  ] as const) {
    await prisma.playerItem.create({
      data: {
        itemInstanceId: `item_p1_inner_${itemId}_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId,
        count,
        bindType: "bound",
        sourceType: "test_seed",
      },
    });
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
