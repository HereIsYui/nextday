import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";
import { WorldService } from "../src/world/world.service";

describe("R6 永久九州世界、日周榜与大事记", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let worldService: WorldService;
  let player: TestPlayer;
  const periodEnd = new Date("2040-02-03T00:00:00+08:00");
  const settlementNow = new Date("2040-02-03T00:06:00+08:00");
  const periodKey = "day_2040-02-02";

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r6-permanent-world-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    worldService = app.get(WorldService);
    prisma = new PrismaClient();
    await prisma.$connect();
    player = await createPlayer(app, "常世榜首");
    await prisma.warMeritRecord.create({
      data: {
        recordId: `merit_r6_${nonce()}`,
        playerId: player.playerId,
        eraId: "era_mvp_001",
        provinceId: "ji",
        sourceType: "strategic_control",
        sourceId: `r6_source_${nonce()}`,
        merit: 120,
        result: "won",
        detailSnapshot: { summary: "永久世界榜单测试战功" },
        createdAt: new Date(periodEnd.getTime() - 60 * 60 * 1000),
      },
    });
    await prisma.worldChronicleEvent.create({
      data: {
        eventId: `chronicle_r6_${nonce()}`,
        eraId: "era_mvp_001",
        provinceId: "ji",
        playerId: player.playerId,
        eventType: "city_milestone",
        sourceType: "r6_test",
        sourceId: `r6_chronicle_${nonce()}`,
        title: "常世测试城扩建",
        summary: "主城里程碑应进入持续的大事记。",
        highlights: ["主城等级 3"],
        visibilityRule: "public",
        occurredAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    const playerIds = player?.playerId ? [player.playerId] : [];
    await prisma.worldCycleReward.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.worldCycleSettlement.deleteMany({
      where: { eraId: "era_mvp_001", cycleType: "daily", periodKey },
    });
    await prisma.rankEntry.deleteMany({ where: { snapshot: { periodKey } } });
    await prisma.rankSnapshot.deleteMany({ where: { periodKey } });
    await prisma.worldChronicleEvent.deleteMany({ where: { sourceType: "r6_test" } });
    await prisma.warMeritRecord.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.playerCity.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  it("不再暴露赛季路由，并将日榜奖励结算为普通城池资源", async () => {
    await request(app.getHttpServer())
      .get("/api/world/season")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(404);

    await worldService.settleWorldCyclesForTest(settlementNow);
    await worldService.settleWorldCyclesForTest(settlementNow);

    const settlements = await prisma.worldCycleSettlement.findMany({
      where: { eraId: "era_mvp_001", cycleType: "daily", periodKey },
    });
    expect(settlements).toHaveLength(1);

    const ranking = await request(app.getHttpServer())
      .get("/api/world/rankings")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);
    const reward = ranking.body.data.pending_rewards.find(
      (item: { cycle_type: string; period_key: string }) =>
        item.cycle_type === "daily" && item.period_key === periodKey,
    );
    expect(reward).toMatchObject({
      rank_no: 1,
      rewards: {
        spirit_stone: expect.any(Number),
        grain: expect.any(Number),
        herb: expect.any(Number),
        ore: expect.any(Number),
        wood: expect.any(Number),
      },
    });
    expect(reward.rewards).not.toHaveProperty("jade_paid");
    expect(reward.rewards).not.toHaveProperty("jade_bound");

    const before = await prisma.playerCity.findUniqueOrThrow({ where: { cityId: player.cityId } });
    const beforeResources = before.resourceSnapshot as Record<string, string>;
    const idempotencyKey = `idem_r6_claim_${nonce()}`;
    const first = await request(app.getHttpServer())
      .post("/api/world/rankings/rewards/claim")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ reward_id: reward.reward_id })
      .expect(201);
    expect(first.body.data.reward.status).toBe("claimed");
    expect(Number(first.body.data.city.resources.spirit_stone)).toBe(
      Number(beforeResources.spirit_stone) + reward.rewards.spirit_stone,
    );
    await request(app.getHttpServer())
      .post("/api/world/rankings/rewards/claim")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ reward_id: reward.reward_id })
      .expect(201);
  });

  it("持续大事记独立于个人战报并可按公开范围读取", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/world/chronicle?scope=all&limit=10")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);
    expect(response.body.data.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: "city_milestone",
          title: "常世测试城扩建",
        }),
      ]),
    );
  });
});

async function createPlayer(app: INestApplication, prefix: string): Promise<TestPlayer> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r6_permanent_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r6_player_${key}`)
    .send({ name: `${prefix}${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  const settled = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r6_city_${key}`)
    .send({ province_id: "yong", city_name: `${prefix}城`.slice(0, 16) })
    .expect(201);
  return {
    token,
    playerId: created.body.data.profile.player.player_id as string,
    cityId: settled.body.data.city.city_id as string,
  };
}

interface TestPlayer {
  token: string;
  playerId: string;
  cityId: string;
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
