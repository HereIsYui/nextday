import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 平原分城", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const playerIds: string[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r1-subcity-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    const ids = playerIds.splice(0);
    if (ids.length) {
      await prisma.$transaction([
        prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: ids } } }),
        prisma.playerCity.deleteMany({ where: { playerId: { in: ids } } }),
      ]);
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("拥有平原且主城二级后可以建立一座分城，重复请求不重复扣除资源", async () => {
    const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const login = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `r1_subcity_${nonce}`, nickname: "分城道友" })
      .expect(201);
    const token = login.body.data.token as string;
    const created = await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_subcity_create_${nonce}`)
      .send({ name: `分城${nonce}`.slice(0, 16), route: "qi" })
      .expect(201);
    const playerId = created.body.data.profile.player.player_id as string;
    playerIds.push(playerId);
    const settled = await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_subcity_settle_${nonce}`)
      .send({ province_id: "yang", commandery_id: "yang_commandery_1", city_name: "扬州主城" })
      .expect(201);
    const cityId = settled.body.data.city.city_id as string;
    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "yang", view: "detail" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const tile = map.body.data.tiles.find(
      (item: { terrain_type: string; ownership: { owner_player_id: string | null } }) =>
        item.terrain_type === "plain" && !item.ownership.owner_player_id,
    ) as { tile_id: string; province_id: string; commandery_id: string };
    expect(tile).toBeTruthy();
    await prisma.worldBlockOwnership.create({
      data: {
        ownershipId: `subcity_block_${nonce}`,
        playerId,
        eraId: "era_mvp_001",
        tileId: tile.tile_id,
        provinceId: tile.province_id,
        commanderyId: tile.commandery_id,
        terrainType: "plain",
        ownershipType: "purchase",
        status: "owned",
        sourceType: "test",
        purchaseCost: 0n,
        configVersion: "test",
      },
    });
    await prisma.playerCity.update({ where: { cityId }, data: { cityLevel: 2 } });
    await prisma.player.update({ where: { playerId }, data: { currentRealm: 2 } });
    const key = `idem_r1_subcity_open_${nonce}`;
    const response = await request(app.getHttpServer())
      .post("/api/city/subcity")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ tile_id: tile.tile_id, city_name: "临江分城" })
      .expect(201);
    expect(response.body.data.city).toMatchObject({
      city_type: "sub",
      city_name: "临江分城",
      tile_id: tile.tile_id,
    });
    expect(response.body.data.overview.sub_cities).toHaveLength(1);
    const duplicate = await request(app.getHttpServer())
      .post("/api/city/subcity")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ tile_id: tile.tile_id, city_name: "临江分城" })
      .expect(201);
    expect(duplicate.body.data.city.city_id).toBe(response.body.data.city.city_id);
  });
});
