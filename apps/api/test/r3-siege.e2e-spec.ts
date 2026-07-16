import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R3-01 围城、掠夺与分城易主", () => {
  const provinceId = "yong";
  let app: INestApplication;
  let prisma: PrismaClient;
  let attacker: TestPlayer;
  let defender: TestPlayer;
  let subCityId: string;
  let subCityTileId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r3-siege-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();

    attacker = await createPlayer(app, "攻城", provinceId);
    defender = await createPlayer(app, "守城", provinceId);
    await prisma.player.update({
      where: { playerId: attacker.playerId },
      data: { currentRealm: 3 },
    });
    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: provinceId, view: "detail" })
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    const tile = map.body.data.tiles.find(
      (item: {
        tile_id: string;
        terrain_type: string;
        ownership: { owner_player_id: string | null };
      }) => item.terrain_type === "plain" && !item.ownership.owner_player_id,
    ) as { tile_id: string; province_id: string; commandery_id: string } | undefined;
    if (!tile) throw new Error("缺少可建立测试分城的平原");
    subCityTileId = tile.tile_id;
    subCityId = `r3_sub_${nonce()}`;
    await prisma.worldBlockOwnership.create({
      data: {
        ownershipId: `r3_ownership_${nonce()}`,
        playerId: defender.playerId,
        eraId: "era_mvp_001",
        tileId: tile.tile_id,
        provinceId: tile.province_id,
        commanderyId: tile.commandery_id,
        terrainType: "plain",
        ownershipType: "sub_city",
        status: "owned",
        sourceType: "test",
        sourceId: subCityId,
        configVersion: "test",
      },
    });
    await prisma.playerCity.create({
      data: {
        cityId: subCityId,
        playerId: defender.playerId,
        eraId: "era_mvp_001",
        cityType: "sub",
        provinceId: tile.province_id,
        commanderyId: tile.commandery_id,
        tileId: tile.tile_id,
        cityName: "待夺分城",
        cityLevel: 1,
        status: "normal",
        defenseSnapshot: {
          wall_durability: 100,
          wall_durability_cap: 100,
          garrison_power: 0,
          protection_label: "城防正常",
        },
        resourceSnapshot: {
          spirit_stone: "500",
          grain: "500",
          ore: "500",
          wood: "500",
          herb: "0",
          soldier: "0",
        },
      },
    });
  });

  afterAll(async () => {
    const playerIds = [attacker?.playerId, defender?.playerId].filter(Boolean);
    if (playerIds.length) {
      await prisma.warMeritRecord.deleteMany({ where: { playerId: { in: playerIds } } });
      await prisma.siegeRecord.deleteMany({
        where: {
          OR: [{ attackerPlayerId: { in: playerIds } }, { defenderPlayerId: { in: playerIds } }],
        },
      });
      await prisma.worldBlockClearance.deleteMany({ where: { playerId: { in: playerIds } } });
      await prisma.marchQueue.deleteMany({ where: { playerId: { in: playerIds } } });
      await prisma.territoryGarrison.deleteMany({ where: { playerId: { in: playerIds } } });
      await prisma.cityArmyPreset.deleteMany({ where: { playerId: { in: playerIds } } });
      await prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: playerIds } } });
      await prisma.playerCity.deleteMany({ where: { playerId: { in: playerIds } } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it("侦察抵达后返回城池、城防、驻军和资源档位", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_r3_scout_${nonce()}`)
      .send({ target_tile_id: defender.cityTileId, march_type: "scout" })
      .expect(201);
    const marchId = response.body.data.march.march_id as string;
    await prisma.marchQueue.update({
      where: { marchId },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });
    const resolved = await request(app.getHttpServer())
      .post("/api/world/scout/resolve")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_r3_scout_resolve_${nonce()}`)
      .send({ march_id: marchId })
      .expect(201);
    expect(resolved.body.data.intel).toMatchObject({
      city_name: "守城主城",
      city_type: "main",
      city_level: 1,
      protected: true,
    });
  });

  it("攻破分城后转移分城与区块产权", async () => {
    const march = await startSiege(app, attacker.token, subCityTileId);
    await prisma.marchQueue.update({
      where: { marchId: march.march_id },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });
    const resolved = await request(app.getHttpServer())
      .post("/api/world/siege/resolve")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_r3_resolve_sub_${nonce()}`)
      .send({ march_id: march.march_id })
      .expect(201);

    expect(resolved.body.data.siege).toMatchObject({
      status: "captured",
      captured: true,
      ownership_transferred: true,
      target_city_id: subCityId,
    });
    const [city, ownership] = await Promise.all([
      prisma.playerCity.findUniqueOrThrow({ where: { cityId: subCityId } }),
      prisma.worldBlockOwnership.findUniqueOrThrow({
        where: { eraId_tileId: { eraId: "era_mvp_001", tileId: subCityTileId } },
      }),
    ]);
    expect(city.playerId).toBe(attacker.playerId);
    expect(ownership.playerId).toBe(attacker.playerId);
    const merit = await request(app.getHttpServer())
      .get("/api/world/war-merit")
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    expect(merit.body.data.entries[0]).toMatchObject({
      source_type: "siege",
      merit: 80,
      result: "captured",
    });
  });

  it("攻破主城只掠夺资源，不转移主城产权", async () => {
    await prisma.playerCity.update({
      where: { cityId: defender.cityId },
      data: {
        status: "normal",
        protectionUntil: null,
        defenseSnapshot: {
          wall_durability: 100,
          wall_durability_cap: 100,
          garrison_power: 0,
          protection_label: "城防正常",
        },
        resourceSnapshot: {
          spirit_stone: "1000",
          grain: "1000",
          ore: "1000",
          wood: "1000",
          herb: "0",
          soldier: "0",
        },
      },
    });
    const march = await startSiege(app, attacker.token, defender.cityTileId);
    await prisma.marchQueue.update({
      where: { marchId: march.march_id },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });
    const resolved = await request(app.getHttpServer())
      .post("/api/world/siege/resolve")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_r3_resolve_main_${nonce()}`)
      .send({ march_id: march.march_id })
      .expect(201);

    expect(resolved.body.data.siege).toMatchObject({
      captured: false,
      ownership_transferred: false,
      status: "won",
      plunder: { spirit_stone: "50", grain: "50", ore: "50", wood: "50" },
    });
    const [city, ownership] = await Promise.all([
      prisma.playerCity.findUniqueOrThrow({ where: { cityId: defender.cityId } }),
      prisma.worldBlockOwnership.findUniqueOrThrow({
        where: { eraId_tileId: { eraId: "era_mvp_001", tileId: defender.cityTileId } },
      }),
    ]);
    expect(city.playerId).toBe(defender.playerId);
    expect(ownership.playerId).toBe(defender.playerId);
    expect(city.status).toBe("besieged");

    await prisma.playerCity.update({
      where: { cityId: defender.cityId },
      data: {
        status: "normal",
        protectionUntil: null,
        defenseSnapshot: {
          wall_durability: 100,
          wall_durability_cap: 100,
          garrison_power: 0,
          protection_label: "城防正常",
        },
      },
    });
    const repeatedMarch = await startSiege(app, attacker.token, defender.cityTileId);
    await prisma.marchQueue.update({
      where: { marchId: repeatedMarch.march_id },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });
    const repeated = await request(app.getHttpServer())
      .post("/api/world/siege/resolve")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_r3_resolve_repeat_${nonce()}`)
      .send({ march_id: repeatedMarch.march_id })
      .expect(201);
    expect(repeated.body.data.siege.reward_rate_percent).toBe(50);
  });

  it("保护期内不能对主城发起围城", async () => {
    await prisma.playerCity.update({
      where: { cityId: defender.cityId },
      data: { protectionUntil: new Date(Date.now() + 60 * 60 * 1000), status: "protected" },
    });
    await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_r3_protected_${nonce()}`)
      .send({ target_tile_id: defender.cityTileId, march_type: "siege" })
      .expect(400);
  });
});

interface TestPlayer {
  token: string;
  playerId: string;
  cityId: string;
  cityTileId: string;
}

async function createPlayer(
  app: INestApplication,
  prefix: string,
  provinceId: string,
): Promise<TestPlayer> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r3_siege_${prefix}_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r3_create_${key}`)
    .send({ name: `${prefix}${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  const settled = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r3_settle_${key}`)
    .send({ province_id: provinceId, city_name: `${prefix}主城` })
    .expect(201);
  return {
    token,
    playerId: created.body.data.profile.player.player_id as string,
    cityId: settled.body.data.city.city_id as string,
    cityTileId: settled.body.data.city.tile_id as string,
  };
}

async function startSiege(app: INestApplication, token: string, tileId: string) {
  const response = await request(app.getHttpServer())
    .post("/api/world/march")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r3_march_${nonce()}`)
    .send({ target_tile_id: tileId, march_type: "siege" })
    .expect(201);
  return response.body.data.march as { march_id: string };
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
