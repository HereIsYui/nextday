import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P1.7 持久修行日志与探索事件链", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-7-secret";
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

  it("探索领取后生成待处理奇遇，并写入可重新读取的修行日志", async () => {
    const { token, playerId } = await createP17Player(app, prisma);

    const started = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p17_explore_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);

    await prisma.exploreActionRecord.update({
      where: { recordId: started.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });

    const claimed = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p17_claim_${Date.now()}_${randomSuffix()}`)
      .send({ record_id: started.body.data.record_id })
      .expect(201);

    expect(claimed.body.data.event).toBeTruthy();
    expect(claimed.body.data.event.status).toBe("pending");
    expect(claimed.body.data.event.choices.length).toBeGreaterThanOrEqual(2);

    const pending = await request(app.getHttpServer())
      .get("/api/game/explore/events?status=pending")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(pending.body.data.events).toHaveLength(1);
    expect(pending.body.data.events[0].event_id).toBe(claimed.body.data.event.event_id);

    const journal = await request(app.getHttpServer())
      .get("/api/game/journal?limit=8")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(journal.body.data.entries.length).toBeGreaterThan(0);
    expect(journal.body.data.entries[0].title).toBe("冀州探索回放");
    expect(journal.body.data.entries[0].tags).toContain("自动战斗");

    const dbJournalCount = await prisma.playerJournalEntry.count({ where: { playerId } });
    expect(dbJournalCount).toBeGreaterThan(0);
  });

  it("探索奇遇选择可发放普通奖励、幂等返回旧结果，且不能重复处理", async () => {
    const { token, playerId } = await createP17Player(app, prisma);
    const event = await createClaimedExploreEvent(app, prisma, token);
    const choice = event.choices[0];
    const idempotencyKey = `idem_p17_event_${Date.now()}_${randomSuffix()}`;

    const resolved = await request(app.getHttpServer())
      .post("/api/game/explore/events/resolve")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ choice_id: choice.choice_id, event_id: event.event_id })
      .expect(201);

    expect(resolved.body.data.event.status).toBe("resolved");
    expect(resolved.body.data.event.selected_choice_id).toBe(choice.choice_id);
    expect(resolved.body.data.rewards.jade_paid).toBeUndefined();
    expect(resolved.body.data.rewards.jade_bound).toBeUndefined();
    expect(JSON.stringify(resolved.body.data.rewards)).not.toContain("ancient_treasure");

    const repeated = await request(app.getHttpServer())
      .post("/api/game/explore/events/resolve")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ choice_id: choice.choice_id, event_id: event.event_id })
      .expect(201);
    expect(repeated.body.data.event.event_id).toBe(event.event_id);

    await request(app.getHttpServer())
      .post("/api/game/explore/events/resolve")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p17_event_again_${Date.now()}_${randomSuffix()}`)
      .send({ choice_id: choice.choice_id, event_id: event.event_id })
      .expect(400);

    const pending = await request(app.getHttpServer())
      .get("/api/game/explore/events?status=pending")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(pending.body.data.events).toHaveLength(0);

    const journal = await request(app.getHttpServer())
      .get("/api/game/journal?limit=8")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(journal.body.data.entries[0].title).toContain("处理完成");

    const eventCount = await prisma.exploreEventRecord.count({ where: { playerId } });
    expect(eventCount).toBe(1);
  });

  it("领取修为后写入可持久读取的修行日志", async () => {
    const { token, playerId } = await createP17Player(app, prisma);
    await prisma.playerProgress.update({
      where: { playerId },
      data: { lastCultivationAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    const claimed = await request(app.getHttpServer())
      .post("/api/game/cultivation/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p17_cultivation_${Date.now()}_${randomSuffix()}`)
      .send({})
      .expect(201);

    expect(claimed.body.data.experience.title).toBe("收束修为");
    expect(Number(claimed.body.data.gained_cultivation)).toBeGreaterThan(0);

    const journal = await request(app.getHttpServer())
      .get("/api/game/journal?limit=3")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(journal.body.data.entries[0].title).toBe("收束修为");
    expect(journal.body.data.entries[0].source_type).toBe("领取修为");
  });

  it("修行日志支持 before 游标分页读取更早记录", async () => {
    const { token, playerId } = await createP17Player(app, prisma);
    const now = Date.now();
    await prisma.playerJournalEntry.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        configVersion: "p1_8_journal_pagination_test",
        createdAt: new Date(now - index * 1000),
        deltaSummary: [`修为 +${index}`],
        eraId: "era_mvp_001",
        experienceSnapshot: {
          delta_summary: [],
          next_recommendations: [],
          reason_tags: [],
          summary: `分页日志 ${index}`,
          timeline: [],
          title: `分页日志 ${index}`,
        },
        journalEntryId: `journal_page_${now}_${index}_${randomSuffix()}`,
        playerId,
        recommendations: ["继续修行"],
        sourceId: `page_${index}`,
        sourceType: "分页测试",
        summary: `分页日志 ${index}`,
        tags: ["分页"],
        title: `分页日志 ${index}`,
      })),
    });

    const firstPage = await request(app.getHttpServer())
      .get("/api/game/journal?limit=3")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(firstPage.body.data.entries.map((entry: { title: string }) => entry.title)).toEqual([
      "分页日志 0",
      "分页日志 1",
      "分页日志 2",
    ]);
    expect(firstPage.body.data.next_cursor).toBeTruthy();

    const secondPage = await request(app.getHttpServer())
      .get(
        `/api/game/journal?limit=3&before=${encodeURIComponent(firstPage.body.data.next_cursor)}`,
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(secondPage.body.data.entries.map((entry: { title: string }) => entry.title)).toEqual([
      "分页日志 3",
      "分页日志 4",
      "分页日志 5",
    ]);
  });
});

async function createClaimedExploreEvent(
  app: INestApplication,
  prisma: PrismaClient,
  token: string,
): Promise<{ event_id: string; choices: Array<{ choice_id: string }> }> {
  const started = await request(app.getHttpServer())
    .post("/api/game/explore")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p17_event_explore_${Date.now()}_${randomSuffix()}`)
    .send({ province_id: "ji", count: 1 })
    .expect(201);

  await prisma.exploreActionRecord.update({
    where: { recordId: started.body.data.record_id },
    data: { completesAt: new Date(Date.now() - 1000) },
  });

  const claimed = await request(app.getHttpServer())
    .post("/api/game/explore/claim")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p17_event_claim_${Date.now()}_${randomSuffix()}`)
    .send({ record_id: started.body.data.record_id })
    .expect(201);

  return claimed.body.data.event;
}

async function createP17Player(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p17_${nonce}`, nickname: "奇遇道友" })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p17_create_${nonce}`)
    .send({ name: `奇遇${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}
