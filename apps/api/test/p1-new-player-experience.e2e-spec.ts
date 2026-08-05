import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { exploreEventConfigs } from "../src/game/game.constants";
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

  it("overview 返回服务端新手路线，并为老玩家补齐 P1-9 任务", async () => {
    const { token } = await createP19Player(app, prisma);

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(overview.body.data.new_player_route.route_id).toBe("first_30_minutes_ji");
    expect(
      overview.body.data.new_player_route.steps.map((step: { step_id: string }) => step.step_id),
    ).toEqual([
      "enter_ji",
      "first_explore",
      "resolve_event",
      "craft_alchemy",
      "seal_xuantie",
      "claim_chapter_reward",
    ]);
    expect(overview.body.data.new_player_route.primary_action_hint).toBe("explore");
    expect(
      overview.body.data.tasks.some(
        (task: { task_id: string }) => task.task_id === "chapter_first_30_minutes",
      ),
    ).toBe(true);
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
    expect(overview.body.data.new_player_route.primary_action_hint).toBe("explore_event");
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
    const chapterRouteStep = overview.body.data.new_player_route.steps.find(
      (step: { step_id: string }) => step.step_id === "claim_chapter_reward",
    );
    expect(chapterRouteStep.status).toBe("pending");
    expect(chapterRouteStep.action_label).toBe("查看章节任务");
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
      ]),
    );
    expect(
      alchemy.body.data.materials.some(
        (material: { item_id: string }) => material.item_id === "low_herb",
      ),
    ).toBe(false);

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
      { item_id: "alch_moon_dew_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    const alchemy = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", findCraftSuccessKey("p19_alchemy", "alchemy", alchemyMaterials, 8800))
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
      .send({ action_type: "seal", count: 1, tower_id: "tower_xuantie" })
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
    expect(overview.body.data.new_player_route.primary_action_hint).toBe("task");
    const chapterRouteStep = overview.body.data.new_player_route.steps.find(
      (step: { step_id: string }) => step.step_id === "claim_chapter_reward",
    );
    expect(chapterRouteStep.status).toBe("active");
    expect(chapterRouteStep.action_label).toBe("领取章节奖励");
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
    .post("/api/game/explore")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p19_explore_${Date.now()}_${randomSuffix()}`)
    .send({ count: 1, province_id: "ji" })
    .expect(201);

  const now = Date.now();
  const recordId = started.body.data.record_id as string;
  await prisma.exploreActionRecord.update({
    where: { recordId },
    data: {
      completesAt: new Date(now + 60_000),
      eventContextSnapshot: { itemIds: ["low_herb"], traits: ["毒蚀"] },
      eventTriggerAt: new Date(now - 1_000),
      startedAt: new Date(now - 10_000),
      status: "pending",
    },
  });

  const pending = await request(app.getHttpServer())
    .get("/api/game/explore/events?status=pending")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const event = pending.body.data.events[0];
  expect(event).toBeTruthy();

  await prisma.exploreActionRecord.update({
    where: { recordId },
    data: { completesAt: new Date(Date.now() - 1_000) },
  });

  const claimed = await request(app.getHttpServer())
    .post("/api/game/explore/claim")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p19_claim_${Date.now()}_${randomSuffix()}`)
    .send({ record_id: recordId })
    .expect(201);

  expect(claimed.body.data.battles[0].reason_summary.length).toBeGreaterThan(0);
  expect(claimed.body.data.event).toBeNull();
  return event;
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
        itemInstanceId: `item_p19_moon_herb_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "alch_moon_dew_herb",
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
