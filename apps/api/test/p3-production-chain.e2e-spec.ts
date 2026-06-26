import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { defaultEraId } from "../src/game/game.constants";
import { configureApp } from "../src/platform/configure-app";
import {
  buildProductionBalanceWarnings,
  materialSourceConfigs,
} from "../src/production/production.constants";

describe("P3-2 生产材料链", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p3-production-secret";
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

  it("无材料时丹方和器方返回缺口来源与预计补齐次数", async () => {
    const { token } = await createP3ProductionPlayer(app, prisma);

    const alchemy = await request(app.getHttpServer())
      .get("/api/production/alchemy/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const juling = alchemy.body.data.recipes.find(
      (recipe: { recipe_id: string }) => recipe.recipe_id === "recipe_juling_1",
    );
    expect(juling.recommendation.can_craft).toBe(false);
    expect(juling.recommendation.material_gaps[0].source_hints[0]).toMatchObject({
      action_label: "去冀州探索",
      source_type: "explore",
    });
    expect(juling.recommendation.material_gaps[0].shortage_hint).toContain("约");

    const forge = await request(app.getHttpServer())
      .get("/api/production/forge/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const sword = forge.body.data.recipes.find(
      (recipe: { recipe_id: string }) => recipe.recipe_id === "forge_xuantie_sword_1",
    );
    expect(sword.recommendation.can_craft).toBe(false);
    expect(sword.recommendation.material_gaps[0].source_hints[0].name).toContain("玄铁");
    expect(sword.recommendation.balance_warnings.length).toBeGreaterThan(0);
  });

  it("补齐材料和近期战报后，丹器推荐能解释推荐原因、标签和用途", async () => {
    const { token, playerId } = await createP3ProductionPlayer(app, prisma);
    await grantProductionMaterials(prisma, playerId);
    await createRecentExploreBattle(prisma, playerId);

    const alchemy = await request(app.getHttpServer())
      .get("/api/production/alchemy/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const recommendedAlchemy = alchemy.body.data.recipes.find(
      (recipe: { recommendation?: { recommended: boolean } }) => recipe.recommendation?.recommended,
    );
    expect(recommendedAlchemy.recommendation.priority_score).toBeGreaterThanOrEqual(60);
    expect(recommendedAlchemy.recommendation.reason).toContain("最近探索");
    expect(recommendedAlchemy.recommendation.recommendation_tags).toContain("近期掉落可衔接");
    expect(recommendedAlchemy.recommendation.usage_hint).toContain("服丹");

    const forge = await request(app.getHttpServer())
      .get("/api/production/forge/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const recommendedForge = forge.body.data.recipes.find(
      (recipe: { recipe_id: string }) => recipe.recipe_id === "forge_xuantie_sword_1",
    );
    expect(recommendedForge.recommendation.recommended).toBe(true);
    expect(recommendedForge.recommendation.next_action_hint).toMatch(/战报|词条/);
    expect(recommendedForge.recommendation.recommendation_tags).toContain("战报提示");
  });

  it("生产结果展示品质、词条、返还和下一步用途", async () => {
    const { token, playerId } = await createP3ProductionPlayer(app, prisma);
    await grantProductionMaterials(prisma, playerId);

    const alchemy = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_alchemy_${Date.now()}_${randomSuffix()}`)
      .send({ recipe_id: "recipe_juling_1" })
      .expect(201);
    expect(alchemy.body.data.experience.summary).toMatch(/品质|失败/);
    expect(alchemy.body.data.experience.next_recommendations[0].reason).toContain("递减");

    const forge = await request(app.getHttpServer())
      .post("/api/production/forge/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_forge_${Date.now()}_${randomSuffix()}`)
      .send({ recipe_id: "forge_xuantie_sword_1" })
      .expect(201);
    expect(forge.body.data.experience.summary).toContain("玄铁剑胚");
    expect(forge.body.data.experience.next_recommendations[0].reason).toContain("词条");
  });

  it("材料链配置与断供预警不包含付费或唯一战力产物", async () => {
    expect(materialSourceConfigs.length).toBeGreaterThanOrEqual(8);
    const warnings = buildProductionBalanceWarnings();
    expect(warnings.some((warning) => warning.item_id === "raw_iron")).toBe(true);

    const config = await request(app.getHttpServer()).get("/api/config/material_chain").expect(200);
    expect(config.body.data.config_version).toBe("material_chain_p3_v1");
    expect(config.body.data.payload.warnings.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(config.body.data.payload);
    expect(serialized).not.toContain("paid_jade_reward");
    expect(serialized).not.toContain("ancient_treasure_body");
    expect(config.body.data.payload.forbidden_outputs).toContain("paid_jade");
  });
});

async function createP3ProductionPlayer(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p3_production_${nonce}`, nickname: "P3丹器客" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p3_production_create_${nonce}`)
    .send({ name: `丹器${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: 0n },
  });

  return { token, playerId };
}

async function grantProductionMaterials(prisma: PrismaClient, playerId: string) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: 2000n },
  });
  await prisma.playerItem.createMany({
    data: [
      {
        itemInstanceId: `item_p3_herb_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "low_herb",
        count: 12n,
        bindType: "bound",
        sourceType: "p3_production_test",
      },
      {
        itemInstanceId: `item_p3_iron_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "raw_iron",
        count: 12n,
        bindType: "bound",
        sourceType: "p3_production_test",
      },
    ],
  });
}

async function createRecentExploreBattle(prisma: PrismaClient, playerId: string) {
  await prisma.battleLog.create({
    data: {
      battleId: `battle_p3_production_${Date.now()}_${randomSuffix()}`,
      playerId,
      eraId: defaultEraId,
      battleType: "explore",
      provinceId: "ji",
      enemyId: "ji_ta_shadow",
      enemyName: "塔影残魇",
      result: "win",
      rounds: 2,
      damageDone: 120,
      damageTaken: 36,
      rewardSnapshot: {
        items: [
          { item_id: "low_herb", name: "凝露草", count: 1, bind_type: "bound" },
          { item_id: "raw_iron", name: "玄铁砂", count: 1, bind_type: "bound" },
        ],
      },
      battleLog: [
        { round: 1, actor: "player", skill: "御火诀", damage: 70, target_hp: 50 },
        { round: 2, actor: "player", skill: "小周天剑气", damage: 50, target_hp: 0 },
      ],
    },
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
