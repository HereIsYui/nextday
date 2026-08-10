import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("长期探索结算", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "long-exploration-test-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  it("探索不扣行动令，达到批量周期后自动入账", async () => {
    const { token, playerId } = await createPlayer(app, "在线");
    const before = await prisma.playerActionState.findUniqueOrThrow({ where: { playerId } });

    const started = await request(app.getHttpServer())
      .post("/api/game/actions/start")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_start_${Date.now()}_online`)
      .send({ action_type: "explore", province_id: "ji" })
      .expect(201);

    expect(started.body.data.action.action_type).toBe("explore");
    expect(started.body.data.action_state.action_points).toBe(before.actionPoints);

    const recordId = started.body.data.action.action_id as string;
    const now = new Date();
    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: {
        lastSettledAt: new Date(now.getTime() - 120 * 60_000),
        lastActiveAt: now,
      },
    });

    const current = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(current.body.data.action.settled_minutes).toBe(120);
    expect(current.body.data.action.settled_battle_count).toBe(1);
    expect(current.body.data.action.rewards).toMatchObject({
      cultivation: expect.any(String),
      spirit_stone: expect.any(String),
    });
    expect(await prisma.battleLog.count({ where: { playerId, battleType: "explore" } })).toBe(1);
    const settlements = await prisma.actionSettlementRecord.findMany({
      where: { playerId, actionId: recordId },
    });
    expect(settlements).toHaveLength(1);
    expect(settlements[0].source).toBe("online");
    expect(settlements[0].effectiveMinutes).toBe(120);
  });

  it("按每日二十一场基准累计，不会因小时批量放大收益", async () => {
    const { token, playerId } = await createPlayer(app, "日基准");
    const started = await request(app.getHttpServer())
      .post("/api/game/actions/start")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_start_${Date.now()}_daily_basis`)
      .send({ action_type: "explore", province_id: "ji" })
      .expect(201);
    const recordId = started.body.data.action.action_id as string;
    const now = new Date();
    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: {
        lastSettledAt: new Date(now.getTime() - 24 * 60 * 60_000),
        lastActiveAt: now,
      },
    });

    const current = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(current.body.data.action.settled_minutes).toBe(1_440);
    expect(current.body.data.action.settled_battle_count).toBe(21);
    expect(await prisma.battleLog.count({ where: { playerId, battleType: "explore" } })).toBe(21);
  });

  it("奇遇必须在至少一场有效探索战斗后才会触发", async () => {
    const { token } = await createPlayer(app, "奇遇门槛");
    const started = await request(app.getHttpServer())
      .post("/api/game/actions/start")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_start_${Date.now()}_event_gate`)
      .send({ action_type: "explore", province_id: "ji" })
      .expect(201);
    const recordId = started.body.data.action.action_id as string;
    const now = new Date();
    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: {
        eventTriggerAt: new Date(now.getTime() - 60_000),
        lastSettledAt: new Date(now.getTime() - 10 * 60_000),
        lastActiveAt: now,
      },
    });

    const beforeBattle = await request(app.getHttpServer())
      .get("/api/game/explore/events?status=pending")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(beforeBattle.body.data.events).toHaveLength(0);

    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: {
        lastSettledAt: new Date(now.getTime() - 24 * 60 * 60_000),
        lastActiveAt: now,
      },
    });
    await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const afterBattle = await request(app.getHttpServer())
      .get("/api/game/explore/events?status=pending")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(afterBattle.body.data.events).toHaveLength(1);
  });

  it("离线收益最多计算八小时，快照可重复查看并只能领取一次", async () => {
    const { token, playerId } = await createPlayer(app, "离线");
    const started = await request(app.getHttpServer())
      .post("/api/game/actions/start")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_start_${Date.now()}_offline`)
      .send({ action_type: "explore", province_id: "ji" })
      .expect(201);
    const recordId = started.body.data.action.action_id as string;
    const lastActiveAt = new Date(Date.now() - 12 * 60 * 60_000);
    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: { lastSettledAt: lastActiveAt, lastActiveAt },
    });

    const current = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(current.body.data.action.offline_reward.offline_minutes).toBe(480);
    expect(
      current.body.data.action.offline_reward.estimated_win_count +
        current.body.data.action.offline_reward.estimated_lose_count,
    ).toBe(current.body.data.action.offline_reward.estimated_battle_count);
    expect(current.body.data.action.offline_reward.rewards.items).toEqual(expect.any(Array));

    const preview = await request(app.getHttpServer())
      .get("/api/game/actions/offline-reward")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(preview.body.data.reward.offline_minutes).toBe(480);

    const claimed = await request(app.getHttpServer())
      .post("/api/game/actions/offline-reward/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_claim_${Date.now()}_offline`)
      .expect(201);
    expect(claimed.body.data.action.action_type).toBe("explore");
    expect(claimed.body.data.action.offline_reward).toBeNull();

    const record = await prisma.exploreActionRecord.findUniqueOrThrow({ where: { recordId } });
    expect(record.offlineSnapshotClaimedAt).not.toBeNull();
    expect(record.settledMinutes).toBe(480);
    const settlement = await prisma.actionSettlementRecord.findFirstOrThrow({
      where: { playerId, actionId: recordId },
    });
    expect(settlement.source).toBe("offline");
    expect(settlement.effectiveMinutes).toBe(480);
  });

  it("在线结算按完整分钟推进，59 分钟不结算、60 分钟推进游标", async () => {
    const { token, playerId } = await createPlayer(app, "分钟边界");
    const started = await request(app.getHttpServer())
      .post("/api/game/actions/start")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_start_${Date.now()}_minute_boundary`)
      .send({ action_type: "explore", province_id: "ji" })
      .expect(201);
    const recordId = started.body.data.action.action_id as string;
    const now = new Date();
    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: { lastSettledAt: new Date(now.getTime() - 59 * 60_000), lastActiveAt: now },
    });
    const beforeBatch = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(beforeBatch.body.data.action.settled_minutes).toBe(0);
    expect(
      await prisma.actionSettlementRecord.count({ where: { playerId, actionId: recordId } }),
    ).toBe(0);

    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: { lastSettledAt: new Date(now.getTime() - 60 * 60_000), lastActiveAt: now },
    });
    const afterBatch = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(afterBatch.body.data.action.settled_minutes).toBe(60);
    expect(afterBatch.body.data.action.last_settled_at).toBeTruthy();
  });

  it("不同请求并发补算同一在线窗口只生成一份战报与奖励", async () => {
    const { token, playerId } = await createPlayer(app, "并发窗口");
    const started = await request(app.getHttpServer())
      .post("/api/game/actions/start")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_start_${Date.now()}_concurrent_window`)
      .send({ action_type: "explore", province_id: "ji" })
      .expect(201);
    const recordId = started.body.data.action.action_id as string;
    const now = new Date();
    await prisma.exploreActionRecord.update({
      where: { recordId },
      data: {
        lastSettledAt: new Date(now.getTime() - 120 * 60_000),
        lastActiveAt: now,
      },
    });

    const responses = await Promise.all([
      request(app.getHttpServer())
        .get("/api/game/actions/current")
        .set("Authorization", `Bearer ${token}`),
      request(app.getHttpServer())
        .get("/api/game/actions/current")
        .set("Authorization", `Bearer ${token}`),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responses[0].body.data.action.settled_battle_count).toBe(1);
    expect(responses[1].body.data.action.settled_battle_count).toBe(1);
    expect(await prisma.battleLog.count({ where: { playerId, battleType: "explore" } })).toBe(1);
    expect(
      await prisma.actionSettlementRecord.count({ where: { playerId, actionId: recordId } }),
    ).toBe(1);
  });

  it("带探索次数的旧请求明确拒绝", async () => {
    const { token } = await createPlayer(app, "旧接口");
    const response = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_legacy_${Date.now()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(400);
    expect(response.body.message).toContain("长期行动");
  });

  it("旧的当前探索和领取探索接口不再提供", async () => {
    const { token } = await createPlayer(app, "旧路由");

    await request(app.getHttpServer())
      .get("/api/game/explore/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `long_legacy_claim_${Date.now()}`)
      .send({})
      .expect(404);
  });
});

async function createPlayer(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `long_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `long_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route: "qi" });
  if (created.status !== 201) {
    throw new Error(`创建角色失败：${created.status} ${JSON.stringify(created.body)}`);
  }
  return { token, playerId: created.body.data.profile.player.player_id as string };
}
