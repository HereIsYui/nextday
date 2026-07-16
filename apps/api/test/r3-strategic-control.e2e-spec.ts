import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R3-02 战略控制权", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let playerId: string;
  let cityId: string;
  let targetTileId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r3-control-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();
    const key = nonce();
    const login = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `r3_control_${key}`, nickname: "执旗道友" })
      .expect(201);
    token = login.body.data.token as string;
    const created = await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r3_control_create_${key}`)
      .send({ name: `执旗${key}`.slice(0, 16), route: "qi" })
      .expect(201);
    playerId = created.body.data.profile.player.player_id as string;
    const settled = await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r3_control_settle_${key}`)
      .send({ province_id: "yong", city_name: "执旗主城" })
      .expect(201);
    cityId = settled.body.data.city.city_id as string;
    await prisma.player.update({ where: { playerId }, data: { currentRealm: 3 } });
    await prisma.cityArmyPreset.create({
      data: {
        presetId: `r3_control_preset_${nonce()}`,
        playerId,
        cityId,
        presetType: "march",
        presetName: "夺旗队",
        commanderId: "city_vanguard",
        soldierCount: 60,
        formation: "assault",
        power: 500,
      },
    });
    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "yong", view: "detail" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const target = map.body.data.tiles.find(
      (tile: { tile_id: string; tile_type: string }) => tile.tile_type === "pass",
    ) as { tile_id: string } | undefined;
    if (!target) throw new Error("雍州缺少关隘测试目标");
    targetTileId = target.tile_id;
  });

  afterAll(async () => {
    if (playerId) {
      await prisma.warMeritRecord.deleteMany({ where: { playerId } });
      await prisma.strategicControlRecord.deleteMany({ where: { controllerId: playerId } });
      await prisma.marchQueue.deleteMany({ where: { playerId } });
      await prisma.cityArmyPreset.deleteMany({ where: { playerId } });
      await prisma.worldBlockOwnership.deleteMany({ where: { playerId } });
      await prisma.playerCity.deleteMany({ where: { playerId } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it("争夺关隘只建立周期控制权，不转移区块产权", async () => {
    const start = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r3_control_march_${nonce()}`)
      .send({ target_tile_id: targetTileId, march_type: "contest" })
      .expect(201);
    const marchId = start.body.data.march.march_id as string;
    await prisma.marchQueue.update({
      where: { marchId },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });
    const resolved = await request(app.getHttpServer())
      .post("/api/world/strategic-control/resolve")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r3_control_resolve_${nonce()}`)
      .send({ march_id: marchId })
      .expect(201);

    expect(resolved.body.data).toMatchObject({ won: true });
    expect(resolved.body.data.control).toMatchObject({
      control_type: "pass",
      controller_id: playerId,
      is_mine: true,
      status: "active",
    });
    const ownership = await prisma.worldBlockOwnership.findUnique({
      where: { eraId_tileId: { eraId: "era_mvp_001", tileId: targetTileId } },
    });
    expect(ownership).toBeNull();
    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "yong", view: "detail" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const tile = map.body.data.tiles.find(
      (item: { tile_id: string }) => item.tile_id === targetTileId,
    );
    expect(tile.strategic_control).toMatchObject({ controller_id: playerId, is_mine: true });
    const merit = await request(app.getHttpServer())
      .get("/api/world/war-merit")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(merit.body.data).toMatchObject({ total_merit: 50, weekly_merit: 50 });
    expect(merit.body.data.entries[0]).toMatchObject({
      source_type: "strategic_control",
      merit: 50,
      result: "won",
    });
  });
});

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
