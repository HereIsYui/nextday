import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("M4 多人异步玩法", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m4-test-secret";
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

  it("九塔可任意时间提交行动，消耗行动令、推进塔状态，并支持幂等", async () => {
    const { token, playerId } = await createM4Player(app, prisma, "九塔", "qi");

    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(towers.body.data.towers).toHaveLength(4);
    const tower = towers.body.data.towers[0];

    const beforeAction = await prisma.playerActionState.findUniqueOrThrow({ where: { playerId } });
    const idempotencyKey = `idem_m4_tower_${Date.now()}_${randomSuffix()}`;
    const first = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 2 })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 2 })
      .expect(201);

    expect(repeated.body.data.record_id).toBe(first.body.data.record_id);
    expect(first.body.data.contribution).toBeGreaterThan(0);
    expect(first.body.data.action_state.action_points).toBe(beforeAction.actionPoints - 4);
    expect(first.body.data.tower.seal_progress).toBeGreaterThanOrEqual(tower.seal_progress + 48);

    const recordCount = await prisma.towerActionRecord.count({
      where: { playerId, idempotencyKey },
    });
    expect(recordCount).toBe(1);
  });

  it("公共 Boss 使用镜像挑战汇总阶段血量池，不要求固定时间在线", async () => {
    const { token, playerId } = await createM4Player(app, prisma, "Boss", "body");

    const before = await request(app.getHttpServer())
      .get("/api/multiplayer/boss")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const beforeBoss = before.body.data.boss;

    const challenged = await request(app.getHttpServer())
      .post("/api/multiplayer/boss/challenge")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_boss_${Date.now()}_${randomSuffix()}`)
      .send({ boss_id: beforeBoss.boss_id })
      .expect(201);

    expect(challenged.body.data.damage_done).toBeGreaterThan(0);
    expect(challenged.body.data.log.length).toBeGreaterThan(0);
    expect(challenged.body.data.boss.boss_id).toBe(beforeBoss.boss_id);

    const record = await prisma.worldBossChallengeRecord.findFirst({
      where: { playerId },
      orderBy: { createdAt: "desc" },
    });
    expect(record?.damageDone).toBe(challenged.body.data.damage_done);
  });

  it("宗门支持创建、任务和仓库白名单，付费或绑定产物不能入库", async () => {
    const { token, playerId } = await createM4Player(app, prisma, "宗门", "qi");
    await grantSpiritStone(prisma, playerId, 1000);

    const created = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_sect_create_${Date.now()}_${randomSuffix()}`)
      .send({ name: `青岚${randomSuffix()}`, alignment: "neutral" })
      .expect(201);

    expect(created.body.data.sect.my_role).toBe("leader");
    const player = await prisma.player.findUniqueOrThrow({ where: { playerId } });
    expect(player.sectId).toBe(created.body.data.sect.sect_id);

    const task = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/tasks/complete")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_sect_task_${Date.now()}_${randomSuffix()}`)
      .send({ task_id: "sect_patrol" })
      .expect(201);
    expect(task.body.data.contribution).toBeGreaterThan(0);
    expect(Number(task.body.data.sect.funds)).toBeGreaterThan(0);

    const boundItemId = await createItem(prisma, playerId, "raw_iron", 2, "bound", "test_seed");
    await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_bound_${Date.now()}_${randomSuffix()}`)
      .send({ item_instance_id: boundItemId, count: 1 })
      .expect(400);

    const paidItemId = await createItem(prisma, playerId, "raw_iron", 2, "unbound", "paid_pack");
    await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_paid_${Date.now()}_${randomSuffix()}`)
      .send({ item_instance_id: paidItemId, count: 1 })
      .expect(400);

    const itemInstanceId = await createItem(
      prisma,
      playerId,
      "raw_iron",
      3,
      "unbound",
      "test_seed",
    );
    const deposited = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_deposit_${Date.now()}_${randomSuffix()}`)
      .send({ item_instance_id: itemInstanceId, count: 2 })
      .expect(201);

    expect(
      deposited.body.data.warehouse.some(
        (item: { item_id: string }) => item.item_id === "raw_iron",
      ),
    ).toBe(true);

    const withdrawn = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_withdraw_${Date.now()}_${randomSuffix()}`)
      .send({ item_id: "raw_iron", count: 1 })
      .expect(201);
    expect(
      withdrawn.body.data.bag.items.some(
        (item: { item_id: string }) => item.item_id === "raw_iron",
      ),
    ).toBe(true);
  });

  it("异步 PVP 使用防守镜像，失败不毁号，重复目标触发收益衰减", async () => {
    const attacker = await createM4Player(app, prisma, "进攻", "qi");
    const defender = await createM4Player(app, prisma, "防守", "body");
    await prisma.player.update({
      where: { playerId: attacker.playerId },
      data: { currentLevel: 9 },
    });
    const defenderBefore = await prisma.player.findUniqueOrThrow({
      where: { playerId: defender.playerId },
    });
    const resources = await request(app.getHttpServer())
      .get("/api/multiplayer/resource-points")
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    const resourcePoint = resources.body.data.resource_points[0];

    const results: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/multiplayer/pvp/attack")
        .set("Authorization", `Bearer ${attacker.token}`)
        .set("Idempotency-Key", `idem_m4_pvp_${index}_${Date.now()}_${randomSuffix()}`)
        .send({
          defender_player_id: defender.playerId,
          resource_point_id: resourcePoint.resource_point_id,
        })
        .expect(201);
      results.push(response.body.data.risk_status);
    }

    expect(results).toEqual(["normal", "normal", "decayed"]);
    const defenderAfter = await prisma.player.findUniqueOrThrow({
      where: { playerId: defender.playerId },
    });
    expect(defenderAfter.currentLevel).toBe(defenderBefore.currentLevel);
    expect(defenderAfter.currentRealm).toBe(defenderBefore.currentRealm);

    const pvpCount = await prisma.pvpBattleRecord.count({
      where: { attackerPlayerId: attacker.playerId, defenderPlayerId: defender.playerId },
    });
    expect(pvpCount).toBe(3);
  });

  it("个人、宗门、PVP、九塔排行榜可读取，奖励预览不发唯一战力道具", async () => {
    for (const rankType of ["personal", "sect", "pvp_week", "tower_week"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/multiplayer/ranks/${rankType}`)
        .set(
          "Authorization",
          `Bearer ${(await createM4Player(app, prisma, `榜${rankType}`, "qi")).token}`,
        )
        .expect(200);

      expect(response.body.data.rank_type).toBe(rankType);
      for (const entry of response.body.data.entries) {
        const rewardText = JSON.stringify(entry.reward_preview);
        expect(rewardText).not.toContain("unique");
        expect(rewardText).not.toContain("限定法宝");
        expect(rewardText).not.toContain("古宝");
      }
    }
  });

  it("M4 配置类型和幂等键校验可用", async () => {
    const { token } = await createM4Player(app, prisma, "配置", "qi");
    for (const configType of ["tower", "boss", "sect", "pvp", "rank"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .expect(200);

      expect(response.body.data.config_type).toBe(configType);
      expect(response.body.data.ruleset_version).toBe("ruleset_m4_v1");
    }

    const response = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .send({ tower_id: "tower_xuantie", action_type: "seal", count: 1 })
      .expect(400);

    expect(response.body.message).toContain("Idempotency-Key");
  });
});

async function createM4Player(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix.slice(0, 2)}${Date.now()
    .toString(36)
    .slice(-5)}${randomSuffix()}`.slice(0, 16);
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `m4_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m4_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function grantSpiritStone(prisma: PrismaClient, playerId: string, amount: number) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: BigInt(amount) } },
  });
}

async function createItem(
  prisma: PrismaClient,
  playerId: string,
  itemId: string,
  count: number,
  bindType: string,
  sourceType: string,
): Promise<string> {
  const itemInstanceId = `item_m4_${Date.now()}_${randomSuffix()}`;
  await prisma.playerItem.create({
    data: {
      itemInstanceId,
      playerId,
      itemId,
      count,
      bindType,
      sourceType,
    },
  });

  return itemInstanceId;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
