import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";
import { storyScrollConfigs } from "../src/story/story.constants";

describe("P2-1 高阶剧情演出与章节卷轴", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p2-story-secret";
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

  it("story_presentation 配置可读取，且不允许改变奖励结算", async () => {
    const { token } = await createP2StoryPlayer(app, prisma);

    const response = await request(app.getHttpServer())
      .get("/api/config/story_presentation")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.config_type).toBe("story_presentation");
    expect(response.body.data.payload.scrolls.length).toBe(storyScrollConfigs.length);
    expect(response.body.data.payload.reward_mutation_allowed).toBe(false);
    expect(response.body.data.payload.websocket_settlement_allowed).toBe(false);
  });

  it("章节卷轴列表和详情会持久化到 story_scroll_record", async () => {
    const { token, playerId } = await createP2StoryPlayer(app, prisma);

    const list = await request(app.getHttpServer())
      .get("/api/story/scrolls")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list.body.data.scrolls.length).toBeGreaterThanOrEqual(2);
    expect(list.body.data.scrolls[0].unlock_state).toBe("unlocked");
    expect(list.body.data.scrolls[0].scroll_record_id).toBeTruthy();

    const persisted = await prisma.storyScrollRecord.count({ where: { playerId } });
    expect(persisted).toBeGreaterThanOrEqual(2);

    const detail = await request(app.getHttpServer())
      .get(`/api/story/scrolls/${list.body.data.scrolls[0].scroll_id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(detail.body.data.scroll.fragments.length).toBeGreaterThan(0);
    expect(detail.body.data.scroll.sensitive_filtered).toBe(true);
    expect(JSON.stringify(detail.body.data.scroll)).not.toMatch(/订单|IP|UA|风控|GM|审计|后台/);
  });

  it("探索战报可生成玩家可读叙事，并被卷轴引用", async () => {
    const { token, playerId } = await createP2StoryPlayer(app, prisma);
    const battleId = await startAndClaimExplore(app, prisma, token);

    const narrative = await request(app.getHttpServer())
      .get(`/api/story/battle-narratives/${battleId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(narrative.body.data.source_battle_id).toBe(battleId);
    expect(narrative.body.data.narrative_lines.length).toBeGreaterThan(2);
    expect(narrative.body.data.result_reason.length).toBeGreaterThan(0);

    const list = await request(app.getHttpServer())
      .get("/api/story/scrolls")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const firstScrollId = list.body.data.scrolls[0].scroll_id as string;
    const detail = await request(app.getHttpServer())
      .get(`/api/story/scrolls/${firstScrollId}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(
      detail.body.data.scroll.battle_refs.some(
        (ref: { battle_id: string }) => ref.battle_id === battleId,
      ),
    ).toBe(true);
    expect(await prisma.storyScrollRecord.count({ where: { playerId } })).toBeGreaterThanOrEqual(2);
  });

  it("纪元史册生成公开快照，不写入敏感后台语境", async () => {
    const { token } = await createP2StoryPlayer(app, prisma);

    const response = await request(app.getHttpServer())
      .get("/api/story/era-chronicle")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.entries.length).toBeGreaterThanOrEqual(3);
    expect(
      response.body.data.entries.map((entry: { chronicle_type: string }) => entry.chronicle_type),
    ).toEqual(["event", "rank", "tower"]);
    expect(JSON.stringify(response.body.data.entries)).not.toMatch(/订单|IP|UA|风控|GM|审计|后台/);

    const persisted = await prisma.eraChronicleRecord.count({
      where: { eraId: "era_mvp_001", serverId: "default" },
    });
    expect(persisted).toBeGreaterThanOrEqual(3);
  });
});

async function createP2StoryPlayer(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p2_story_${nonce}`, nickname: "卷轴道友" })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_story_create_${nonce}`)
    .send({ name: `卷轴${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { chapterId: 2, lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function startAndClaimExplore(
  app: INestApplication,
  prisma: PrismaClient,
  token: string,
): Promise<string> {
  const started = await request(app.getHttpServer())
    .post("/api/game/explore")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_story_explore_${Date.now()}_${randomSuffix()}`)
    .send({ count: 1, province_id: "ji" })
    .expect(201);

  await prisma.exploreActionRecord.update({
    where: { recordId: started.body.data.record_id },
    data: { completesAt: new Date(Date.now() - 1000) },
  });

  const claimed = await request(app.getHttpServer())
    .post("/api/game/explore/claim")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_story_claim_${Date.now()}_${randomSuffix()}`)
    .send({ record_id: started.body.data.record_id })
    .expect(201);

  return claimed.body.data.battles[0].battle_id as string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
