import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";
import { storyConfigVersion, storyScrollConfigs } from "../src/story/story.constants";

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

  it("首卷须完成玄铁塔行动才归档，归档后不会混入后续经历", async () => {
    const { token, playerId } = await createP2StoryPlayer(app, prisma);
    await startAndClaimExplore(app, prisma, token);
    const exploreRecord = await prisma.exploreActionRecord.findFirstOrThrow({
      where: { playerId },
      orderBy: { createdAt: "desc" },
    });
    const existingEvent = await prisma.exploreEventRecord.findUnique({
      where: { exploreRecordId: exploreRecord.recordId },
    });
    if (existingEvent) {
      await prisma.exploreEventRecord.update({
        where: { eventId: existingEvent.eventId },
        data: {
          resolvedAt: new Date(),
          selectedChoiceId: "archive_choice",
          status: "resolved",
        },
      });
    } else {
      await prisma.exploreEventRecord.create({
        data: {
          eventId: `story_archive_event_${Date.now()}_${randomSuffix()}`,
          playerId,
          eraId: "era_mvp_001",
          exploreRecordId: exploreRecord.recordId,
          provinceId: "ji",
          provinceName: "冀州",
          eventType: "story_archive",
          title: "归档前的抉择",
          description: "用于验证卷轴快照。",
          choices: [],
          status: "resolved",
          selectedChoiceId: "archive_choice",
          rewardSnapshot: {},
          triggeredAt: new Date(),
          resolvedAt: new Date(),
        },
      });
    }
    await prisma.playerJournalEntry.createMany({
      data: [0, 1].map((index) => ({
        journalEntryId: `story_archive_journal_${Date.now()}_${index}_${randomSuffix()}`,
        playerId,
        eraId: "era_mvp_001",
        sourceType: "story_archive",
        sourceId: `archive_${index}`,
        title: "卷轴归档准备",
        summary: "本条记录用于完成卷轴片段。",
        deltaSummary: [],
        tags: [],
        recommendations: [],
      })),
    });

    const beforeTowerAction = await request(app.getHttpServer())
      .get("/api/story/scrolls/story_scroll_ch01_xuantie_first_seal")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(beforeTowerAction.body.data.scroll.unlock_state).toBe("unlocked");
    expect(
      beforeTowerAction.body.data.scroll.fragments.find(
        (fragment: { fragment_id: string }) => fragment.fragment_id === "ch01_ending",
      )?.unlocked,
    ).toBe(false);

    await prisma.storyScrollRecord.update({
      where: {
        playerId_eraId_scrollId: {
          playerId,
          eraId: "era_mvp_001",
          scrollId: "story_scroll_ch01_xuantie_first_seal",
        },
      },
      data: { storyConfigVersion: "story_p2_1_v1", unlockState: "archived" },
    });
    const rebuiltLegacyArchive = await request(app.getHttpServer())
      .get("/api/story/scrolls/story_scroll_ch01_xuantie_first_seal")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(rebuiltLegacyArchive.body.data.scroll.unlock_state).toBe("unlocked");
    expect(rebuiltLegacyArchive.body.data.scroll.story_config_version).toBe(storyConfigVersion);

    await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p2_story_tower_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: "tower_xuantie", action_type: "supply", count: 1 })
      .expect(201);

    const before = await request(app.getHttpServer())
      .get("/api/story/scrolls/story_scroll_ch01_xuantie_first_seal")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const archived = before.body.data.scroll;
    expect(archived.unlock_state).toBe("archived");
    expect(archived.progress_percent).toBe(100);
    expect(archived.choice_summary.length).toBeGreaterThan(0);
    expect(archived.battle_refs.length).toBeGreaterThan(0);

    await startAndClaimExplore(app, prisma, token);
    const after = await request(app.getHttpServer())
      .get("/api/story/scrolls/story_scroll_ch01_xuantie_first_seal")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(after.body.data.scroll.unlock_state).toBe("archived");
    expect(after.body.data.scroll.fragments).toEqual(archived.fragments);
    expect(after.body.data.scroll.choice_summary).toEqual(archived.choice_summary);
    expect(after.body.data.scroll.battle_refs).toEqual(archived.battle_refs);
  });

  it("纪元史册生成公开快照，不写入敏感后台语境", async () => {
    const { token } = await createP2StoryPlayer(app, prisma);

    const response = await request(app.getHttpServer())
      .get("/api/story/era-chronicle")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.entries.length).toBeGreaterThanOrEqual(3);
    const chronicleTypes = response.body.data.entries.map(
      (entry: { chronicle_type: string }) => entry.chronicle_type,
    );
    expect(chronicleTypes).toEqual(expect.arrayContaining(["event", "rank", "tower"]));
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
    .send({ province_id: "ji" })
    .expect(201);

  await prisma.exploreActionRecord.update({
    where: { recordId: started.body.data.action.action_id },
    data: {
      lastSettledAt: new Date(Date.now() - 24 * 60 * 60_000),
      lastActiveAt: new Date(),
    },
  });

  await request(app.getHttpServer())
    .get("/api/game/actions/current")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  const battles = await request(app.getHttpServer())
    .get("/api/game/battles?battle_type=explore&limit=1")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  await request(app.getHttpServer())
    .post("/api/game/actions/end")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_story_end_${Date.now()}_${randomSuffix()}`)
    .expect(201);
  return battles.body.data.battles[0].battle_id as string;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
