import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const testProvinceId = "liang";
const testCommanderyId = "liang_commandery_1";

describe("R1 领地产出与主城扩建", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const testPlayerIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-territory-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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

  afterEach(async () => {
    if (testPlayerIds.length === 0) {
      return;
    }

    const playerIds = testPlayerIds.splice(0, testPlayerIds.length);
    await prisma.$transaction([
      prisma.territoryGarrison.deleteMany({ where: { playerId: { in: playerIds } } }),
      prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: playerIds } } }),
      prisma.playerCity.deleteMany({ where: { playerId: { in: playerIds } } }),
    ]);
  });

  it("归属区块按地形汇总产出，平原领地可支撑主城扩建", async () => {
    const { playerId, token } = await createPlayer(app, "领地", testPlayerIds);
    await settleMainCity(app, token, "拓土仙城");

    const before = await getTerritory(app, token);
    expect(before.owned_block_count).toBe(1);
    expect(before.block_limit).toBe(3);
    expect(before.terrain_summary).toContainEqual(
      expect.objectContaining({ terrain_type: "plain", block_count: 1 }),
    );
    expect(before.hourly_output.grain).toBeGreaterThan(0);
    expect(before.expansion).toMatchObject({ eligible: false, required_plain_blocks: 2 });
    expect(before.recommended_terrain_type).toBe("plain");
    expect(before.expansion_candidates.length).toBeGreaterThan(0);
    expect(before.expansion_candidates[0]).toMatchObject({
      terrain_type: "plain",
      x: expect.any(Number),
      y: expect.any(Number),
    });
    expect(["purchase", "clear_wild"]).toContain(before.expansion_candidates[0]?.action);

    const map = await getMap(app, token);
    const plainTile = map.find(
      (tile) => tile.terrain_type === "plain" && !tile.ownership.owner_player_id,
    );
    const mountainTile = map.find(
      (tile) => tile.terrain_type === "mountain" && !tile.ownership.owner_player_id,
    );
    expect(plainTile).toBeTruthy();
    expect(mountainTile).toBeTruthy();
    if (!plainTile || !mountainTile) {
      throw new Error("未找到可用的平原或山地区块");
    }

    await createOwnedTestBlock(prisma, playerId, plainTile);
    await request(app.getHttpServer())
      .post("/api/world/defend")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_territory_defend_${nonce()}`)
      .send({ tile_id: plainTile.tile_id, soldier_count: 8 })
      .expect(201);

    const afterPurchase = await getTerritory(app, token);
    expect(afterPurchase.owned_block_count).toBe(2);
    expect(afterPurchase.hourly_output.grain).toBeGreaterThan(before.hourly_output.grain);
    expect(afterPurchase.expansion).toMatchObject({ eligible: true, owned_plain_blocks: 2 });
    expect(afterPurchase.total_garrison_soldiers).toBe(8);
    expect(afterPurchase.total_garrison_power).toBe(16);
    expect(afterPurchase.blocks).toContainEqual(
      expect.objectContaining({
        tile_id: plainTile.tile_id,
        x: expect.any(Number),
        y: expect.any(Number),
        garrison: expect.objectContaining({ soldier_count: 8, defense_power: 16 }),
      }),
    );

    await createOwnedTestBlock(prisma, playerId, mountainTile);
    const afterMountain = await getTerritory(app, token);
    expect(afterMountain.terrain_summary).toContainEqual(
      expect.objectContaining({ terrain_type: "mountain", block_count: 1 }),
    );
    expect(afterMountain.hourly_output.ore).toBeGreaterThan(0);

    const expansionKey = `idem_r1_territory_expand_${nonce()}`;
    const expanded = await request(app.getHttpServer())
      .post("/api/city/expand")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", expansionKey)
      .send({})
      .expect(201);
    expect(expanded.body.data.city).toMatchObject({ city_level: 2 });
    expect(expanded.body.data.expansion).toMatchObject({ building_slots: 6, city_level: 2 });

    const duplicate = await request(app.getHttpServer())
      .post("/api/city/expand")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", expansionKey)
      .send({})
      .expect(201);
    expect(duplicate.body.data.record_id).toBe(expanded.body.data.record_id);
  });

  it("领地达到主城上限后不能继续购买", async () => {
    const { playerId, token } = await createPlayer(app, "上限", testPlayerIds);
    const city = await settleMainCity(app, token, "界城");
    await prisma.playerWallet.update({ where: { playerId }, data: { spiritStone: 5000n } });
    const map = await getMap(app, token);
    const extraTiles = map
      .filter((tile) => !tile.ownership.owner_player_id && tile.tile_id !== city.tile_id)
      .slice(0, 2);
    expect(extraTiles).toHaveLength(2);

    await prisma.worldBlockOwnership.createMany({
      data: extraTiles.map((tile, index) => ({
        ownershipId: `r1_territory_limit_${nonce()}_${index}`,
        playerId,
        eraId: "era_mvp_001",
        tileId: tile.tile_id,
        provinceId: tile.province_id,
        commanderyId: tile.commandery_id,
        terrainType: tile.terrain_type,
        ownershipType: "purchase",
        status: "owned",
        sourceType: "test",
        purchaseCost: 0n,
        configVersion: "test",
      })),
    });

    const purchaseTarget = map.find(
      (tile) => !tile.ownership.owner_player_id && tile.tile_type === "wild",
    );
    expect(purchaseTarget).toBeTruthy();
    if (!purchaseTarget) {
      throw new Error("未找到无主野地区块");
    }
    await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_territory_limit_purchase_${nonce()}`)
      .send({ tile_id: purchaseTarget.tile_id })
      .expect(400);
  });
});

interface TestMapTile {
  tile_id: string;
  province_id: string;
  commandery_id: string;
  tile_type: string;
  terrain_type: "plain" | "swamp" | "forest" | "mountain" | "desert";
  ownership: { owner_player_id: string | null };
  purchase_state: { purchasable: boolean };
}

async function createPlayer(
  app: INestApplication,
  prefix: string,
  testPlayerIds: string[],
): Promise<{ playerId: string; token: string }> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_territory_${prefix}_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_territory_create_${key}`)
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
): Promise<{ tile_id: string }> {
  const response = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_territory_settle_${nonce()}`)
    .send({
      province_id: testProvinceId,
      commandery_id: testCommanderyId,
      city_name: cityName,
    })
    .expect(201);

  return response.body.data.city as { tile_id: string };
}

async function getMap(app: INestApplication, token: string): Promise<TestMapTile[]> {
  const response = await request(app.getHttpServer())
    .get("/api/world/map")
    .query({ province_id: testProvinceId, view: "detail" })
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return response.body.data.tiles as TestMapTile[];
}

async function getTerritory(app: INestApplication, token: string) {
  const response = await request(app.getHttpServer())
    .get("/api/world/territory")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return response.body.data as {
    owned_block_count: number;
    total_garrison_soldiers: number;
    total_garrison_power: number;
    block_limit: number;
    hourly_output: { grain: number; ore: number };
    terrain_summary: Array<{ terrain_type: string; block_count: number }>;
    blocks: Array<{
      tile_id: string;
      x: number;
      y: number;
      garrison: { soldier_count: number; defense_power: number } | null;
    }>;
    expansion_candidates: Array<{
      tile_id: string;
      terrain_type: string;
      action: "purchase" | "clear_wild";
      x: number;
      y: number;
    }>;
    recommended_terrain_type: string | null;
    expansion: { eligible: boolean; required_plain_blocks: number; owned_plain_blocks: number };
  };
}

async function createOwnedTestBlock(
  prisma: PrismaClient,
  playerId: string,
  tile: TestMapTile,
): Promise<void> {
  await prisma.worldBlockOwnership.create({
    data: {
      ownershipId: `r1_territory_block_${nonce()}`,
      playerId,
      eraId: "era_mvp_001",
      tileId: tile.tile_id,
      provinceId: tile.province_id,
      commanderyId: tile.commandery_id,
      terrainType: tile.terrain_type,
      ownershipType: "purchase",
      status: "owned",
      sourceType: "test",
      purchaseCost: 0n,
      configVersion: "test",
    },
  });
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
