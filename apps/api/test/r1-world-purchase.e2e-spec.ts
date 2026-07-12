import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 区块购买制", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-world-purchase-secret";
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

  it("拒绝占领行军与旧占领接口，清野抵达不会产生区块产权", async () => {
    const { token, playerId } = await createPlayer(app, "清野");
    const city = await settleMainCity(app, token, "拓荒仙城");
    const targetTile = await findMapTile(
      app,
      token,
      city.province_id,
      (tile) => tile.tile_type === "wild" && !tile.ownership.owner_player_id,
    );

    await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_reject_occupy_${nonce()}`)
      .send({ target_tile_id: targetTile.tile_id, march_type: "occupy" })
      .expect(400);

    const march = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_clear_${nonce()}`)
      .send({ target_tile_id: targetTile.tile_id, march_type: "clear_wild" })
      .expect(201);
    await prisma.marchQueue.update({
      where: { marchId: march.body.data.march.march_id as string },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });

    await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_removed_api_${nonce()}`)
      .send({ march_id: march.body.data.march.march_id })
      .expect(404);

    const ownership = await prisma.worldBlockOwnership.findUnique({
      where: { eraId_tileId: { eraId: "era_mvp_001", tileId: targetTile.tile_id } },
    });
    expect(ownership).toBeNull();
    expect(await prisma.worldBlockOwnership.count({ where: { playerId } })).toBe(1);
  });

  it("只允许购买相邻无主区块，并保持扣款与产权幂等", async () => {
    const { token, playerId } = await createPlayer(app, "买地");
    const city = await settleMainCity(app, token, "拓土仙城");
    await prisma.playerWallet.update({
      where: { playerId },
      data: { spiritStone: 5000n },
    });
    const tiles = await getMap(app, token, city.province_id);
    const ownedTile = tiles.find((tile) => tile.tile_id === city.tile_id);
    const adjacentTile = tiles.find((tile) => tile.purchase_state.purchasable);
    const farTile = tiles.find(
      (tile) =>
        !tile.ownership.owner_player_id &&
        !tile.purchase_state.purchasable &&
        tile.purchase_state.reason.includes("相邻") &&
        !["tower", "capital", "pass"].includes(tile.tile_type),
    );
    expect(ownedTile).toBeTruthy();
    expect(adjacentTile).toBeTruthy();
    expect(farTile).toBeTruthy();

    await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_owned_${nonce()}`)
      .send({ tile_id: ownedTile?.tile_id })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_far_${nonce()}`)
      .send({ tile_id: farTile?.tile_id })
      .expect(400);

    const walletBefore = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });
    const idempotencyKey = `idem_purchase_success_${nonce()}`;
    const purchase = await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ tile_id: adjacentTile?.tile_id })
      .expect(201);
    expect(purchase.body.data.tile).toMatchObject({
      tile_id: adjacentTile?.tile_id,
      ownership: { owner_player_id: playerId, ownership_type: "purchase" },
    });

    const duplicate = await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ tile_id: adjacentTile?.tile_id })
      .expect(201);
    expect(duplicate.body.data.record_id).toBe(purchase.body.data.record_id);
    expect(
      await prisma.worldBlockOwnership.count({
        where: { playerId, tileId: adjacentTile?.tile_id },
      }),
    ).toBe(1);
    const walletAfter = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });
    expect(walletAfter.spiritStone).toBeLessThan(walletBefore.spiritStone);

    const defendKey = `idem_purchase_defend_${nonce()}`;
    const defend = await request(app.getHttpServer())
      .post("/api/world/defend")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", defendKey)
      .send({ tile_id: adjacentTile?.tile_id, soldier_count: 10 })
      .expect(201);
    expect(defend.body.data.garrison).toMatchObject({
      tile_id: adjacentTile?.tile_id,
      soldier_count: 10,
      defense_power: 20,
      is_mine: true,
    });
    expect(defend.body.data.city.resources.soldier).toBe("50");

    const duplicateDefend = await request(app.getHttpServer())
      .post("/api/world/defend")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", defendKey)
      .send({ tile_id: adjacentTile?.tile_id, soldier_count: 10 })
      .expect(201);
    expect(duplicateDefend.body.data.record_id).toBe(defend.body.data.record_id);
    expect(
      await prisma.territoryGarrison.findUnique({
        where: {
          eraId_tileId: { eraId: "era_mvp_001", tileId: adjacentTile?.tile_id ?? "" },
        },
      }),
    ).toMatchObject({ soldierCount: 10, defensePower: 20 });
  });
});

interface TestMapTile {
  tile_id: string;
  tile_type: string;
  ownership: { owner_player_id: string | null };
  purchase_state: { purchasable: boolean; reason: string };
}

async function createPlayer(
  app: INestApplication,
  prefix: string,
): Promise<{ token: string; playerId: string }> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_purchase_${prefix}_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_purchase_create_${key}`)
    .send({ name: `${prefix}${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  return { token, playerId: created.body.data.profile.player.player_id as string };
}

async function settleMainCity(
  app: INestApplication,
  token: string,
  cityName: string,
): Promise<{ tile_id: string; province_id: string }> {
  const overview = await request(app.getHttpServer())
    .get("/api/city/overview")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const birthOption = overview.body.data.birth_options.find(
    (option: { available: boolean }) => option.available,
  ) as { province_id: string } | undefined;
  if (!birthOption) {
    throw new Error("当前开发世界没有可用出生州");
  }
  const response = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_purchase_settle_${nonce()}`)
    .send({ province_id: birthOption.province_id, city_name: cityName })
    .expect(201);
  return response.body.data.city as { tile_id: string; province_id: string };
}

async function getMap(
  app: INestApplication,
  token: string,
  provinceId: string,
): Promise<TestMapTile[]> {
  const response = await request(app.getHttpServer())
    .get("/api/world/map")
    .query({ province_id: provinceId, view: "detail" })
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return response.body.data.tiles as TestMapTile[];
}

async function findMapTile(
  app: INestApplication,
  token: string,
  provinceId: string,
  predicate: (tile: TestMapTile) => boolean,
): Promise<TestMapTile> {
  const tile = (await getMap(app, token, provinceId)).find(predicate);
  if (!tile) {
    throw new Error("未找到符合条件的测试区块");
  }
  return tile;
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
