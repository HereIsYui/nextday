import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const adminToken = "nextday-admin-dev";

describe("M8 运营后台闭环", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m8-test-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || adminToken;

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

  it("GM 查询能汇总玩家、订单、抽卡、战斗、行动、邮件和风控摘要", async () => {
    const { token, playerId } = await createM8Player(app, "查询", "qi");
    await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m8_explore_${randomSuffix()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/game/cave/collect")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m8_cave_${randomSuffix()}`)
      .send()
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m8_monthly_${randomSuffix()}`)
      .send({ card_type: "small_monthly" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/commerce/monthly-cards/claim-daily")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m8_monthly_claim_${randomSuffix()}`)
      .send({ card_type: "small_monthly" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/api/commerce/gacha/draw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m8_gacha_${randomSuffix()}`)
      .send({ pool_type: "permanent", cost_type: "bound_jade" })
      .expect(201);

    const mail = await sendValidMail(app, playerId);
    expect(mail.body.data.mail.player_id).toBe(playerId);

    const digest = await request(app.getHttpServer())
      .get(`/api/admin/player-digest?player_id=${playerId}`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(digest.body.data.player.player_id).toBe(playerId);
    expect(digest.body.data.orders.length).toBeGreaterThan(0);
    expect(digest.body.data.gacha_records.length).toBeGreaterThan(0);
    expect(digest.body.data.battles.length).toBeGreaterThan(0);
    expect(digest.body.data.action_records.length).toBeGreaterThan(0);
    expect(digest.body.data.mails.length).toBeGreaterThan(0);
    expect(digest.body.data.risk.player_id).toBe(playerId);

    await request(app.getHttpServer())
      .get(`/api/admin/player-digest?player_id=${playerId}`)
      .set("X-Admin-Token", "wrong")
      .expect(403);
  });

  it("邮件公告可发布且补偿邮件禁止发放付费资产和九大古宝", async () => {
    const { playerId } = await createM8Player(app, "邮件", "body");
    await sendValidMail(app, playerId);

    await request(app.getHttpServer())
      .post("/api/admin/mails/send")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m8_bad_mail_${randomSuffix()}`)
      .send({
        target_type: "player",
        player_id: playerId,
        title: "错误补偿",
        content: "不应发放付费仙玉。",
        rewards: { jade_paid: "1" },
        operator: "m8_test",
      })
      .expect(400);

    const announcement = await request(app.getHttpServer())
      .post("/api/admin/announcements")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m8_announcement_${randomSuffix()}`)
      .send({
        announcement_type: "probability",
        title: "九大古宝概率公示",
        content: "九大古宝池当前只允许月卡赠抽和残页合成，不开放仙玉直抽。",
        visible_scope: "all",
        operator: "m8_test",
      })
      .expect(201);
    expect(announcement.body.data.announcement.announcement_type).toBe("probability");

    const list = await request(app.getHttpServer())
      .get("/api/admin/announcements")
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(list.body.data.announcements.length).toBeGreaterThan(0);
  });

  it("配置发布能拦截九大古宝池错误结果，并支持回滚", async () => {
    const validPayload = createValidGachaPayload();
    const versionA = `gacha_m8_a_${Date.now()}_${randomSuffix()}`;
    const versionB = `gacha_m8_b_${Date.now()}_${randomSuffix()}`;

    await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m8_bad_config_${randomSuffix()}`)
      .send({
        config_type: "gacha",
        config_version: `gacha_bad_${Date.now()}_${randomSuffix()}`,
        payload: {
          pools: {
            ancient_treasure: {
              allowedCostTypes: ["monthly_grant"],
              results: [{ treasure_id: "not_treasure", name: "错误产物" }],
            },
          },
        },
        operator: "m8_test",
      })
      .expect(400);

    const publishedA = await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m8_config_a_${randomSuffix()}`)
      .send({
        config_type: "gacha",
        config_version: versionA,
        payload: validPayload,
        operator: "m8_test",
      })
      .expect(201);
    expect(publishedA.body.data.config.active).toBe(true);

    await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m8_config_b_${randomSuffix()}`)
      .send({
        config_type: "gacha",
        config_version: versionB,
        payload: validPayload,
        operator: "m8_test",
      })
      .expect(201);

    const rollback = await request(app.getHttpServer())
      .post("/api/admin/configs/rollback")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m8_config_rollback_${randomSuffix()}`)
      .send({
        config_type: "gacha",
        target_config_version: versionA,
        reason: "回滚验收",
        operator: "m8_test",
      })
      .expect(201);
    expect(rollback.body.data.config.config_version).toBe(versionA);
    expect(rollback.body.data.config.active).toBe(true);
  });

  it("风控记录可人工解除并写入 GM 操作日志", async () => {
    const { token, playerId } = await createM8Player(app, "风控", "qi");
    await request(app.getHttpServer())
      .post("/api/commerce/convenience/batch-preview")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m8_risk_${randomSuffix()}`)
      .send({ requested_count: 20 })
      .expect(201);

    const records = await request(app.getHttpServer())
      .get(`/api/admin/risk/records?player_id=${playerId}`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    const recordId = records.body.data.records[0].risk_record_id as string;

    const resolved = await request(app.getHttpServer())
      .post("/api/admin/risk/resolve")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m8_resolve_${randomSuffix()}`)
      .send({
        risk_record_id: recordId,
        reason: "人工复核通过",
        operator: "m8_test",
      })
      .expect(201);
    expect(resolved.body.data.record.resolution_status).toBe("resolved");
    expect(resolved.body.data.operation.action).toBe("resolve_risk_record");

    const operations = await request(app.getHttpServer())
      .get("/api/admin/operations")
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(
      operations.body.data.operations.some(
        (operation: { target_id: string }) => operation.target_id === recordId,
      ),
    ).toBe(true);
  });
});

async function createM8Player(
  app: INestApplication,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix.slice(0, 2)}${Date.now()
    .toString(36)
    .slice(-5)}${randomSuffix()}`.slice(0, 16);
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `m8_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m8_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);

  return {
    token,
    playerId: createResponse.body.data.profile.player.player_id as string,
  };
}

function sendValidMail(app: INestApplication, playerId: string) {
  return request(app.getHttpServer())
    .post("/api/admin/mails/send")
    .set("X-Admin-Token", adminToken)
    .set("Idempotency-Key", `idem_m8_mail_${randomSuffix()}`)
    .send({
      target_type: "player",
      player_id: playerId,
      title: "基础补偿",
      content: "发放灵石与普通材料。",
      rewards: {
        spirit_stone: "100",
        items: [{ item_id: "low_herb", name: "凝露草", count: 2, bind_type: "bound" }],
      },
      reason: "M8 验收",
      operator: "m8_test",
    })
    .expect(201);
}

function createValidGachaPayload() {
  return {
    pools: {
      ancient_treasure: {
        allowedCostTypes: ["monthly_grant", "ancient_page"],
        paid_jade_entry: "reserved_unopened",
        results: [
          { treasure_id: "taiyi_danding", name: "太乙丹鼎" },
          { treasure_id: "qiankun_lianxing_lu", name: "乾坤炼星炉" },
          { treasure_id: "xuandu_juling_pan", name: "玄都聚灵盘" },
          { treasure_id: "qingdi_changsheng_juan", name: "青帝长生卷" },
          { treasure_id: "shanhe_sheji_tu", name: "山河社稷图" },
          { treasure_id: "haotian_zhenmo_zhong", name: "昊天镇魔钟" },
          { treasure_id: "jiuyuan_shihun_fan", name: "九渊噬魂幡" },
          { treasure_id: "zhenyue_xuanhuang_yin", name: "镇岳玄黄印" },
          { treasure_id: "tianji_xingpan", name: "天机星盘" },
        ],
      },
    },
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
