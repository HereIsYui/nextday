import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P1 Web 玩法过程反馈", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-web-experience-secret";
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

  it("探索和洞府收取返回时间线、变化摘要、原因标签和下一步推荐", async () => {
    const { token } = await createP1Player(app, prisma, "体验", "qi");

    const explored = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_explore_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", count: 2 })
      .expect(201);
    await prisma.exploreActionRecord.update({
      where: { recordId: explored.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });
    const claimed = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_explore_claim_${Date.now()}_${randomSuffix()}`)
      .send({ record_id: explored.body.data.record_id })
      .expect(201);
    expect(claimed.body.data.battles).toHaveLength(2);
    expectExperience(claimed.body.data.experience);
    expect(
      claimed.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code),
    ).toContain("auto_battle");

    const cave = await request(app.getHttpServer())
      .post("/api/game/cave/collect")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_cave_${Date.now()}_${randomSuffix()}`)
      .send({})
      .expect(201);
    expect(cave.body.data.rewards.spirit_stone).toBeDefined();
    expectExperience(cave.body.data.experience);
    expect(
      cave.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code),
    ).toContain("async_collect");
  });

  it("炼丹和炼器返回生产过程反馈，且炼器继续不产出九大古宝", async () => {
    const { token, playerId } = await createP1Player(app, prisma, "生产", "qi");
    await grantMaterials(prisma, playerId, { lowHerb: 20, rawIron: 30, spiritStone: 3000 });

    const alchemy = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_alchemy_${Date.now()}_${randomSuffix()}`)
      .send({ recipe_id: "recipe_juling_1" })
      .expect(201);
    expect(alchemy.body.data.record.record_id).toBe(alchemy.body.data.record_id);
    expectExperience(alchemy.body.data.experience);

    const forged = await request(app.getHttpServer())
      .post("/api/production/forge/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_forge_${Date.now()}_${randomSuffix()}`)
      .send({ recipe_id: "forge_xuantie_sword_1" })
      .expect(201);
    expect(forged.body.data.equipment.name).not.toContain("古宝");
    expectExperience(forged.body.data.experience);
    expect(
      forged.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code),
    ).toContain("no_ancient_treasure");
  });

  it("九塔、Boss、宗门和 PVP 返回异步多人玩法反馈", async () => {
    const attacker = await createP1Player(app, prisma, "进攻", "qi");
    const defender = await createP1Player(app, prisma, "防守", "body");

    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    const tower = towers.body.data.towers[0];
    const towerAction = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p1_tower_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 1 })
      .expect(201);
    expect(towerAction.body.data.contribution).toBeGreaterThan(0);
    expectExperience(towerAction.body.data.experience);

    const boss = await request(app.getHttpServer())
      .get("/api/multiplayer/boss")
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    const bossChallenge = await request(app.getHttpServer())
      .post("/api/multiplayer/boss/challenge")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p1_boss_${Date.now()}_${randomSuffix()}`)
      .send({ boss_id: boss.body.data.boss.boss_id })
      .expect(201);
    expect(bossChallenge.body.data.damage_done).toBeGreaterThan(0);
    expectExperience(bossChallenge.body.data.experience);

    await grantSpiritStone(prisma, attacker.playerId, 1000);
    await request(app.getHttpServer())
      .post("/api/multiplayer/sects/create")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p1_sect_create_${Date.now()}_${randomSuffix()}`)
      .send({ name: `青岚${randomSuffix()}`, alignment: "neutral" })
      .expect(201);
    const sectTask = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/tasks/complete")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p1_sect_task_${Date.now()}_${randomSuffix()}`)
      .send({ task_id: "sect_patrol" })
      .expect(201);
    expect(sectTask.body.data.contribution).toBeGreaterThan(0);
    expectExperience(sectTask.body.data.experience);

    const warehouseItemId = await createItem(
      prisma,
      attacker.playerId,
      "raw_iron",
      2,
      "unbound",
      "p1_test_seed",
    );
    const deposited = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p1_warehouse_deposit_${Date.now()}_${randomSuffix()}`)
      .send({ item_instance_id: warehouseItemId, count: 1 })
      .expect(201);
    expectExperience(deposited.body.data.experience);
    expect(
      deposited.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code),
    ).toContain("warehouse_whitelist");

    const withdrawn = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/withdraw")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p1_warehouse_withdraw_${Date.now()}_${randomSuffix()}`)
      .send({ item_id: "raw_iron", count: 1 })
      .expect(201);
    expectExperience(withdrawn.body.data.experience);
    expect(
      withdrawn.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code),
    ).toContain("warehouse_audit");

    const resources = await request(app.getHttpServer())
      .get("/api/multiplayer/resource-points")
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    const pvp = await request(app.getHttpServer())
      .post("/api/multiplayer/pvp/attack")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p1_pvp_${Date.now()}_${randomSuffix()}`)
      .send({
        defender_player_id: defender.playerId,
        resource_point_id: resources.body.data.resource_points[0].resource_point_id,
      })
      .expect(201);
    expect(pvp.body.data.battle.log.length).toBeGreaterThan(0);
    expectExperience(pvp.body.data.experience);
    expect(pvp.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code)).toContain(
      "loss_not_destroy",
    );
  });

  it("常驻机缘和九大古宝抽卡返回保底与来源反馈", async () => {
    const { token, playerId } = await createP1Player(app, prisma, "抽卡", "qi");
    await grantWallet(prisma, playerId, { jadeBound: 200 });

    const permanent = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_permanent_${Date.now()}_${randomSuffix()}`)
      .send({ pool_type: "permanent", cost_type: "bound_jade" })
      .expect(201);
    expect(permanent.body.data.result.result_type).toBe("item");
    expectExperience(permanent.body.data.experience);

    await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_monthly_${Date.now()}_${randomSuffix()}`)
      .send({ card_type: "small_monthly" })
      .expect(201);
    const claimed = await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/claim-daily")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_monthly_claim_${Date.now()}_${randomSuffix()}`)
      .send({ card_type: "small_monthly" })
      .expect(201);
    const ancient = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_ancient_${Date.now()}_${randomSuffix()}`)
      .send({
        pool_type: "ancient_treasure",
        cost_type: "monthly_grant",
        grant_id: claimed.body.data.grants[0].grant_id,
      })
      .expect(201);
    expect(ancient.body.data.result.result_type).toBe("ancient_treasure");
    expectExperience(ancient.body.data.experience);
    expect(
      ancient.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code),
    ).toContain("ancient_cost_limited");
  });
});

async function createP1Player(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p1_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p1_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

function expectExperience(experience: unknown) {
  expect(experience).toBeTruthy();
  const payload = experience as {
    timeline: unknown[];
    delta_summary: unknown[];
    reason_tags: unknown[];
    next_recommendations: unknown[];
  };
  expect(payload.timeline.length).toBeGreaterThan(0);
  expect(payload.delta_summary.length).toBeGreaterThan(0);
  expect(payload.reason_tags.length).toBeGreaterThan(0);
  expect(payload.next_recommendations.length).toBeGreaterThan(0);
}

async function grantMaterials(
  prisma: PrismaClient,
  playerId: string,
  input: { lowHerb: number; rawIron: number; spiritStone: number },
) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: BigInt(input.spiritStone) } },
  });

  if (input.lowHerb > 0) {
    await prisma.playerItem.create({
      data: {
        itemInstanceId: `item_p1_herb_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "low_herb",
        count: input.lowHerb,
        bindType: "bound",
        sourceType: "test_seed",
      },
    });
  }

  if (input.rawIron > 0) {
    await prisma.playerItem.create({
      data: {
        itemInstanceId: `item_p1_iron_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "raw_iron",
        count: input.rawIron,
        bindType: "bound",
        sourceType: "test_seed",
      },
    });
  }
}

async function grantSpiritStone(prisma: PrismaClient, playerId: string, amount: number) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: BigInt(amount) } },
  });
}

async function grantWallet(
  prisma: PrismaClient,
  playerId: string,
  input: { jadePaid?: number; jadeBound?: number },
) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: {
      jadePaid: input.jadePaid ? { increment: BigInt(input.jadePaid) } : undefined,
      jadeBound: input.jadeBound ? { increment: BigInt(input.jadeBound) } : undefined,
    },
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
  const itemInstanceId = `item_p1_${Date.now()}_${randomSuffix()}`;
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
