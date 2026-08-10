import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";
import { getMaterialCompositionHash } from "../src/production/production.constants";

const adminToken = "nextday-admin-dev";

describe("M9 MVP 总体验收与小纪元演练", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // 测试文件在同一 Vitest 进程中运行，必须固定本文件的密钥，避免复用其他测试的环境变量。
    process.env.JWT_SECRET = "m9-test-secret";
    process.env.ADMIN_DEV_TOKEN = adminToken;

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

  it("P0 配置入口覆盖核心系统并可自动回归", async () => {
    const configTypes = [
      "realm",
      "item",
      "reward",
      "action",
      "world",
      "task",
      "battle",
      "cave",
      "pill",
      "forge",
      "skill",
      "bag",
      "tower",
      "boss",
      "sect",
      "rank",
      "gacha",
      "monthly_card",
      "vip",
      "convenience",
      "appearance",
      "risk",
    ];

    for (const configType of configTypes) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .expect(200);

      expect(response.body.data.config_type).toBe(configType);
      expect(response.body.data.config_version).toBeTruthy();
      expect(response.body.data.ruleset_version).toBeTruthy();
      expect(response.body.data.reward_config_version).toBeTruthy();
      expect(response.body.data.payload).toBeTruthy();
    }
  });

  it("30-45 天小纪元压缩演练能产出排行、称号、邮件和复盘数据", async () => {
    const leader = await createM9Player(app, prisma, "纪元甲", "qi");
    const attacker = await createM9Player(app, prisma, "纪元乙", "body");
    const support = await createM9Player(app, prisma, "纪元丁", "qi");
    for (const player of [leader, attacker, support]) {
      await seedM9Resources(prisma, player.playerId);
    }
    await prisma.player.update({
      where: { playerId: attacker.playerId },
      data: { currentRealm: 2, currentStage: 3, currentLevel: 4 },
    });

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    expect(overview.body.data.provinces).toHaveLength(9);
    expect(
      overview.body.data.tasks.some(
        (task: { task_id: string }) => task.task_id === "daily_explore",
      ),
    ).toBe(true);

    const cultivationStartKey = `idem_m9_cultivation_start_${randomSuffix()}`;
    await request(app.getHttpServer())
      .post("/api/game/actions/start")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", cultivationStartKey)
      .send({ action_type: "cultivation" })
      .expect(201);
    await prisma.playerActionState.update({
      where: { playerId: leader.playerId },
      data: { activeActionStartedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await request(app.getHttpServer())
      .post("/api/game/actions/end")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_cultivation_end_${randomSuffix()}`)
      .expect(201);
    const claimKey = `idem_m9_cultivation_${randomSuffix()}`;
    const claim = await request(app.getHttpServer())
      .post("/api/game/actions/claim")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", claimKey)
      .expect(201);
    const repeatedClaim = await request(app.getHttpServer())
      .post("/api/game/actions/claim")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", claimKey)
      .expect(201);
    expect(repeatedClaim.body.data.rewards.cultivation).toBe(claim.body.data.rewards.cultivation);

    await request(app.getHttpServer())
      .post("/api/production/skills/loadout")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_skill_${randomSuffix()}`)
      .send({
        active_skill_ids: ["skill_lingdun", "skill_yuhuo", "skill_xiaozhoutian"],
        treasure_skill_id: "skill_benming_faguang",
        auto_priority: [
          "skill_benming_faguang",
          "skill_xiaozhoutian",
          "skill_yuhuo",
          "skill_lingdun",
        ],
      })
      .expect(201);

    const exploreKey = `idem_m9_explore_${randomSuffix()}`;
    const explored = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", exploreKey)
      .send({ province_id: "ji" })
      .expect(201);
    const repeatedExplore = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", exploreKey)
      .send({ province_id: "ji" })
      .expect(201);
    expect(repeatedExplore.body.data.action.action_id).toBe(explored.body.data.action.action_id);
    expect(explored.body.data.action.status).toBe("active");
    await prisma.exploreActionRecord.update({
      where: { recordId: explored.body.data.action.action_id },
      data: {
        lastSettledAt: new Date(Date.now() - 24 * 60 * 60_000),
        lastActiveAt: new Date(),
      },
    });
    await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const overviewAfterExplore = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    expect(
      overviewAfterExplore.body.data.tasks.find(
        (task: { task_id: string }) => task.task_id === "daily_explore",
      )?.status,
    ).toBe("completed");

    await request(app.getHttpServer())
      .post("/api/game/tasks/claim")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_task_${randomSuffix()}`)
      .send({ task_id: "novice_create_role" })
      .expect(201);

    const cave = await request(app.getHttpServer())
      .post("/api/game/cave/collect")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_cave_${randomSuffix()}`)
      .expect(201);
    expect(Number(cave.body.data.rewards.spirit_stone)).toBeGreaterThan(0);

    const alchemyMaterials = [
      { item_id: "alch_moon_dew_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    const alchemy = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", findCraftSuccessKey("m9_alchemy", "alchemy", alchemyMaterials, 8800))
      .send({ materials: alchemyMaterials })
      .expect(201);
    expect(alchemy.body.data.record.success).toBe(true);
    const pill = alchemy.body.data.bag.items.find(
      (item: { item_id: string }) => item.item_id === "pill_nourishing_essence",
    );
    expect(pill).toBeTruthy();
    await request(app.getHttpServer())
      .post("/api/production/pills/use")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_pill_${randomSuffix()}`)
      .send({ item_instance_id: pill.item_instance_id })
      .expect(201);

    const forgeMaterials = [
      { item_id: "forge_star_iron", count: 3 },
      { item_id: "forge_spiritwood_core", count: 1 },
    ];
    const forged = await request(app.getHttpServer())
      .post("/api/production/forge/craft")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", findCraftSuccessKey("m9_forge", "forge", forgeMaterials, 9000))
      .send({ materials: forgeMaterials })
      .expect(201);
    expect(forged.body.data.equipment.name).not.toContain("古宝");
    await request(app.getHttpServer())
      .post("/api/production/equipment/refine")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_refine_${randomSuffix()}`)
      .send({ equipment_instance_id: forged.body.data.equipment.equipment_instance_id })
      .expect(201);

    const sect = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/create")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_sect_create_${randomSuffix()}`)
      .send({ name: `纪元宗${randomSuffix().slice(0, 3)}`, alignment: "neutral" })
      .expect(201);
    const sectId = sect.body.data.sect.sect_id as string;
    for (const player of [attacker, support]) {
      await request(app.getHttpServer())
        .post("/api/multiplayer/sects/join")
        .set("Authorization", `Bearer ${player.token}`)
        .set("Idempotency-Key", `idem_m9_sect_join_${player.playerId}_${randomSuffix()}`)
        .send({ sect_id: sectId })
        .expect(201);
    }
    for (const player of [leader, support]) {
      await request(app.getHttpServer())
        .post("/api/multiplayer/sects/tasks/complete")
        .set("Authorization", `Bearer ${player.token}`)
        .set("Idempotency-Key", `idem_m9_sect_task_${player.playerId}_${randomSuffix()}`)
        .send({ task_id: "sect_patrol" })
        .expect(201);
    }
    const warehouseItemId = await createItem(
      prisma,
      leader.playerId,
      "raw_iron",
      2,
      "unbound",
      "test_seed",
    );
    const warehouse = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_warehouse_${randomSuffix()}`)
      .send({ item_instance_id: warehouseItemId, count: 1 })
      .expect(201);
    expect(
      warehouse.body.data.warehouse.some(
        (item: { item_id: string }) => item.item_id === "raw_iron",
      ),
    ).toBe(true);

    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const towerIds = towers.body.data.towers.map((tower: { tower_id: string }) => tower.tower_id);
    for (const towerId of towerIds) {
      await request(app.getHttpServer())
        .post("/api/multiplayer/towers/action")
        .set("Authorization", `Bearer ${leader.token}`)
        .set("Idempotency-Key", `idem_m9_tower_${towerId}_${randomSuffix()}`)
        .send({ tower_id: towerId, action_type: "supply", count: 5 })
        .expect(201);
    }
    let delayedTowerRiskId: string | null = null;
    for (let index = 0; index < 4; index += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/multiplayer/towers/action")
        .set("Authorization", `Bearer ${support.token}`)
        .set("Idempotency-Key", `idem_m9_tower_repeat_${index}_${randomSuffix()}`)
        .send({ tower_id: towerIds[0], action_type: "supply", count: 1 })
        .expect(201);
      delayedTowerRiskId = response.body.data.risk_record_id ?? delayedTowerRiskId;
    }
    expect(delayedTowerRiskId).toBeTruthy();

    const boss = await request(app.getHttpServer())
      .get("/api/multiplayer/boss")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/multiplayer/boss/challenge")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_boss_${randomSuffix()}`)
      .send({ boss_id: boss.body.data.boss.boss_id })
      .expect(201);

    const purchaseKey = `idem_m9_monthly_${randomSuffix()}`;
    const purchased = await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/purchase")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", purchaseKey)
      .send({ card_type: "small_monthly", development_token: process.env.COMMERCE_MOCK_TOKEN })
      .expect(201);
    const repeatedPurchase = await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/purchase")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", purchaseKey)
      .send({ card_type: "small_monthly", development_token: process.env.COMMERCE_MOCK_TOKEN })
      .expect(201);
    expect(repeatedPurchase.body.data.order_id).toBe(purchased.body.data.order_id);
    const monthlyClaim = await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/claim-daily")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_monthly_claim_${randomSuffix()}`)
      .send({ card_type: "small_monthly" })
      .expect(201);
    const grantId = monthlyClaim.body.data.grants[0].grant_id as string;
    const ancientDraw = await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_ancient_${randomSuffix()}`)
      .send({ pool_type: "ancient_treasure", cost_type: "monthly_grant", grant_id: grantId })
      .expect(201);
    expect(ancientDraw.body.data.result.result_type).toBe("ancient_treasure");
    await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_permanent_${randomSuffix()}`)
      .send({ pool_type: "permanent", cost_type: "bound_jade" })
      .expect(201);

    const freePreview = await request(app.getHttpServer())
      .post("/api/commerce/convenience/batch-preview")
      .set("Authorization", `Bearer ${support.token}`)
      .set("Idempotency-Key", `idem_m9_script_preview_${randomSuffix()}`)
      .send({ requested_count: 20 })
      .expect(201);
    expect(freePreview.body.data.accepted_count).toBe(5);
    await request(app.getHttpServer())
      .post("/api/commerce/convenience/automation-queues")
      .set("Authorization", `Bearer ${support.token}`)
      .set("Idempotency-Key", `idem_m9_script_queue_${randomSuffix()}`)
      .send({ queue_type: "core_daily", actions: [{ action_type: "explore", count: 20 }] })
      .expect(403);

    const title = await request(app.getHttpServer())
      .post("/api/commerce/appearances/claim")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_title_claim_${randomSuffix()}`)
      .send({ appearance_id: "title_style_qingtian" })
      .expect(201);
    expect(title.body.data.appearance.appearance_type).toBe("title_style");
    expect(title.body.data.appearance.stat_bonus).toBeNull();
    const equippedTitle = await request(app.getHttpServer())
      .post("/api/commerce/appearances/equip")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_m9_title_equip_${randomSuffix()}`)
      .send({ appearance_id: "title_style_qingtian" })
      .expect(201);
    expect(equippedTitle.body.data.appearance.equipped).toBe(true);

    const mail = await request(app.getHttpServer())
      .post("/api/admin/mails/send")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m9_mail_${randomSuffix()}`)
      .send({
        target_type: "player",
        player_id: leader.playerId,
        title: "M9 小纪元结算",
        content: "本轮压缩纪元演练已完成，发放基础复盘奖励。",
        rewards: {
          spirit_stone: "100",
          items: [{ item_id: "tower_sigil", name: "镇塔符", count: 1, bind_type: "bound" }],
        },
        reason: "M9 小纪元演练",
        operator: "m9_test",
      })
      .expect(201);
    const announcement = await request(app.getHttpServer())
      .post("/api/admin/announcements")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m9_announcement_${randomSuffix()}`)
      .send({
        announcement_type: "era",
        title: "M9 小纪元复盘",
        content: `演练玩家 ${leader.playerId} 已完成核心闭环，产生排行、称号、邮件和风控记录。`,
        visible_scope: "all",
        operator: "m9_test",
      })
      .expect(201);
    expect(mail.body.data.operation.action).toBe("send_mail");
    expect(announcement.body.data.operation.action).toBe("create_announcement");

    for (const rankType of ["personal", "sect", "tower_week"]) {
      const rank = await request(app.getHttpServer())
        .get(`/api/multiplayer/ranks/${rankType}`)
        .set("Authorization", `Bearer ${leader.token}`)
        .expect(200);
      expect(rank.body.data.entries.length).toBeGreaterThan(0);
      for (const entry of rank.body.data.entries) {
        const rewardText = JSON.stringify(entry.reward_preview);
        expect(rewardText).not.toContain("限定法宝");
        expect(rewardText).not.toContain("古宝");
      }
    }

    const digest = await request(app.getHttpServer())
      .get(`/api/admin/player-digest?player_id=${leader.playerId}`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(digest.body.data.player.player_id).toBe(leader.playerId);
    expect(digest.body.data.orders.length).toBeGreaterThan(0);
    expect(digest.body.data.gacha_records.length).toBeGreaterThan(0);
    expect(digest.body.data.battles.length).toBeGreaterThan(0);
    expect(digest.body.data.action_records.length).toBeGreaterThan(0);
    expect(
      digest.body.data.mails.some(
        (item: { mail_id: string }) => item.mail_id === mail.body.data.mail.mail_id,
      ),
    ).toBe(true);

    const risk = await request(app.getHttpServer())
      .get(`/api/admin/risk/player/${support.playerId}`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(risk.body.data.risk_score).toBeGreaterThan(0);

    const operations = await request(app.getHttpServer())
      .get("/api/admin/operations")
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(
      operations.body.data.operations.some(
        (operation: { target_id: string }) => operation.target_id === mail.body.data.mail.mail_id,
      ),
    ).toBe(true);
    expect(
      operations.body.data.operations.some(
        (operation: { target_id: string }) =>
          operation.target_id === announcement.body.data.announcement.announcement_id,
      ),
    ).toBe(true);
  });
});

async function createM9Player(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix.slice(0, 3)}${Date.now()
    .toString(36)
    .slice(-5)}${randomSuffix()}`.slice(0, 16);
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `m9_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m9_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;

  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
  });

  return { token, playerId };
}

async function seedM9Resources(prisma: PrismaClient, playerId: string) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: {
      spiritStone: { increment: 30_000n },
      jadeBound: { increment: 1_000n },
    },
  });
  await prisma.playerActionState.update({
    where: { playerId },
    data: { actionPointCap: 300, actionPoints: 300, lastRecoveredAt: new Date() },
  });
  await prisma.playerCaveState.update({
    where: { playerId },
    data: { lastCollectedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
  });
  await createItem(prisma, playerId, "low_herb", 80, "bound", "test_seed");
  await createItem(prisma, playerId, "raw_iron", 80, "bound", "test_seed");
  await createItem(prisma, playerId, "alch_moon_dew_herb", 6, "bound", "test_seed");
  await createItem(prisma, playerId, "alch_spirit_resin", 3, "bound", "test_seed");
  await createItem(prisma, playerId, "forge_star_iron", 6, "bound", "test_seed");
  await createItem(prisma, playerId, "forge_spiritwood_core", 2, "bound", "test_seed");
  await createItem(prisma, playerId, "ancient_page", 30, "bound", "m9_era_drill");
}

async function createItem(
  prisma: PrismaClient,
  playerId: string,
  itemId: string,
  count: number,
  bindType: string,
  sourceType: string,
): Promise<string> {
  const itemInstanceId = `item_m9_${itemId}_${Date.now()}_${randomSuffix()}`;
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

function findCraftSuccessKey(
  prefix: string,
  kind: "alchemy" | "forge",
  materials: Array<{ item_id: string; count: number }>,
  threshold: number,
): string {
  const compositionHash = getMaterialCompositionHash(kind, materials);
  for (let index = 0; index < 1000; index += 1) {
    const key = `idem_${prefix}_${Date.now()}_${randomSuffix()}_${index}`;
    const roll = roll10000(`${key}:${compositionHash}:success`);
    if (roll < threshold) {
      return key;
    }
  }

  throw new Error("未找到满足期望的幂等键");
}

function roll10000(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return hash;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
