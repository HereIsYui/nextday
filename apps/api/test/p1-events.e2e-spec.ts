import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P1 节日活动、回归和补偿活动", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-events-secret";
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

  it("活动列表列出五类异步活动，并返回奖励边界和公告模板", async () => {
    const { token } = await createEventPlayer(app, "活动", "qi");
    const list = await request(app.getHttpServer())
      .get("/api/events/list")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list.body.data.events.length).toBeGreaterThanOrEqual(5);
    expect(list.body.data.async_rule).toContain("全天可提交");
    expect(list.body.data.reward_boundary).toContain("不发付费仙玉");
    expect(
      list.body.data.events.every((event: { async_enabled: boolean }) => event.async_enabled),
    ).toBe(true);
    expect(list.body.data.events.map((event: { event_type: string }) => event.event_type)).toEqual(
      expect.arrayContaining([
        "jiuzhou_travel",
        "craft_trial",
        "sect_celebration",
        "return_support",
        "compensation",
      ]),
    );

    const detail = await request(app.getHttpServer())
      .get("/api/events/event_p1_jiuzhou_travel")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.announcement_template.title).toContain("九州游历");
    expect(detail.body.data.progress_actions[0].action_point_cost).toBeGreaterThan(0);
  });

  it("活动进度提交和奖励领取支持幂等，奖励只发绑定资源", async () => {
    const { token, playerId } = await createEventPlayer(app, "游历", "body");
    const progressKey = `idem_p1_event_progress_${Date.now()}_${randomSuffix()}`;
    const first = await request(app.getHttpServer())
      .post("/api/events/progress")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", progressKey)
      .send({ event_id: "event_p1_jiuzhou_travel", province_id: "ji", count: 3 })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/events/progress")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", progressKey)
      .send({ event_id: "event_p1_jiuzhou_travel", province_id: "ji", count: 3 })
      .expect(201);

    expect(repeated.body.data.record_id).toBe(first.body.data.record_id);
    expect(first.body.data.record.progress).toBe(3);
    expect(first.body.data.reward_state).toBe("claimable");
    expect(first.body.data.action_state.action_points).toBeLessThan(
      first.body.data.action_state.action_point_cap,
    );

    const claimKey = `idem_p1_event_claim_${Date.now()}_${randomSuffix()}`;
    const claimed = await request(app.getHttpServer())
      .post("/api/events/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", claimKey)
      .send({ event_id: "event_p1_jiuzhou_travel" })
      .expect(201);
    const claimRepeated = await request(app.getHttpServer())
      .post("/api/events/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", claimKey)
      .send({ event_id: "event_p1_jiuzhou_travel" })
      .expect(201);

    expect(claimRepeated.body.data.reward_record_id).toBe(claimed.body.data.reward_record_id);
    expect(claimed.body.data.rewards.jade_paid).toBeUndefined();
    expect(claimed.body.data.record.reward_state).toBe("claimed");

    const eventItems = await prisma.playerItem.findMany({
      where: { playerId, sourceType: "event_reward" },
    });
    expect(eventItems.length).toBeGreaterThan(0);
    expect(eventItems.every((item) => item.bindType === "bound")).toBe(true);
  });

  it("插件展开态展示活动摘要，活动配置发布校验拒绝付费和非异步模板", async () => {
    const { token } = await createEventPlayer(app, "插件", "qi");
    const panel = await request(app.getHttpServer())
      .get("/api/plugin/expanded-panel")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(panel.body.data.activities.length).toBeGreaterThan(0);
    expect(
      panel.body.data.digests.map((digest: { digest_id: string }) => digest.digest_id),
    ).toContain("activity_center");

    const config = await request(app.getHttpServer())
      .get("/api/config/activity_template")
      .expect(200);
    expect(config.body.data.payload.templates.length).toBeGreaterThanOrEqual(5);

    const rejected = await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", "nextday-admin-dev")
      .set("Idempotency-Key", `idem_p1_event_bad_config_${Date.now()}_${randomSuffix()}`)
      .send({
        config_type: "activity_template",
        config_version: `activity_bad_${Date.now()}`,
        payload: {
          templates: [
            {
              template_id: "bad_paid_event",
              activity_type: "festival",
              async_enabled: false,
              reward_preview: { jade_paid: "1", unique_power: "必胜外观" },
            },
          ],
        },
      })
      .expect(400);

    expect(rejected.body.message).toContain("活动配置不能包含");
  });
});

async function createEventPlayer(
  app: INestApplication,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix}${Date.now().toString(36).slice(-5)}${randomSuffix()}`.slice(
    0,
    16,
  );
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p1_events_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p1_events_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await request(app.getHttpServer())
    .get("/api/game/overview")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  return { token, playerId };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
