import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P1 完整排行、称号继承和排行防刷", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-rank-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();
    await cleanupRankTestData(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("生产榜、纪元榜、内天地榜和阵营榜会生成可追溯快照", async () => {
    const main = await createRankPlayer(app, prisma, "榜首", "qi");
    const rival = await createRankPlayer(app, prisma, "陪跑", "body");
    await seedRankPower(prisma, main, {
      productionScore: 80_000,
      innerScore: 40_000,
      route: "immortal",
      reputation: 600,
    });
    await seedRankPower(prisma, rival, {
      productionScore: 5_000,
      innerScore: 3_000,
      route: "demon",
      reputation: 120,
    });

    for (const rankType of ["production", "era", "inner_world", "faction"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/multiplayer/ranks/${rankType}`)
        .set("Authorization", `Bearer ${main.token}`)
        .expect(200);

      expect(response.body.data.rank_type).toBe(rankType);
      expect(response.body.data.snapshot_id).toBeTruthy();
      expect(response.body.data.reward_boundary).toContain("不发唯一战力道具");
      expect(JSON.stringify(response.body.data.entries)).not.toContain("unique");
      expect(JSON.stringify(response.body.data.entries)).not.toContain("限定法宝");

      const snapshot = await prisma.rankSnapshot.findUnique({
        where: { rankSnapshotId: response.body.data.snapshot_id },
        include: { entries: true },
      });
      expect(snapshot?.rankType).toBe(rankType);
      expect(snapshot?.entries.length).toBe(response.body.data.entries.length);
    }

    const factionRank = await request(app.getHttpServer())
      .get("/api/multiplayer/ranks/faction")
      .set("Authorization", `Bearer ${main.token}`)
      .expect(200);
    expect(factionRank.body.data.entries[0].target_type).toBe("faction");
    expect(
      factionRank.body.data.entries.some(
        (item: { target_id: string; target_type: string }) =>
          item.target_type === "faction" && item.target_id === "immortal",
      ),
    ).toBe(true);
  });

  it("排行称号可继承展示，纪元祝福有效值被限制在 1%", async () => {
    const player = await createRankPlayer(app, prisma, "称号", "qi");
    await seedRankPower(prisma, player, {
      productionScore: 12_000_000,
      innerScore: 8_000_000,
      route: "wanderer",
      reputation: 1_200_000,
    });

    const before = await request(app.getHttpServer())
      .get("/api/multiplayer/titles")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);
    expect(before.body.data.era_blessing.effective_percent).toBeLessThanOrEqual(1);

    const idempotencyKey = `idem_p1_rank_title_${Date.now()}_${randomSuffix()}`;
    const claimed = await request(app.getHttpServer())
      .post("/api/multiplayer/titles/claim-rank")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ rank_type: "era" })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/multiplayer/titles/claim-rank")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ rank_type: "era" })
      .expect(201);

    expect(repeated.body.data.appearance.appearance_id).toBe(
      claimed.body.data.appearance.appearance_id,
    );
    expect(claimed.body.data.appearance.inherited).toBe(true);
    expect(claimed.body.data.appearance.stat_bonus).toBeNull();
    expect(claimed.body.data.collection.era_blessing.effective_percent).toBeLessThanOrEqual(1);
    expect(
      await prisma.playerAppearance.count({
        where: { playerId: player.playerId, sourceType: "era_rank", inherited: true },
      }),
    ).toBeGreaterThan(0);
  });

  it("排行会排除延迟结算贡献，并标记近期风控玩家", async () => {
    const player = await createRankPlayer(app, prisma, "风控", "body");
    await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);
    await prisma.towerActionRecord.create({
      data: {
        recordId: `tower_settled_p1_rank_${Date.now()}_${randomSuffix()}`,
        playerId: player.playerId,
        eraId: "era_mvp_001",
        towerId: "tower_xuantie",
        actionType: "seal",
        count: 1,
        contribution: 100_000_000,
        actionPointCost: 0,
        rewardSnapshot: {},
        settlementStatus: "settled",
        configVersion: "rank_test",
      },
    });
    await prisma.towerActionRecord.create({
      data: {
        recordId: `tower_delayed_p1_rank_${Date.now()}_${randomSuffix()}`,
        playerId: player.playerId,
        eraId: "era_mvp_001",
        towerId: "tower_xuantie",
        actionType: "seal",
        count: 1,
        contribution: 999_999,
        actionPointCost: 0,
        rewardSnapshot: {},
        settlementStatus: "delayed",
        configVersion: "rank_test",
      },
    });
    await prisma.behaviorRiskRecord.create({
      data: {
        riskRecordId: `risk_p1_rank_${Date.now()}_${randomSuffix()}`,
        accountId: player.accountId,
        playerId: player.playerId,
        eraId: "era_mvp_001",
        riskDomain: "rank",
        actionType: "rank_score_review",
        targetType: "player",
        targetId: player.playerId,
        riskStatus: "manual_review",
        riskLevel: "high",
        riskScore: 80,
        ruleCodes: ["same_ip_multi_account", "rank_score_review"],
        decisionAction: "manual_review",
        settlementStatus: "delayed",
        metadata: { reason: "测试排行风控标记" },
        riskRulesetVersion: "risk_m6_v1",
      },
    });

    const towerRank = await request(app.getHttpServer())
      .get("/api/multiplayer/ranks/tower_week")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);

    expect(towerRank.body.data.anti_brush_summary.excluded_delayed_count).toBeGreaterThan(0);
    const entry = towerRank.body.data.entries.find(
      (item: { target_id: string }) => item.target_id === player.playerId,
    );
    expect(entry?.risk_note).toContain("风控记录");
    expect(BigInt(entry.score)).toBe(100_000_000n);
  });

  it("P1 排行配置和后台发布校验会拒绝付费直给、唯一战力和祝福超限", async () => {
    const config = await request(app.getHttpServer()).get("/api/config/era_rank").expect(200);
    expect(config.body.data.config_type).toBe("era_rank");
    expect(config.body.data.payload.era_blessing.cap_percent).toBe(1);
    expect(config.body.data.payload.rank_types).toContain("faction");

    const rejected = await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", "nextday-admin-dev")
      .set("Idempotency-Key", `idem_p1_rank_bad_config_${Date.now()}_${randomSuffix()}`)
      .send({
        config_type: "era_rank",
        config_version: `era_rank_bad_${Date.now()}`,
        payload: {
          rank_types: ["era"],
          era_blessing: { cap_percent: 2 },
          reward_preview: { jade_paid: "1", unique_power: "必胜称号" },
        },
      })
      .expect(400);

    expect(rejected.body.message).toContain("排行配置不能包含");
  });
});

async function createRankPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string; accountId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix}${Date.now().toString(36).slice(-5)}${randomSuffix()}`.slice(
    0,
    16,
  );
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p1_rank_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const accountId = loginResponse.body.data.account.account_id as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p1_rank_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await request(app.getHttpServer())
    .get("/api/game/overview")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  await prisma.player.update({
    where: { playerId },
    data: { currentRealm: 5, currentStage: 3, currentLevel: 7 },
  });
  await prisma.playerProgress.update({
    where: { playerId },
    data: { chapterId: 5 },
  });

  return { token, playerId, accountId };
}

async function seedRankPower(
  prisma: PrismaClient,
  player: { playerId: string },
  input: {
    productionScore: number;
    innerScore: number;
    route: "immortal" | "demon" | "wanderer";
    reputation: number;
  },
) {
  await prisma.alchemyRecord.create({
    data: {
      recordId: `alchemy_p1_rank_${Date.now()}_${randomSuffix()}`,
      playerId: player.playerId,
      eraId: "era_mvp_001",
      recipeId: "rank_test_recipe",
      pillItemId: "rank_test_pill",
      quality: "flawless",
      success: true,
      count: Math.max(1, Math.floor(input.productionScore / 70)),
      materialSnapshot: {},
      resultSnapshot: {},
      configVersion: "rank_test",
      rewardConfigVersion: "rank_test_reward",
    },
  });
  await prisma.equipmentOperationRecord.create({
    data: {
      recordId: `equip_op_p1_rank_${Date.now()}_${randomSuffix()}`,
      playerId: player.playerId,
      eraId: "era_mvp_001",
      operationType: "forge",
      materialSnapshot: {},
      resultSnapshot: {},
      configVersion: "rank_test",
    },
  });
  await prisma.innerWorldState.upsert({
    where: { playerId: player.playerId },
    create: {
      playerId: player.playerId,
      eraId: "era_mvp_001",
      worldLevel: Math.max(1, Math.floor(input.innerScore / 10_000)),
      lawLevel: 2,
      lawExp: input.innerScore,
      configVersion: "rank_test",
      rewardConfigVersion: "rank_test_reward",
    },
    update: {
      worldLevel: Math.max(1, Math.floor(input.innerScore / 10_000)),
      lawLevel: 2,
      lawExp: input.innerScore,
      configVersion: "rank_test",
      rewardConfigVersion: "rank_test_reward",
    },
  });
  await prisma.innerWorldLawRecord.create({
    data: {
      lawRecordId: `law_p1_rank_${Date.now()}_${randomSuffix()}`,
      playerId: player.playerId,
      eraId: "era_mvp_001",
      lawType: "rank_test_law",
      expDelta: input.innerScore,
      sourceType: "rank_test",
      sourceId: player.playerId,
      beforeLevel: 1,
      afterLevel: 2,
      beforeExp: 0,
      afterExp: input.innerScore,
      configVersion: "rank_test",
    },
  });
  await prisma.playerFactionState.upsert({
    where: { playerId: player.playerId },
    create: {
      playerId: player.playerId,
      eraId: "era_mvp_001",
      route: input.route,
      reputationImmortal: input.route === "immortal" ? input.reputation : 0,
      reputationDemon: input.route === "demon" ? input.reputation : 0,
      reputationWanderer: input.route === "wanderer" ? input.reputation : 0,
      configVersion: "rank_test",
      rewardConfigVersion: "rank_test_reward",
    },
    update: {
      route: input.route,
      reputationImmortal: input.route === "immortal" ? input.reputation : 0,
      reputationDemon: input.route === "demon" ? input.reputation : 0,
      reputationWanderer: input.route === "wanderer" ? input.reputation : 0,
      configVersion: "rank_test",
      rewardConfigVersion: "rank_test_reward",
    },
  });
  await prisma.player.update({
    where: { playerId: player.playerId },
    data: { alignment: input.route },
  });
}

async function cleanupRankTestData(prisma: PrismaClient) {
  await prisma.alchemyRecord.deleteMany({ where: { configVersion: "rank_test" } });
  await prisma.equipmentOperationRecord.deleteMany({ where: { configVersion: "rank_test" } });
  await prisma.innerWorldLawRecord.deleteMany({ where: { configVersion: "rank_test" } });
  await prisma.innerWorldState.deleteMany({ where: { configVersion: "rank_test" } });
  await prisma.playerFactionState.deleteMany({ where: { configVersion: "rank_test" } });
  await prisma.towerActionRecord.deleteMany({ where: { configVersion: "rank_test" } });
  await prisma.behaviorRiskRecord.deleteMany({
    where: { riskDomain: "rank", riskRulesetVersion: "risk_m6_v1" },
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
