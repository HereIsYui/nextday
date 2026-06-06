import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("M5 商业化与便利边界", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m5-test-secret";
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

  it("小月卡每日赠抽可抽九大古宝，并且重复幂等不重复扣赠抽", async () => {
    const { token, playerId } = await createM5Player(app, prisma, "月卡", "qi");
    const purchaseKey = `idem_m5_monthly_${Date.now()}_${randomSuffix()}`;
    const purchased = await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", purchaseKey)
      .send({ card_type: "small_monthly" })
      .expect(201);
    const repeatedPurchase = await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", purchaseKey)
      .send({ card_type: "small_monthly" })
      .expect(201);
    expect(repeatedPurchase.body.data.order_id).toBe(purchased.body.data.order_id);

    const claimed = await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/claim-daily")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_monthly_claim_${Date.now()}_${randomSuffix()}`)
      .send({ card_type: "small_monthly" })
      .expect(201);
    expect(claimed.body.data.claimed).toBe(true);
    expect(claimed.body.data.grants[0].draw_count).toBe(1);
    expect(claimed.body.data.wallet.jade_paid).toBe("30");
    expect(claimed.body.data.wallet.jade_bound).toBe("100");

    const grantId = claimed.body.data.grants[0].grant_id as string;
    const drawKey = `idem_m5_ancient_grant_${Date.now()}_${randomSuffix()}`;
    const draw = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", drawKey)
      .send({ pool_type: "ancient_treasure", cost_type: "monthly_grant", grant_id: grantId })
      .expect(201);
    const repeatedDraw = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", drawKey)
      .send({ pool_type: "ancient_treasure", cost_type: "monthly_grant", grant_id: grantId })
      .expect(201);

    expect(repeatedDraw.body.data.gacha_id).toBe(draw.body.data.gacha_id);
    expect(draw.body.data.result.result_type).toBe("ancient_treasure");

    const grant = await prisma.monthlyCardDrawGrant.findUniqueOrThrow({ where: { grantId } });
    const gachaCount = await prisma.gachaRecord.count({
      where: { playerId, poolType: "ancient_treasure", grantId },
    });
    const ownedTreasureCount = await prisma.ancientTreasureState.count({
      where: { playerId, owned: true },
    });
    expect(grant.usedCount).toBe(1);
    expect(gachaCount).toBe(1);
    expect(ownedTreasureCount).toBe(1);
  });

  it("九大古宝池不能用仙玉直抽，只能用残页合成或月卡赠抽", async () => {
    const { token, playerId } = await createM5Player(app, prisma, "古宝", "qi");
    await grantWallet(prisma, playerId, { jadePaid: 1000, jadeBound: 1000 });

    const pools = await request(app.getHttpServer())
      .get("/api/commerce/gacha/pools")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const ancientPool = pools.body.data.pools.find(
      (pool: { pool_type: string }) => pool.pool_type === "ancient_treasure",
    );
    expect(ancientPool.allowed_cost_types).toEqual(["monthly_grant", "ancient_page"]);
    expect(ancientPool.result_ids).toHaveLength(9);

    await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_paid_ancient_${Date.now()}_${randomSuffix()}`)
      .send({ pool_type: "ancient_treasure", cost_type: "paid_jade" })
      .expect(403);
    await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_reserved_ancient_${Date.now()}_${randomSuffix()}`)
      .send({ pool_type: "ancient_treasure", cost_type: "reserved_paid_jade" })
      .expect(403);

    const walletAfterRejected = await prisma.playerWallet.findUniqueOrThrow({
      where: { playerId },
    });
    const rejectedRecordCount = await prisma.gachaRecord.count({
      where: { playerId, poolType: "ancient_treasure" },
    });
    expect(walletAfterRejected.jadePaid.toString()).toBe("1000");
    expect(rejectedRecordCount).toBe(0);

    await createItem(prisma, playerId, "ancient_page", 30, "bound", "m5_test");
    const pageDraw = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_page_ancient_${Date.now()}_${randomSuffix()}`)
      .send({ pool_type: "ancient_treasure", cost_type: "ancient_page" })
      .expect(201);

    expect(pageDraw.body.data.result.result_type).toBe("ancient_treasure");
    const pagesLeft = await prisma.playerItem.count({
      where: { playerId, itemId: "ancient_page", count: { gt: 0 } },
    });
    expect(pagesLeft).toBe(0);
  });

  it("常驻机缘池支持绑定仙玉抽取、保底记录和历史回放", async () => {
    const { token, playerId } = await createM5Player(app, prisma, "机缘", "body");
    await grantWallet(prisma, playerId, { jadeBound: 200 });

    const drawKey = `idem_m5_permanent_${Date.now()}_${randomSuffix()}`;
    const draw = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", drawKey)
      .send({ pool_type: "permanent", cost_type: "bound_jade" })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", drawKey)
      .send({ pool_type: "permanent", cost_type: "bound_jade" })
      .expect(201);

    expect(repeated.body.data.gacha_id).toBe(draw.body.data.gacha_id);
    expect(draw.body.data.wallet.jade_bound).toBe("100");
    expect(draw.body.data.result.result_type).toBe("item");

    const pity = await prisma.gachaPityState.findUniqueOrThrow({
      where: {
        playerId_eraId_poolType: {
          playerId,
          eraId: "era_mvp_001",
          poolType: "permanent",
        },
      },
    });
    expect(pity.totalDraws).toBe(1);

    const history = await request(app.getHttpServer())
      .get("/api/commerce/gacha/history")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(history.body.data.records[0].gacha_id).toBe(draw.body.data.gacha_id);
  });

  it("VIP 与月卡便利梯度生效，免费脚本不能创建大月卡托管队列", async () => {
    const { token } = await createM5Player(app, prisma, "便利", "qi");

    const freePreview = await request(app.getHttpServer())
      .post("/api/commerce/convenience/batch-preview")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_free_preview_${Date.now()}_${randomSuffix()}`)
      .send({ requested_count: 20 })
      .expect(201);
    expect(freePreview.body.data.accepted_count).toBe(5);
    expect(freePreview.body.data.reward_multiplier).toBe(1);

    await request(app.getHttpServer())
      .post("/api/commerce/convenience/automation-queues")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_free_queue_${Date.now()}_${randomSuffix()}`)
      .send({ queue_type: "core_daily", actions: [{ action_type: "explore", count: 20 }] })
      .expect(403);

    await request(app.getHttpServer())
      .post("/api/commerce/vip/sync")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_vip3_${Date.now()}_${randomSuffix()}`)
      .send({ vip_level: 3, active_days: 30 })
      .expect(201);
    const vip3Overview = await request(app.getHttpServer())
      .get("/api/commerce/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(vip3Overview.body.data.effective_tier).toBe("vip3");
    expect(vip3Overview.body.data.convenience.batch_sweep_limit).toBe(10);
    expect(vip3Overview.body.data.available_monthly_grants).toHaveLength(0);

    await request(app.getHttpServer())
      .post("/api/commerce/vip/sync")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_vip4_${Date.now()}_${randomSuffix()}`)
      .send({ vip_level: 4, active_days: 30 })
      .expect(201);
    const vip4Queue = await request(app.getHttpServer())
      .post("/api/commerce/convenience/automation-queues")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_vip4_queue_${Date.now()}_${randomSuffix()}`)
      .send({
        queue_type: "simple_cross_play",
        actions: [{ action_type: "tower" }, { action_type: "boss" }],
      })
      .expect(201);
    expect(vip4Queue.body.data.convenience.batch_sweep_limit).toBe(15);

    await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_large_purchase_${Date.now()}_${randomSuffix()}`)
      .send({ card_type: "large_monthly" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/claim-daily")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_large_claim_${Date.now()}_${randomSuffix()}`)
      .send({ card_type: "large_monthly" })
      .expect(201);
    const largeOverview = await request(app.getHttpServer())
      .get("/api/commerce/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(largeOverview.body.data.effective_tier).toBe("large_monthly");
    expect(largeOverview.body.data.convenience.batch_sweep_limit).toBe(20);
    expect(largeOverview.body.data.available_monthly_grants[0].draw_count).toBe(2);
  });

  it("展示外观可领取和装备，但不提供战力或贡献倍率", async () => {
    const { token, playerId } = await createM5Player(app, prisma, "外观", "body");
    const before = await prisma.player.findUniqueOrThrow({ where: { playerId } });
    const claimed = await request(app.getHttpServer())
      .post("/api/commerce/appearances/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_appearance_claim_${Date.now()}_${randomSuffix()}`)
      .send({ appearance_id: "title_style_qingtian" })
      .expect(201);
    expect(claimed.body.data.appearance.stat_bonus).toBeNull();

    const equipped = await request(app.getHttpServer())
      .post("/api/commerce/appearances/equip")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m5_appearance_equip_${Date.now()}_${randomSuffix()}`)
      .send({ appearance_id: "title_style_qingtian" })
      .expect(201);
    expect(equipped.body.data.appearance.equipped).toBe(true);
    expect(equipped.body.data.appearance.stat_bonus).toBeNull();

    const after = await prisma.player.findUniqueOrThrow({ where: { playerId } });
    expect(after.currentLevel).toBe(before.currentLevel);
    expect(after.currentRealm).toBe(before.currentRealm);
  });

  it("M5 配置类型返回合法 envelope", async () => {
    for (const configType of ["gacha", "monthly_card", "vip", "convenience", "appearance"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .expect(200);

      expect(response.body.data.config_type).toBe(configType);
      expect(response.body.data.ruleset_version).toBe("ruleset_m5_v1");
    }
  });
});

async function createM5Player(
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
    .send({ device_id: `m5_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m5_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
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
  const itemInstanceId = `item_m5_${Date.now()}_${randomSuffix()}`;
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
