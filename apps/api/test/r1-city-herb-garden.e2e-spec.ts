import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 城内药园", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const testPlayerIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-city-garden-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    const playerIds = testPlayerIds.splice(0, testPlayerIds.length);
    if (playerIds.length === 0) return;
    await prisma.$transaction([
      prisma.cityHerbGardenPlot.deleteMany({ where: { playerId: { in: playerIds } } }),
      prisma.playerItem.deleteMany({ where: { playerId: { in: playerIds } } }),
      prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: playerIds } } }),
      prisma.playerCity.deleteMany({ where: { playerId: { in: playerIds } } }),
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("首座分城解锁药园，种植与收获不会被重复请求重复结算", async () => {
    const { playerId, token } = await createPlayer(app, testPlayerIds);
    const cityId = await settleMainCity(app, token);

    const locked = await garden(app, token);
    expect(locked.unlocked).toBe(false);
    expect(locked.unlock_hint).toContain("分城");

    const city = await prisma.playerCity.findUniqueOrThrow({ where: { cityId } });
    await prisma.playerCity.create({
      data: {
        cityId: `garden_sub_${nonce()}`,
        playerId,
        eraId: city.eraId,
        cityType: "sub",
        provinceId: city.provinceId,
        commanderyId: city.commanderyId,
        tileId: `garden_tile_${nonce()}`,
        cityName: "药园分城",
        cityLevel: 1,
        status: "normal",
        defenseSnapshot: {},
        resourceSnapshot: {},
      },
    });

    const unlocked = await garden(app, token);
    expect(unlocked).toMatchObject({ unlocked: true, plot_count: 2, ready_count: 0 });
    const plotId = unlocked.plots[0]?.plot_id;
    expect(plotId).toBeTruthy();

    const plantKey = `idem_r1_garden_plant_${nonce()}`;
    const planted = await request(app.getHttpServer())
      .post("/api/city/garden/plant")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", plantKey)
      .send({ plot_id: plotId })
      .expect(201);
    expect(planted.body.data.garden.plots[0]).toMatchObject({
      status: "growing",
      herb_id: "low_herb",
    });

    const duplicatePlant = await request(app.getHttpServer())
      .post("/api/city/garden/plant")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", plantKey)
      .send({ plot_id: plotId })
      .expect(201);
    expect(duplicatePlant.body.data.record_id).toBe(planted.body.data.record_id);

    await prisma.cityHerbGardenPlot.update({
      where: { plotId },
      data: { readyAt: new Date(Date.now() - 1000) },
    });
    const harvestKey = `idem_r1_garden_harvest_${nonce()}`;
    const harvested = await request(app.getHttpServer())
      .post("/api/city/garden/harvest")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", harvestKey)
      .send({ plot_id: plotId })
      .expect(201);
    expect(harvested.body.data).toMatchObject({
      harvested_item_id: "low_herb",
      harvested_count: 3,
    });

    const duplicateHarvest = await request(app.getHttpServer())
      .post("/api/city/garden/harvest")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", harvestKey)
      .send({ plot_id: plotId })
      .expect(201);
    expect(duplicateHarvest.body.data.record_id).toBe(harvested.body.data.record_id);
    const herbs = await prisma.playerItem.aggregate({
      where: { playerId, itemId: "low_herb", sourceType: "city_herb_garden" },
      _sum: { count: true },
    });
    expect(Number(herbs._sum.count)).toBe(3);
  });
});

async function createPlayer(
  app: INestApplication,
  testPlayerIds: string[],
): Promise<{ playerId: string; token: string }> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_city_garden_${key}`, nickname: `药园${key.slice(-4)}` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_garden_create_${key}`)
    .send({ name: `药园${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = created.body.data.profile.player.player_id as string;
  testPlayerIds.push(playerId);
  return { playerId, token };
}

async function settleMainCity(app: INestApplication, token: string): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_garden_settle_${nonce()}`)
    .send({ province_id: "yong", commandery_id: "yong_commandery_1", city_name: "药园仙城" })
    .expect(201);
  return response.body.data.city.city_id as string;
}

async function garden(app: INestApplication, token: string) {
  const response = await request(app.getHttpServer())
    .get("/api/city/garden")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return response.body.data as {
    unlocked: boolean;
    unlock_hint: string;
    plot_count: number;
    ready_count: number;
    plots: Array<{ plot_id: string; herb_id: string | null; status: string }>;
  };
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
