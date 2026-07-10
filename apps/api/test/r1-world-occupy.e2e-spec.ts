import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 清野与领地占领", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-world-occupy-secret";
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

  it("已抵达的清野行军可以占领野地，并在地图上显示玩家归属", async () => {
    const { token, playerId } = await createR1OccupyPlayer(app, "占野");
    await settleMainCity(app, token, "拓荒仙城");
    const targetTile = await findMapTile(app, token, "ji", (tile) => tile.tile_type === "wild");
    const march = await startAndArriveMarch(app, prisma, token, {
      marchType: "clear_wild",
      targetTileId: targetTile.tile_id,
    });
    const idempotencyKey = `idem_r1_occupy_${Date.now()}_${randomSuffix()}`;

    const occupy = await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ march_id: march.march_id })
      .expect(201);

    expect(occupy.body.data.occupation).toMatchObject({
      tile_id: targetTile.tile_id,
      tile_name: targetTile.tile_name,
      province_id: "ji",
      occupation_type: "wild",
      status: "occupied",
      owner_player_id: playerId,
    });
    expect(occupy.body.data.occupation.production.spirit_stone_per_hour).toBeGreaterThan(0);
    expect(occupy.body.data.march).toMatchObject({
      march_id: march.march_id,
      status: "resolved",
      remaining_seconds: 0,
    });
    expect(occupy.body.data.map.my_occupations).toHaveLength(1);
    expect(
      occupy.body.data.map.tiles.find(
        (tile: { tile_id: string }) => tile.tile_id === targetTile.tile_id,
      ),
    ).toMatchObject({
      status: "occupied",
      owner: { owner_player_id: playerId },
      ownership: { owner_player_id: playerId, ownership_type: "occupation" },
    });

    const duplicate = await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ march_id: march.march_id })
      .expect(201);

    expect(duplicate.body.data.occupation.occupation_id).toBe(
      occupy.body.data.occupation.occupation_id,
    );

    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "ji" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(map.body.data.my_occupations).toHaveLength(1);
    expect(
      map.body.data.tiles.find((tile: { tile_id: string }) => tile.tile_id === targetTile.tile_id),
    ).toMatchObject({
      owner: { owner_player_id: playerId },
    });
  });

  it("未抵达、侦查队列和已处理队列不能占领", async () => {
    const { token } = await createR1OccupyPlayer(app, "限制");
    await settleMainCity(app, token, "边野仙城");
    const resourceTile = await findMapTile(
      app,
      token,
      "ji",
      (tile) => tile.tile_type === "resource",
    );
    const marching = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_occupy_marching_${Date.now()}_${randomSuffix()}`)
      .send({ target_tile_id: resourceTile.tile_id, march_type: "occupy" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_occupy_early_${Date.now()}_${randomSuffix()}`)
      .send({ march_id: marching.body.data.march.march_id })
      .expect(400);

    await prisma.marchQueue.update({
      where: { marchId: marching.body.data.march.march_id as string },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_occupy_resource_${Date.now()}_${randomSuffix()}`)
      .send({ march_id: marching.body.data.march.march_id })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_occupy_again_${Date.now()}_${randomSuffix()}`)
      .send({ march_id: marching.body.data.march.march_id })
      .expect(400);

    const scoutPlayer = await createR1OccupyPlayer(app, "侦查");
    await settleMainCity(app, scoutPlayer.token, "侦路仙城");
    const scoutTile = await findMapTile(
      app,
      scoutPlayer.token,
      "ji",
      (tile) => tile.tile_type === "wild",
    );
    const scout = await startAndArriveMarch(app, prisma, scoutPlayer.token, {
      marchType: "scout",
      targetTileId: scoutTile.tile_id,
    });

    await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${scoutPlayer.token}`)
      .set("Idempotency-Key", `idem_r1_occupy_scout_${Date.now()}_${randomSuffix()}`)
      .send({ march_id: scout.march_id })
      .expect(400);
  });

  it("玩家可购买相邻无主区块，不能购买已归属或非相邻区块", async () => {
    const { token, playerId } = await createR1OccupyPlayer(app, "买地");
    const settle = await settleMainCity(app, token, "拓土仙城");
    await prisma.playerWallet.update({
      where: { playerId },
      data: { spiritStone: 5000n },
    });

    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "ji", view: "detail" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const ownedTile = (map.body.data.tiles as TestMapTile[]).find(
      (tile) => tile.tile_id === settle.city.tile_id,
    );
    const adjacentTile = (map.body.data.tiles as TestMapTile[]).find(
      (tile) => tile.purchase_state.purchasable,
    );
    const farTile = (map.body.data.tiles as TestMapTile[]).find(
      (tile) =>
        !tile.ownership.owner_player_id &&
        !tile.purchase_state.purchasable &&
        tile.purchase_state.reason.includes("相邻") &&
        tile.tile_type !== "tower" &&
        tile.tile_type !== "capital" &&
        tile.tile_type !== "pass",
    );

    expect(ownedTile).toBeTruthy();
    expect(adjacentTile).toBeTruthy();
    expect(farTile).toBeTruthy();

    await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_purchase_owned_${Date.now()}_${randomSuffix()}`)
      .send({ tile_id: ownedTile?.tile_id })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_purchase_far_${Date.now()}_${randomSuffix()}`)
      .send({ tile_id: farTile?.tile_id })
      .expect(400);

    const beforeWallet = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });
    const purchaseKey = `idem_r1_purchase_ok_${Date.now()}_${randomSuffix()}`;
    const purchase = await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", purchaseKey)
      .send({ tile_id: adjacentTile?.tile_id })
      .expect(201);

    expect(purchase.body.data.tile).toMatchObject({
      tile_id: adjacentTile?.tile_id,
      ownership: { owner_player_id: playerId, ownership_type: "purchase" },
    });
    expect(BigInt(purchase.body.data.wallet.spirit_stone)).toBeLessThan(beforeWallet.spiritStone);
    const duplicate = await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", purchaseKey)
      .send({ tile_id: adjacentTile?.tile_id })
      .expect(201);

    expect(duplicate.body.data.tile.tile_id).toBe(purchase.body.data.tile.tile_id);
    const ownershipCount = await prisma.worldBlockOwnership.count({
      where: { playerId, tileId: adjacentTile?.tile_id },
    });
    expect(ownershipCount).toBe(1);
  });
});

interface TestMapTile {
  tile_id: string;
  tile_name: string;
  commandery_id: string;
  tile_type: string;
  ownership: { owner_player_id: string | null };
  purchase_state: { purchasable: boolean; reason: string };
}

async function createR1OccupyPlayer(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_occupy_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_occupy_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return { token, playerId: createResponse.body.data.profile.player.player_id as string };
}

async function settleMainCity(
  app: INestApplication,
  token: string,
  cityName: string,
): Promise<{ city: { tile_id: string } }> {
  const response = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_occupy_settle_${Date.now()}_${randomSuffix()}`)
    .send({ province_id: "ji", commandery_id: "ji_commandery_1", city_name: cityName })
    .expect(201);

  return { city: response.body.data.city };
}

async function findMapTile(
  app: INestApplication,
  token: string,
  provinceId: string,
  predicate: (tile: TestMapTile) => boolean,
): Promise<TestMapTile> {
  const map = await request(app.getHttpServer())
    .get("/api/world/map")
    .query({ province_id: provinceId, view: "detail" })
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const tile = (map.body.data.tiles as TestMapTile[]).find(
    (item) => !item.ownership.owner_player_id && predicate(item),
  );

  if (!tile) {
    throw new Error(`未找到 ${provinceId} 可用地块`);
  }

  return tile;
}

async function startAndArriveMarch(
  app: INestApplication,
  prisma: PrismaClient,
  token: string,
  input: { marchType: string; targetTileId: string },
): Promise<{ march_id: string }> {
  const march = await request(app.getHttpServer())
    .post("/api/world/march")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_occupy_march_${Date.now()}_${randomSuffix()}`)
    .send({ target_tile_id: input.targetTileId, march_type: input.marchType })
    .expect(201);
  const marchId = march.body.data.march.march_id as string;

  await prisma.marchQueue.update({
    where: { marchId },
    data: { arrivesAt: new Date(Date.now() - 1000) },
  });

  return { march_id: marchId };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
