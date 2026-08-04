import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const adminToken = "nextday-admin-dev";

describe("M6 行为风控闭环", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m6-test-secret";
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

  it("免费脚本伪造批量与托管权限时只截断或拒绝，并写入风控记录", async () => {
    const { token, playerId } = await createM6Player(app, prisma, "风控", "qi");

    const preview = await request(app.getHttpServer())
      .post("/api/commerce/convenience/batch-preview")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m6_preview_${Date.now()}_${randomSuffix()}`)
      .send({ requested_count: 20 })
      .expect(201);
    expect(preview.body.data.accepted_count).toBe(5);
    expect(preview.body.data.reward_multiplier).toBe(1);

    await request(app.getHttpServer())
      .post("/api/commerce/convenience/automation-queues")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m6_queue_${Date.now()}_${randomSuffix()}`)
      .send({ queue_type: "core_daily", actions: [{ action_type: "explore", count: 20 }] })
      .expect(403);

    const risk = await request(app.getHttpServer())
      .get(`/api/admin/risk/player/${playerId}`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(risk.body.data.risk_score).toBeGreaterThan(0);
    expect(risk.body.data.recent_rule_codes).toContain("privilege_violation");

    const records = await request(app.getHttpServer())
      .get(`/api/admin/risk/records?player_id=${playerId}`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(records.body.data.records.length).toBeGreaterThanOrEqual(2);
  });

  it("公共 Boss 挑战保留个人伤害记录与结算日志", async () => {
    const { token, playerId } = await createM6Player(app, prisma, "镇邪", "qi");
    const boss = await request(app.getHttpServer())
      .get("/api/multiplayer/boss")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const challenged = await request(app.getHttpServer())
      .post("/api/multiplayer/boss/challenge")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m6_boss_${Date.now()}_${randomSuffix()}`)
      .send({ boss_id: boss.body.data.boss.boss_id })
      .expect(201);

    expect(challenged.body.data.damage_done).toBeGreaterThan(0);
    expect(challenged.body.data.log).toHaveLength(2);
    const record = await prisma.worldBossChallengeRecord.findUniqueOrThrow({
      where: { recordId: challenged.body.data.record_id },
    });
    expect(record.playerId).toBe(playerId);
    expect(record.damageDone).toBe(challenged.body.data.damage_done);
  });

  it("同一九塔低价值重复提交进入延迟结算池，并可后台审核放行", async () => {
    const { token, playerId } = await createM6Player(app, prisma, "九塔", "qi");
    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const tower = towers.body.data.towers[0];

    let delayedData: {
      risk_status: string;
      settlement_status: string;
      risk_record_id: string | null;
    } | null = null;
    for (let index = 0; index < 4; index += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/multiplayer/towers/action")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `idem_m6_tower_${index}_${Date.now()}_${randomSuffix()}`)
        .send({ tower_id: tower.tower_id, action_type: "supply", count: 1 })
        .expect(201);
      delayedData = response.body.data;
    }

    expect(delayedData?.risk_status).toBe("delayed_settlement");
    expect(delayedData?.settlement_status).toBe("delayed");
    expect(delayedData?.risk_record_id).toBeTruthy();

    const delayedList = await request(app.getHttpServer())
      .get(`/api/admin/risk/delayed-settlements?player_id=${playerId}&status=delayed`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(delayedList.body.data.records).toHaveLength(1);
    const settlementId = delayedList.body.data.records[0].settlement_record_id as string;
    const walletBefore = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });

    const reviewed = await request(app.getHttpServer())
      .post("/api/admin/risk/review")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_m6_review_${Date.now()}_${randomSuffix()}`)
      .send({
        settlement_record_id: settlementId,
        action: "release",
        reason: "测试放行",
        reviewer: "m6_test",
      })
      .expect(201);
    expect(reviewed.body.data.record.status).toBe("settled");

    const walletAfter = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });
    expect(walletAfter.spiritStone - walletBefore.spiritStone).toBe(20n);
  });

  it("M6 风控配置入口可读取", async () => {
    const response = await request(app.getHttpServer()).get("/api/config/risk").expect(200);

    expect(response.body.data.config_type).toBe("risk");
    expect(response.body.data.ruleset_version).toBe("risk_m6_v1");
  });
});

async function createM6Player(
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
    .send({ device_id: `m6_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m6_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
