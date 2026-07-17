import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R5-01C 州战赛季结算与奖励", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let leader: TestPlayer;
  let runnerUp: TestPlayer;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r5-war-season-secret";
    process.env.WORLD_SETTLEMENT_TOKEN = "r5-settlement-token";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.warSeasonSettlement.deleteMany({
      where: { seasonId: "season_city_era_001" },
    });
    await prisma.rankSnapshot.deleteMany({ where: { rankType: "season_player" } });
    await prisma.eraChronicleRecord.deleteMany({ where: { chronicleType: "city_era" } });
    leader = await createPlayer(app, "赛季榜首");
    runnerUp = await createPlayer(app, "赛季次席");
    await prisma.warMeritRecord.createMany({
      data: [
        meritRecord(leader.playerId, 120, "leader"),
        meritRecord(runnerUp.playerId, 80, "runner"),
      ],
    });
  });

  afterAll(async () => {
    const playerIds = [leader?.playerId, runnerUp?.playerId].filter(Boolean);
    await prisma.warMeritRecord.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.warSeasonSettlement.deleteMany({
      where: { seasonId: "season_city_era_001" },
    });
    await prisma.rankSnapshot.deleteMany({ where: { rankType: "season_player" } });
    await prisma.eraChronicleRecord.deleteMany({ where: { chronicleType: "city_era" } });
    await prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.playerCity.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.$disconnect();
    await app.close();
  });

  it("只有持有结算密钥的请求能锁榜并生成普通资源奖励", async () => {
    await request(app.getHttpServer())
      .post("/api/world/season/settle")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_bad_${nonce()}`)
      .set("X-Settlement-Token", "wrong-token")
      .send({})
      .expect(400);

    const settled = await request(app.getHttpServer())
      .post("/api/world/season/settle")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_settle_${nonce()}`)
      .set("X-Settlement-Token", "r5-settlement-token")
      .send({})
      .expect(201);
    expect(settled.body.data).toMatchObject({
      status: "settled",
      generated_reward_count: 2,
    });
    expect(settled.body.data.final_rankings[0]).toMatchObject({
      target_id: leader.playerId,
      rank_no: 1,
      score: 120,
    });
    expect(settled.body.data.my_reward).toMatchObject({
      rank_no: 1,
      status: "claimable",
      rewards: { spirit_stone: 1000, grain: 800, ore: 400, wood: 400 },
    });
    expect(settled.body.data.my_reward.rewards).not.toHaveProperty("paid_jade");
    expect(settled.body.data.my_reward.rewards).not.toHaveProperty("bound_jade");

    const chronicle = await request(app.getHttpServer())
      .get("/api/story/era-chronicle")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const cityEra = chronicle.body.data.entries.find(
      (entry: { chronicle_type: string }) => entry.chronicle_type === "city_era",
    );
    expect(cityEra).toMatchObject({
      title: "九州城池纪元先遣季",
      strategic_summary: {
        captured_sub_city_count: expect.any(Number),
      },
    });
    expect(cityEra.strategic_summary.top_players[0]).toMatchObject({
      rank_no: 1,
      player_name: expect.any(String),
      merit: 120,
    });
    await prisma.warMeritRecord.create({
      data: meritRecord(leader.playerId, 999, "after_settlement"),
    });
    const repeatedChronicle = await request(app.getHttpServer())
      .get("/api/story/era-chronicle")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const repeatedCityEra = repeatedChronicle.body.data.entries.find(
      (entry: { chronicle_type: string }) => entry.chronicle_type === "city_era",
    );
    expect(repeatedCityEra.strategic_summary.top_players[0].merit).toBe(120);
  });

  it("同一领取键重复请求不会重复增加主城资源", async () => {
    const state = await request(app.getHttpServer())
      .get("/api/world/season")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const rewardId = state.body.data.my_reward.reward_id as string;
    const before = await prisma.playerCity.findUniqueOrThrow({ where: { cityId: leader.cityId } });
    const beforeResources = before.resourceSnapshot as Record<string, string>;
    const idempotencyKey = `idem_claim_${nonce()}`;
    const first = await claimReward(app, leader.token, rewardId, idempotencyKey, 201);
    expect(first.body.data.reward.status).toBe("claimed");
    expect(Number(first.body.data.city.resources.spirit_stone)).toBe(
      Number(beforeResources.spirit_stone) + 1000,
    );
    const repeated = await claimReward(app, leader.token, rewardId, idempotencyKey, 201);
    expect(repeated.body.data.city.resources).toEqual(first.body.data.city.resources);
    await claimReward(app, leader.token, rewardId, `idem_other_${nonce()}`, 400);
  });
});

async function claimReward(
  app: INestApplication,
  token: string,
  rewardId: string,
  idempotencyKey: string,
  status: number,
) {
  return request(app.getHttpServer())
    .post("/api/world/season/rewards/claim")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", idempotencyKey)
    .send({ reward_id: rewardId })
    .expect(status);
}

function meritRecord(playerId: string, merit: number, suffix: string) {
  const id = `${nonce()}_${suffix}`;
  return {
    recordId: `merit_${id}`,
    playerId,
    provinceId: "liang",
    sourceType: "strategic_control",
    sourceId: `source_${id}`,
    merit,
    result: "won",
    detailSnapshot: { summary: "赛季测试战功" },
  };
}

async function createPlayer(app: INestApplication, prefix: string): Promise<TestPlayer> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r5_season_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r5_player_${key}`)
    .send({ name: `${prefix}${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  const settled = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r5_city_${key}`)
    .send({ province_id: "liang", city_name: `${prefix}城`.slice(0, 16) })
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
