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

  it("清野成功只解锁个人购买资格，不会直接产生区块产权", async () => {
    const { token, playerId } = await createPlayer(app, "清野");
    const city = await settleMainCity(app, token, "拓荒仙城");
    const targetTile = await positionCityAtClearanceFrontier(
      app,
      prisma,
      token,
      playerId,
      city.province_id,
    );

    await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_reject_occupy_${nonce()}`)
      .send({ target_tile_id: targetTile.tile_id, march_type: "occupy" })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/world/occupy")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_removed_api_${nonce()}`)
      .send({ march_id: "removed" })
      .expect(404);

    await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_before_clear_${nonce()}`)
      .send({ tile_id: targetTile.tile_id })
      .expect(400);

    const clearance = await clearTile(app, prisma, token, targetTile.tile_id);
    expect(clearance.body.data).toMatchObject({
      cleared: true,
      clearance: { tile_id: targetTile.tile_id, status: "cleared" },
      battle: { battle_type: "world_clearance", result: "win" },
      march: { status: "resolved" },
    });
    expect(
      clearance.body.data.map.tiles.find((tile: TestMapTile) => tile.tile_id === targetTile.tile_id)
        ?.purchase_state,
    ).toMatchObject({ purchasable: true, clearance_status: "cleared" });

    const ownership = await prisma.worldBlockOwnership.findUnique({
      where: { eraId_tileId: { eraId: "era_mvp_001", tileId: targetTile.tile_id } },
    });
    expect(ownership).toBeNull();
    expect(await prisma.worldBlockOwnership.count({ where: { playerId } })).toBe(1);

    const other = await createPlayer(app, "旁观");
    await settleMainCity(app, other.token, "旁观仙城");
    await positionCityNextToTarget(app, prisma, other.token, other.playerId, targetTile);
    const otherView = (await getMap(app, other.token, targetTile.province_id)).find(
      (tile) => tile.tile_id === targetTile.tile_id,
    );
    expect(otherView?.purchase_state).toMatchObject({
      adjacent_owned: true,
      clearance_status: "required",
      purchasable: false,
    });
  });

  it("只允许购买相邻无主区块，并保持扣款与产权幂等", async () => {
    const { token, playerId } = await createPlayer(app, "买地");
    const city = await settleMainCity(app, token, "拓土仙城");
    const clearanceTarget = await positionCityAtClearanceFrontier(
      app,
      prisma,
      token,
      playerId,
      city.province_id,
    );
    await prisma.playerWallet.update({
      where: { playerId },
      data: { spiritStone: 5000n },
    });
    const tiles = await getMap(app, token, city.province_id);
    const ownedTile = tiles.find((tile) => tile.tile_id === city.tile_id);
    const adjacentTile = tiles.find((tile) => tile.tile_id === clearanceTarget.tile_id);
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

    if (!adjacentTile) {
      throw new Error("未找到可清野购买的相邻区块");
    }
    await clearTile(app, prisma, token, adjacentTile.tile_id);

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

  it("清野失败不会解锁购买资格，玩家可以重新整军出发", async () => {
    const { token, playerId } = await createPlayer(app, "败退");
    const city = await settleMainCity(app, token, "边荒仙城");
    const target = await positionCityAtClearanceFrontier(
      app,
      prisma,
      token,
      playerId,
      city.province_id,
    );
    const march = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_failed_clear_${nonce()}`)
      .send({ target_tile_id: target.tile_id, march_type: "clear_wild" })
      .expect(201);
    await prisma.marchQueue.update({
      where: { marchId: march.body.data.march.march_id as string },
      data: {
        arrivesAt: new Date(Date.now() - 1000),
        teamSnapshot: {
          leader_name: "败退测试先锋",
          soldier_count: 1,
          supply_cost: 1,
          team_power: 1,
        },
      },
    });
    const resolved = await request(app.getHttpServer())
      .post("/api/world/clear-wild/resolve")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_failed_resolve_${nonce()}`)
      .send({ march_id: march.body.data.march.march_id })
      .expect(201);
    expect(resolved.body.data).toMatchObject({
      cleared: false,
      clearance: { status: "failed", tile_id: target.tile_id },
      battle: { result: "lose" },
    });
    expect(
      resolved.body.data.map.tiles.find((tile: TestMapTile) => tile.tile_id === target.tile_id)
        ?.purchase_state,
    ).toMatchObject({ clearance_status: "required", purchasable: false });

    await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_failed_buy_${nonce()}`)
      .send({ tile_id: target.tile_id })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_purchase_retry_clear_${nonce()}`)
      .send({ target_tile_id: target.tile_id, march_type: "clear_wild" })
      .expect(201);
  });
});

interface TestMapTile {
  commandery_id: string;
  danger_level: number;
  province_id: string;
  terrain_type: string;
  tile_id: string;
  tile_type: string;
  x: number;
  y: number;
  ownership: { owner_player_id: string | null };
  purchase_state: {
    adjacent_owned: boolean;
    clearance_status: "not_required" | "required" | "cleared";
    purchasable: boolean;
    reason: string;
  };
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

async function positionCityAtClearanceFrontier(
  app: INestApplication,
  prisma: PrismaClient,
  token: string,
  playerId: string,
  provinceId: string,
): Promise<TestMapTile> {
  const tiles = await getMap(app, token, provinceId);
  const target = tiles.find(
    (tile) =>
      !tile.ownership.owner_player_id &&
      tile.danger_level > 1 &&
      !["tower", "capital", "pass"].includes(tile.tile_type) &&
      tiles.filter(
        (candidate) =>
          !candidate.ownership.owner_player_id &&
          !["tower", "capital", "pass"].includes(candidate.tile_type) &&
          Math.abs(candidate.x - tile.x) + Math.abs(candidate.y - tile.y) === 1,
      ).length >= 2,
  );
  if (!target) {
    throw new Error("未找到可用于清野测试的危险边界区块");
  }
  return positionCityNextToTarget(app, prisma, token, playerId, target);
}

async function positionCityNextToTarget(
  app: INestApplication,
  prisma: PrismaClient,
  token: string,
  playerId: string,
  target: TestMapTile,
): Promise<TestMapTile> {
  const tiles = await getMap(app, token, target.province_id);
  const source = tiles.find(
    (candidate) =>
      !candidate.ownership.owner_player_id &&
      !["tower", "capital", "pass"].includes(candidate.tile_type) &&
      Math.abs(candidate.x - target.x) + Math.abs(candidate.y - target.y) === 1,
  );
  if (!source) {
    throw new Error("未找到清野测试主城落点");
  }
  const mainCity = await prisma.playerCity.findFirstOrThrow({
    where: { playerId, cityType: "main" },
  });
  const ownership = await prisma.worldBlockOwnership.findFirstOrThrow({
    where: { playerId, ownershipType: "main_city" },
  });
  await prisma.$transaction([
    prisma.playerCity.update({
      where: { cityId: mainCity.cityId },
      data: {
        commanderyId: source.commandery_id,
        provinceId: source.province_id,
        tileId: source.tile_id,
      },
    }),
    prisma.worldBlockOwnership.update({
      where: { ownershipId: ownership.ownershipId },
      data: {
        commanderyId: source.commandery_id,
        provinceId: source.province_id,
        terrainType: source.terrain_type,
        tileId: source.tile_id,
      },
    }),
  ]);
  const refreshedTarget = (await getMap(app, token, target.province_id)).find(
    (tile) => tile.tile_id === target.tile_id,
  );
  if (
    !refreshedTarget?.purchase_state.adjacent_owned ||
    refreshedTarget.purchase_state.clearance_status !== "required"
  ) {
    throw new Error("清野测试区块未形成有效边界");
  }
  return refreshedTarget;
}

async function clearTile(
  app: INestApplication,
  prisma: PrismaClient,
  token: string,
  tileId: string,
) {
  const march = await request(app.getHttpServer())
    .post("/api/world/march")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_purchase_clear_${nonce()}`)
    .send({ target_tile_id: tileId, march_type: "clear_wild" })
    .expect(201);
  await prisma.marchQueue.update({
    where: { marchId: march.body.data.march.march_id as string },
    data: {
      arrivesAt: new Date(Date.now() - 1000),
      teamSnapshot: {
        leader_name: "清野测试先锋",
        soldier_count: 30,
        supply_cost: 12,
        team_power: 999,
      },
    },
  });
  const idempotencyKey = `idem_purchase_clear_resolve_${nonce()}`;
  const clearance = await request(app.getHttpServer())
    .post("/api/world/clear-wild/resolve")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", idempotencyKey)
    .send({ march_id: march.body.data.march.march_id })
    .expect(201);
  const duplicate = await request(app.getHttpServer())
    .post("/api/world/clear-wild/resolve")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", idempotencyKey)
    .send({ march_id: march.body.data.march.march_id })
    .expect(201);
  expect(duplicate.body.data.record_id).toBe(clearance.body.data.record_id);
  return clearance;
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
