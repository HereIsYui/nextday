import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("文字修行炼制效果", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "text-production-effects-test-secret";
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

  it("破障效果让总览可突破状态与实际突破一致，并在成功后消耗", async () => {
    const { token, playerId } = await createTextProductionPlayer(app, "破障");
    const itemInstanceId = await seedPill(prisma, {
      playerId,
      itemId: "pill_barrier_breaking",
      quality: "middle",
      pillEffect: "breakthrough_support",
      pillType: "breakthrough",
      effectValue: 240,
    });

    const used = await request(app.getHttpServer())
      .post("/api/production/pills/use")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_text_effect_breakthrough_use_${randomSuffix()}`)
      .send({ item_instance_id: itemInstanceId })
      .expect(201);

    const supportValue = Number(used.body.data.effect_value);
    expect(used.body.data.pill_effect).toBe("breakthrough_support");
    expect(supportValue).toBe(240);

    const activeEffect = await findProductionEffect(prisma, playerId, "breakthrough_support");
    expect(activeEffect).toMatchObject({
      effectValue: supportValue,
      remainingUses: 1,
      sourceItemId: "pill_barrier_breaking",
      sourcePillUseRecordId: used.body.data.record_id,
    });
    expect(activeEffect.consumedAt).toBeNull();

    const requirementOverview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const breakthroughRequirement = BigInt(
      requirementOverview.body.data.cultivation.breakthrough_required,
    );
    expect(BigInt(supportValue)).toBeLessThan(breakthroughRequirement);

    await prisma.player.update({
      where: { playerId },
      data: { currentRealm: 1, currentLevel: 9 },
    });
    await prisma.playerProgress.update({
      where: { playerId },
      data: { cultivationValue: breakthroughRequirement - BigInt(supportValue) },
    });

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(overview.body.data.cultivation).toMatchObject({
      can_breakthrough: true,
      breakthrough_support: String(supportValue),
      effective_breakthrough_required: String(breakthroughRequirement - BigInt(supportValue)),
    });

    const breakthroughKey = `idem_text_effect_breakthrough_${randomSuffix()}`;
    const breakthrough = await request(app.getHttpServer())
      .post("/api/game/cultivation/breakthrough")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", breakthroughKey)
      .expect(201);
    expect(breakthrough.body.data).toMatchObject({ success: true });

    const consumedEffect = await findProductionEffect(prisma, playerId, "breakthrough_support");
    expect(consumedEffect).toMatchObject({
      effectId: activeEffect.effectId,
      remainingUses: 0,
    });
    expect(consumedEffect.consumedAt).toBeTruthy();

    const afterOverview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(afterOverview.body.data.cultivation).toMatchObject({
      can_breakthrough: false,
      breakthrough_support: "0",
    });
  });

  it("行云效果记录实际药力，探索仅加成修为与灵石且幂等重放不重复消费", async () => {
    const { token, playerId } = await createTextProductionPlayer(app, "行云");
    const itemInstanceId = await seedPill(prisma, {
      playerId,
      itemId: "pill_cloud_walking",
      quality: "high",
      pillEffect: "explore_boost",
      pillType: "explore",
      effectValue: 17,
    });

    const used = await request(app.getHttpServer())
      .post("/api/production/pills/use")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_text_effect_explore_use_${randomSuffix()}`)
      .send({ item_instance_id: itemInstanceId })
      .expect(201);

    const actualBoost = Number(used.body.data.effect_value);
    expect(used.body.data).toMatchObject({
      pill_effect: "explore_boost",
      effective_rate: 100,
      next_explore_bonus_percent: actualBoost,
    });
    expect(actualBoost).toBe(20);

    const activeEffect = await findProductionEffect(prisma, playerId, "explore_boost");
    expect(activeEffect).toMatchObject({
      effectValue: actualBoost,
      remainingUses: 1,
      sourceItemId: "pill_cloud_walking",
      sourcePillUseRecordId: used.body.data.record_id,
    });
    expect(activeEffect.consumedAt).toBeNull();

    await prisma.player.update({
      where: { playerId },
      data: { currentRealm: 9, currentLevel: 9 },
    });
    await prisma.playerProgress.update({
      where: { playerId },
      data: { cultivationValue: 0n },
    });
    await prisma.playerWallet.update({
      where: { playerId },
      data: { spiritStone: 0n },
    });
    await prisma.playerActionState.update({
      where: { playerId },
      data: { actionPoints: 10, lastRecoveredAt: new Date() },
    });

    const exploreKey = `idem_text_effect_explore_${randomSuffix()}`;
    const started = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", exploreKey)
      .send({ province_id: "ji", count: 1 })
      .expect(201);
    const replayed = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", exploreKey)
      .send({ province_id: "ji", count: 1 })
      .expect(201);

    expect(replayed.body.data).toEqual(started.body.data);
    expect(started.body.data.explore_boost_percent).toBe(actualBoost);

    const consumedEffect = await findProductionEffect(prisma, playerId, "explore_boost");
    expect(consumedEffect).toMatchObject({
      effectId: activeEffect.effectId,
      remainingUses: 0,
    });
    expect(consumedEffect.consumedAt).toBeTruthy();

    await prisma.exploreActionRecord.update({
      where: { recordId: started.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1_000) },
    });
    const claimed = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_text_effect_explore_claim_${randomSuffix()}`)
      .send({ record_id: started.body.data.record_id })
      .expect(201);

    const expectedCultivation = (40n * (100n + BigInt(actualBoost))) / 100n;
    const expectedSpiritStone = (35n * (100n + BigInt(actualBoost))) / 100n;
    expect(claimed.body.data.rewards).toMatchObject({
      cultivation: expectedCultivation.toString(),
      spirit_stone: expectedSpiritStone.toString(),
    });
    expect(claimed.body.data.rewards.items).toEqual([
      expect.objectContaining({ count: 1, bind_type: "bound" }),
    ]);

    const rewardItemId = claimed.body.data.rewards.items[0].item_id as string;
    const rewardItems = await prisma.playerItem.findMany({
      where: { playerId, itemId: rewardItemId, sourceType: "explore" },
    });
    expect(rewardItems.reduce((total, item) => total + item.count, 0n)).toBe(1n);

    const [progress, wallet, record] = await Promise.all([
      prisma.playerProgress.findUniqueOrThrow({ where: { playerId } }),
      prisma.playerWallet.findUniqueOrThrow({ where: { playerId } }),
      prisma.exploreActionRecord.findUniqueOrThrow({
        where: { recordId: started.body.data.record_id },
      }),
    ]);
    expect(progress.cultivationValue).toBe(expectedCultivation);
    expect(wallet.spiritStone).toBe(expectedSpiritStone);
    expect(record.exploreBoostPercent).toBe(actualBoost);

    const nextExplore = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_text_effect_explore_next_${randomSuffix()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);
    expect(nextExplore.body.data.explore_boost_percent).toBe(0);
  });
});

async function createTextProductionPlayer(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string; playerId: string }> {
  const suffix = randomSuffix();
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({
      device_id: `text_production_effect_${namePrefix}_${suffix}`,
      nickname: `${namePrefix}道友`,
    })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_text_production_create_${suffix}`)
    .send({ name: `${namePrefix}${suffix}`.slice(0, 16), route: "qi" })
    .expect(201);

  return {
    token,
    playerId: createResponse.body.data.profile.player.player_id as string,
  };
}

async function seedPill(
  prisma: PrismaClient,
  input: {
    playerId: string;
    itemId: "pill_barrier_breaking" | "pill_cloud_walking";
    quality: "middle" | "high";
    pillEffect: "breakthrough_support" | "explore_boost";
    pillType: "breakthrough" | "explore";
    effectValue: number;
  },
): Promise<string> {
  const itemInstanceId = `item_text_effect_${input.itemId}_${randomSuffix()}`;
  await prisma.playerItem.create({
    data: {
      itemInstanceId,
      playerId: input.playerId,
      itemId: input.itemId,
      count: 1n,
      bindType: "bound",
      sourceType: "text_production_effect_test",
      metadata: {
        quality: input.quality,
        pill_effect: input.pillEffect,
        pill_type: input.pillType,
        pill_rank: 1,
        effect_value: input.effectValue,
      },
    },
  });
  return itemInstanceId;
}

async function findProductionEffect(
  prisma: PrismaClient,
  playerId: string,
  effectType: "breakthrough_support" | "explore_boost",
) {
  const effect = await prisma.playerProductionEffect.findFirst({
    where: { playerId, effectType },
    orderBy: { createdAt: "asc" },
  });
  if (!effect) {
    throw new Error("未找到预期的炼制效果记录");
  }
  return effect;
}

function randomSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
