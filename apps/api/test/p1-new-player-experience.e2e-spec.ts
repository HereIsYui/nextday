import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { defaultEraId, exploreEventConfigs } from "../src/game/game.constants";
import { configureApp } from "../src/platform/configure-app";
import { getMaterialCompositionHash } from "../src/production/production.constants";

describe("P1-9 新手 30 分钟体验与玩法厚度", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-9-secret";
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

  it("overview 返回新手任务，并且不再返回今日路线", async () => {
    const { token } = await createP19Player(app, prisma);

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(overview.body.data.new_player_route).toBeUndefined();
    expect(
      overview.body.data.tasks.some(
        (task: { task_id: string }) => task.task_id === "chapter_first_30_minutes",
      ),
    ).toBe(true);
  });

  it("奇遇只由长期探索中的有效战斗触发，旧按次数请求不会补发", async () => {
    const { token } = await createP19Player(app, prisma);
    await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p19_first_event_${Date.now()}_${randomSuffix()}`)
      .send({ count: 1, province_id: "ji" })
      .expect(400);

    const started = await startLongExplore(app, token, prisma);
    await prisma.exploreActionRecord.update({
      where: { recordId: started.recordId },
      data: {
        lastSettledAt: new Date(Date.now() - 24 * 60 * 60_000),
        lastActiveAt: new Date(),
        eventTriggerAt: new Date(Date.now() - 1_000),
      },
    });
    await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const pending = await request(app.getHttpServer())
      .get("/api/game/explore/events?status=pending")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(pending.body.data.events).toHaveLength(1);
  });

  it("只有领取冀州初定章节奖励才推进章节并开放兖州", async () => {
    const { token, playerId } = await createP19Player(app, prisma);

    await request(app.getHttpServer())
      .post("/api/game/tasks/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p19_initial_chapter_${Date.now()}_${randomSuffix()}`)
      .send({ task_id: "chapter_unlock_ji" })
      .expect(201);

    const beforeChapterClaim = await prisma.playerProgress.findUniqueOrThrow({
      where: { playerId },
    });
    const yanBeforeChapterClaim = await prisma.playerProvinceProgress.findUniqueOrThrow({
      where: { playerId_provinceId: { playerId, provinceId: "yan" } },
    });
    expect(beforeChapterClaim.chapterId).toBe(1);
    expect(yanBeforeChapterClaim.unlocked).toBe(false);

    await prisma.playerTaskState.updateMany({
      where: { playerId, taskId: "chapter_first_30_minutes" },
      data: { progressValue: 1, status: "completed" },
    });
    await request(app.getHttpServer())
      .post("/api/game/tasks/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p19_first_chapter_${Date.now()}_${randomSuffix()}`)
      .send({ task_id: "chapter_first_30_minutes" })
      .expect(201);

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const provinces = new Map(
      overview.body.data.provinces.map((province: { province_id: string; unlocked: boolean }) => [
        province.province_id,
        province.unlocked,
      ]),
    );
    expect(overview.body.data.profile.progress.chapter_id).toBe(2);
    expect(provinces.get("ji")).toBe(true);
    expect(provinces.get("yan")).toBe(true);
    expect(provinces.get("qing")).toBe(false);
  });

  it("存量已领取冀州初定奖励的玩家会在读取总览时同步章节", async () => {
    const { token, playerId } = await createP19Player(app, prisma);
    await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    await prisma.$transaction([
      prisma.playerProgress.update({
        where: { playerId },
        data: { chapterId: 1 },
      }),
      prisma.playerTaskState.updateMany({
        where: { playerId, taskId: "chapter_first_30_minutes" },
        data: { progressValue: 1, status: "claimed" },
      }),
      prisma.playerProvinceProgress.update({
        where: { playerId_provinceId: { playerId, provinceId: "yan" } },
        data: { unlocked: false },
      }),
      prisma.provinceState.update({
        where: { eraId_provinceId: { eraId: defaultEraId, provinceId: "yan" } },
        data: { unlocked: false },
      }),
    ]);

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const yan = overview.body.data.provinces.find(
      (province: { province_id: string }) => province.province_id === "yan",
    );
    expect(overview.body.data.profile.progress.chapter_id).toBe(2);
    expect(yan).toMatchObject({ unlocked: true });
  });

  it("探索事件池包含稀有度、前置条件和选择差异，且不产出付费或唯一战力道具", async () => {
    expect(exploreEventConfigs.length).toBeGreaterThanOrEqual(8);
    expect(new Set(exploreEventConfigs.map((event) => event.rarity))).toEqual(
      new Set(["common", "uncommon", "rare"]),
    );

    for (const event of exploreEventConfigs) {
      expect(event.prerequisiteHint.length).toBeGreaterThan(0);
      expect(event.routeStepHint.length).toBeGreaterThan(0);
      expect(event.choices.length).toBeGreaterThanOrEqual(2);
      for (const choice of event.choices) {
        expect(choice.outcomeHint?.length ?? 0).toBeGreaterThan(0);
        expect(JSON.stringify(choice.rewards)).not.toContain("jade_paid");
        expect(JSON.stringify(choice.rewards)).not.toContain("jade_bound");
        expect(JSON.stringify(choice.rewards)).not.toContain("ancient_treasure");
      }
    }
  });

  it("探索途中触发带提示的奇遇，领取后保留战斗原因摘要", async () => {
    const { token } = await createP19Player(app, prisma);
    const event = await triggerEventAndClaimExplore(app, prisma, token);

    expect(event.rarity).toBeTruthy();
    expect(event.prerequisite_hint).toBeTruthy();
    expect(event.route_step_hint).toBeTruthy();
    expect(event.choices[0].outcome_hint).toBeTruthy();

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(overview.body.data.recent_battles[0].reason_summary.length).toBeGreaterThan(0);
  });

  it("章节任务未完成时不会把章节奖励标成可领取", async () => {
    const { token, playerId } = await createP19Player(app, prisma);
    await prisma.playerTaskState.updateMany({
      where: {
        playerId,
        taskId: {
          in: [
            "novice_explore_ji",
            "novice_resolve_event",
            "novice_craft_alchemy",
            "novice_tower_xuantie",
          ],
        },
      },
      data: { progressValue: 1, status: "completed" },
    });
    await prisma.playerTaskState.updateMany({
      where: { playerId, taskId: "chapter_first_30_minutes" },
      data: { progressValue: 0, status: "in_progress" },
    });

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(overview.body.data.tasks.find(
      (task: { task_id: string }) => task.task_id === "chapter_first_30_minutes",
    )).toMatchObject({ status: "in_progress" });
  });

  it("生产接口只公开可投炉材料，不再暴露默认丹方和器方", async () => {
    const { token, playerId } = await createP19Player(app, prisma);
    await grantStarterMaterials(prisma, playerId);

    const alchemy = await request(app.getHttpServer())
      .get("/api/production/materials?kind=alchemy")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(alchemy.body.data.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "alch_moon_dew_herb", kind: "alchemy" }),
        expect.objectContaining({ item_id: "alch_spirit_resin", kind: "alchemy" }),
        expect.objectContaining({
          item_id: "low_herb",
          kind: "alchemy",
          source_hint: "冀州探索、首章任务",
        }),
      ]),
    );

    const forge = await request(app.getHttpServer())
      .get("/api/production/materials?kind=forge")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(forge.body.data.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "forge_star_iron", kind: "forge" }),
        expect.objectContaining({ item_id: "forge_spiritwood_core", kind: "forge" }),
      ]),
    );

    await request(app.getHttpServer())
      .get("/api/production/alchemy/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get("/api/production/forge/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("新手主线可按探索、奇遇、炼丹、玄铁塔推进到章节奖励", async () => {
    const { token, playerId } = await createP19Player(app, prisma);
    await grantStarterMaterials(prisma, playerId);

    const event = await triggerEventAndClaimExplore(app, prisma, token);
    await request(app.getHttpServer())
      .post("/api/game/explore/events/resolve")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p19_event_${Date.now()}_${randomSuffix()}`)
      .send({ choice_id: event.choices[0].choice_id, event_id: event.event_id })
      .expect(201);

    const alchemyMaterials = [
      { item_id: "low_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    const alchemy = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set(
        "Idempotency-Key",
        findCraftSuccessKey("p19_alchemy", "alchemy", alchemyMaterials, 10000),
      )
      .send({ materials: alchemyMaterials })
      .expect(201);
    expect(alchemy.body.data.completed_task_ids).toContain("novice_craft_alchemy");

    await prisma.playerActionState.update({
      where: { playerId },
      data: { actionPoints: 20 },
    });
    const tower = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p19_tower_${Date.now()}_${randomSuffix()}`)
      .send({ action_type: "supply", count: 1, tower_id: "tower_xuantie" })
      .expect(201);
    expect(tower.body.data.completed_task_ids).toContain("novice_tower_xuantie");
    expect(tower.body.data.completed_task_ids).toContain("chapter_first_30_minutes");

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const chapterTask = overview.body.data.tasks.find(
      (task: { task_id: string }) => task.task_id === "chapter_first_30_minutes",
    );
    expect(chapterTask.status).toBe("completed");
    expect(overview.body.data.tasks.find(
      (task: { task_id: string }) => task.task_id === "chapter_first_30_minutes",
    )).toMatchObject({ status: "completed" });
  });
});

async function triggerEventAndClaimExplore(
  app: INestApplication,
  prisma: PrismaClient,
  token: string,
): Promise<{
  choices: Array<{ choice_id: string; outcome_hint?: string }>;
  event_id: string;
  prerequisite_hint?: string;
  rarity?: string;
  route_step_hint?: string;
}> {
  const started = await request(app.getHttpServer())
    .post("/api/game/actions/start")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p19_explore_${Date.now()}_${randomSuffix()}`)
    .send({ action_type: "explore", province_id: "ji" })
    .expect(201);

  const now = Date.now();
  const recordId = started.body.data.action.action_id as string;
  await prisma.exploreActionRecord.update({
    where: { recordId },
    data: {
      eventContextSnapshot: { itemIds: ["low_herb"], traits: ["毒蚀"] },
      eventTriggerAt: new Date(now - 1_000),
      lastSettledAt: new Date(now - 24 * 60 * 60_000),
      lastActiveAt: new Date(now),
    },
  });

  await request(app.getHttpServer())
    .get("/api/game/actions/current")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  const pending = await request(app.getHttpServer())
    .get("/api/game/explore/events?status=pending")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const event = pending.body.data.events[0];
  expect(event).toBeTruthy();

  const ended = await request(app.getHttpServer())
    .post("/api/game/actions/end")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p19_end_${Date.now()}_${randomSuffix()}`)
    .expect(201);

  expect(ended.body.data.rewards).toBeDefined();
  const battles = await request(app.getHttpServer())
    .get("/api/game/battles?battle_type=explore")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  expect(battles.body.data.battles[0].reason_summary.length).toBeGreaterThan(0);
  return event;
}

async function startLongExplore(
  app: INestApplication,
  token: string,
  prisma: PrismaClient,
): Promise<{ recordId: string }> {
  const started = await request(app.getHttpServer())
    .post("/api/game/actions/start")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p19_start_${Date.now()}_${randomSuffix()}`)
    .send({ action_type: "explore", province_id: "ji" })
    .expect(201);
  const recordId = started.body.data.action.action_id as string;
  await prisma.exploreActionRecord.update({
    where: { recordId },
    data: { lastActiveAt: new Date() },
  });
  return { recordId };
}

async function createP19Player(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p19_${nonce}`, nickname: "冀州道友" })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p19_create_${nonce}`)
    .send({ name: `冀州${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function grantStarterMaterials(prisma: PrismaClient, playerId: string) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: 2000n },
  });
  await prisma.playerItem.createMany({
    data: [
      {
        itemInstanceId: `item_p19_low_herb_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "low_herb",
        count: 4n,
        bindType: "bound",
        sourceType: "p1_9_test",
      },
      {
        itemInstanceId: `item_p19_spirit_resin_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "alch_spirit_resin",
        count: 2n,
        bindType: "bound",
        sourceType: "p1_9_test",
      },
      {
        itemInstanceId: `item_p19_star_iron_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "forge_star_iron",
        count: 3n,
        bindType: "bound",
        sourceType: "p1_9_test",
      },
      {
        itemInstanceId: `item_p19_spiritwood_core_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "forge_spiritwood_core",
        count: 1n,
        bindType: "bound",
        sourceType: "p1_9_test",
      },
    ],
  });
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
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
    if (roll10000(`${key}:${compositionHash}:success`) < threshold) {
      return key;
    }
  }
  throw new Error("未找到可成功结算的幂等键");
}

function roll10000(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return hash;
}
