import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const testProvinceId = "yong";
const testCommanderyId = "yong_commandery_1";

describe("R1 领地产出收取与主城建筑", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const testPlayerIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-city-management-secret";
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
    if (playerIds.length === 0) {
      return;
    }
    await prisma.$transaction([
      prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: playerIds } } }),
      prisma.playerCity.deleteMany({ where: { playerId: { in: playerIds } } }),
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("领地产出按离线时长累计，重复收取不重复入库", async () => {
    const { playerId, token } = await createPlayer(app, "收取", testPlayerIds);
    const cityId = await settleMainCity(app, token, "雍关仙城");
    await prisma.playerCity.update({
      where: { cityId },
      data: { territoryCollectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const before = await management(app, token);
    expect(before.territory_collect.elapsed_seconds).toBeGreaterThanOrEqual(7199);
    expect(before.territory_collect.claimable.grain).toBeGreaterThan(0);
    expect(before.buildings).toHaveLength(4);
    expect(before.buildings.map((building) => building.building_type).sort()).toEqual([
      "barracks",
      "fortification",
      "warehouse",
      "workshop",
    ]);

    const key = `idem_r1_city_collect_${nonce()}`;
    const collect = await request(app.getHttpServer())
      .post("/api/city/territory/collect")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({})
      .expect(201);
    expect(collect.body.data.collected.grain).toBeGreaterThan(0);
    expect(Number(collect.body.data.city.resources.grain)).toBeGreaterThan(1200);
    expect(collect.body.data.overflow.grain).toBe(0);

    const duplicate = await request(app.getHttpServer())
      .post("/api/city/territory/collect")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({})
      .expect(201);
    expect(duplicate.body.data.record_id).toBe(collect.body.data.record_id);
    expect(duplicate.body.data.city.resources.grain).toBe(collect.body.data.city.resources.grain);
    expect(playerId.length).toBeGreaterThan(0);
  });

  it("主城一次只允许一个建筑升级，到时会自动完成", async () => {
    const { token } = await createPlayer(app, "建筑", testPlayerIds);
    const cityId = await settleMainCity(app, token, "古都仙城");
    const upgradeKey = `idem_r1_city_building_${nonce()}`;

    const upgrade = await request(app.getHttpServer())
      .post("/api/city/buildings/upgrade")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", upgradeKey)
      .send({ building_type: "warehouse" })
      .expect(201);
    expect(upgrade.body.data.building).toMatchObject({
      building_type: "warehouse",
      level: 1,
      target_level: 2,
      status: "upgrading",
    });
    expect(upgrade.body.data.building.remaining_seconds).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post("/api/city/buildings/upgrade")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_city_second_${nonce()}`)
      .send({ building_type: "barracks" })
      .expect(400);

    const warehouse = await prisma.cityBuilding.findFirstOrThrow({
      where: { cityId, buildingType: "warehouse" },
    });
    await prisma.cityBuilding.update({
      where: { buildingId: warehouse.buildingId },
      data: { upgradeEndsAt: new Date(Date.now() - 1000) },
    });

    const synced = await management(app, token);
    const completedWarehouse = synced.buildings.find(
      (building) => building.building_type === "warehouse",
    );
    expect(completedWarehouse).toMatchObject({ level: 2, status: "idle", target_level: null });
    expect(synced.active_building).toBeNull();
    expect(synced.territory_collect.storage_capacity.grain).toBeGreaterThan(7000);
  });
});

async function createPlayer(
  app: INestApplication,
  prefix: string,
  testPlayerIds: string[],
): Promise<{ playerId: string; token: string }> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_city_management_${prefix}_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_city_management_create_${key}`)
    .send({ name: `${prefix}${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = created.body.data.profile.player.player_id as string;
  testPlayerIds.push(playerId);
  return { playerId, token };
}

async function settleMainCity(
  app: INestApplication,
  token: string,
  cityName: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_city_management_settle_${nonce()}`)
    .send({
      province_id: testProvinceId,
      commandery_id: testCommanderyId,
      city_name: cityName,
    })
    .expect(201);
  return response.body.data.city.city_id as string;
}

async function management(app: INestApplication, token: string) {
  const response = await request(app.getHttpServer())
    .get("/api/city/management")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return response.body.data as {
    active_building: { building_type: string } | null;
    buildings: Array<{
      building_type: string;
      level: number;
      status: string;
      target_level: number | null;
    }>;
    territory_collect: {
      elapsed_seconds: number;
      claimable: { grain: number };
      storage_capacity: { grain: number };
    };
  };
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
