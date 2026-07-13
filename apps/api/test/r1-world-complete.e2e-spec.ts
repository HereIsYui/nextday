import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 九州地图核心闭环总验收", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-world-complete-secret";
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

  it("从九州总览到建城、清野、购地、驻防和领地产出保持完整闭环", async () => {
    const identity = await createPlayer(app);
    const atlasBefore = await request(app.getHttpServer())
      .get("/api/world/atlas")
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(200);
    expect(atlasBefore.body.data.home_province_id).toBeNull();
    expect(atlasBefore.body.data.provinces).toHaveLength(9);
    expect(
      atlasBefore.body.data.provinces.reduce(
        (total: number, item: { province: { block_count: number } }) =>
          total + item.province.block_count,
        0,
      ),
    ).toBe(8888);
    expect(
      atlasBefore.body.data.provinces.some(
        (item: { available_birth_blocks: number }) => item.available_birth_blocks > 0,
      ),
    ).toBe(true);

    const overview = await request(app.getHttpServer())
      .get("/api/city/overview")
      .set("Authorization", `Bearer ${identity.token}`)
      .expect(200);
    const birthOption = overview.body.data.birth_options.find(
      (option: { available: boolean }) => option.available,
    ) as { province_id: string } | undefined;
    expect(birthOption).toBeTruthy();
    if (!birthOption) throw new Error("没有可用出生州");

    const settled = await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${identity.token}`)
      .set("Idempotency-Key", `idem_r1_complete_settle_${nonce()}`)
      .send({ province_id: birthOption.province_id, city_name: "纪元验收城" })
      .expect(201);
    expect(settled.body.data.city).toMatchObject({
      city_type: "main",
      province_id: birthOption.province_id,
    });

    await prisma.playerWallet.update({
      where: { playerId: identity.playerId },
      data: { spiritStone: 5000n },
    });
    const territoryBefore = await getTerritory(app, identity.token);
    expect(territoryBefore.owned_block_count).toBe(1);
    expect(territoryBefore.expansion_candidates.length).toBeGreaterThan(0);
    const candidate = territoryBefore.expansion_candidates[0];
    if (!candidate) throw new Error("没有可用扩张候选");

    if (candidate.action === "clear_wild") {
      const march = await request(app.getHttpServer())
        .post("/api/world/march")
        .set("Authorization", `Bearer ${identity.token}`)
        .set("Idempotency-Key", `idem_r1_complete_march_${nonce()}`)
        .send({ target_tile_id: candidate.tile_id, march_type: "clear_wild" })
        .expect(201);
      await prisma.marchQueue.update({
        where: { marchId: march.body.data.march.march_id as string },
        data: {
          arrivesAt: new Date(Date.now() - 1000),
          teamSnapshot: {
            leader_name: "纪元验收先锋",
            soldier_count: 30,
            supply_cost: 12,
            team_power: 999,
          },
        },
      });
      const clearance = await request(app.getHttpServer())
        .post("/api/world/clear-wild/resolve")
        .set("Authorization", `Bearer ${identity.token}`)
        .set("Idempotency-Key", `idem_r1_complete_clearance_${nonce()}`)
        .send({ march_id: march.body.data.march.march_id })
        .expect(201);
      expect(clearance.body.data).toMatchObject({ cleared: true });
    }

    const purchased = await request(app.getHttpServer())
      .post("/api/world/blocks/purchase")
      .set("Authorization", `Bearer ${identity.token}`)
      .set("Idempotency-Key", `idem_r1_complete_purchase_${nonce()}`)
      .send({ tile_id: candidate.tile_id })
      .expect(201);
    expect(purchased.body.data.tile.ownership).toMatchObject({
      owner_player_id: identity.playerId,
      ownership_type: "purchase",
    });

    const defended = await request(app.getHttpServer())
      .post("/api/world/defend")
      .set("Authorization", `Bearer ${identity.token}`)
      .set("Idempotency-Key", `idem_r1_complete_defend_${nonce()}`)
      .send({ tile_id: candidate.tile_id, soldier_count: 6 })
      .expect(201);
    expect(defended.body.data).toMatchObject({
      operation: "increase",
      garrison: { soldier_count: 6, defense_power: 12 },
    });

    const territoryDefended = await getTerritory(app, identity.token);
    expect(territoryDefended.owned_block_count).toBe(2);
    expect(territoryDefended.total_garrison_soldiers).toBe(6);
    expect(
      territoryDefended.blocks.find(
        (block: { tile_id: string }) => block.tile_id === candidate.tile_id,
      ),
    ).toMatchObject({ garrison: { soldier_count: 6 }, x: candidate.x, y: candidate.y });

    const collected = await request(app.getHttpServer())
      .post("/api/city/territory/collect")
      .set("Authorization", `Bearer ${identity.token}`)
      .set("Idempotency-Key", `idem_r1_complete_collect_${nonce()}`)
      .send({})
      .expect(201);
    expect(collected.body.data.record_id).toBeTruthy();

    const withdrawn = await request(app.getHttpServer())
      .post("/api/world/defend")
      .set("Authorization", `Bearer ${identity.token}`)
      .set("Idempotency-Key", `idem_r1_complete_withdraw_${nonce()}`)
      .send({ tile_id: candidate.tile_id, soldier_count: 0 })
      .expect(201);
    expect(withdrawn.body.data).toMatchObject({ operation: "withdraw", garrison: null });

    const ownerships = await prisma.worldBlockOwnership.findMany({
      where: { playerId: identity.playerId, eraId: "era_mvp_001" },
    });
    expect(ownerships).toHaveLength(2);
    expect(new Set(ownerships.map((ownership) => ownership.ownershipType))).toEqual(
      new Set(["main_city", "purchase"]),
    );
  });
});

async function createPlayer(app: INestApplication) {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_complete_${key}`, nickname: "纪元验收道友" })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_complete_create_${key}`)
    .send({ name: `验收${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  return { playerId: created.body.data.profile.player.player_id as string, token };
}

async function getTerritory(app: INestApplication, token: string) {
  const response = await request(app.getHttpServer())
    .get("/api/world/territory")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return response.body.data;
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
