import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R4-01 宗门集结", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let leader: PlayerState;
  let member: PlayerState;
  let sectId: string;
  let targetTileId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r4-rally-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();
    leader = await createPlayer(app, "宗主", "liang");
    member = await createPlayer(app, "长老", "liang");
    sectId = `r4_sect_${nonce()}`;
    await prisma.sect.create({
      data: {
        sectId,
        name: `集结宗${nonce()}`.slice(0, 16),
        alignment: "neutral",
        createdByPlayerId: leader.playerId,
      },
    });
    await prisma.sectMember.createMany({
      data: [
        { sectMemberId: `r4_member_${nonce()}`, sectId, playerId: leader.playerId, role: "leader" },
        { sectMemberId: `r4_member_${nonce()}`, sectId, playerId: member.playerId, role: "elder" },
      ],
    });
    await prisma.player.updateMany({
      where: { playerId: { in: [leader.playerId, member.playerId] } },
      data: { sectId, currentRealm: 4 },
    });
    await prisma.cityArmyPreset.createMany({
      data: [leader, member].map((player) => ({
        presetId: `r4_preset_${nonce()}`,
        playerId: player.playerId,
        cityId: player.cityId,
        presetType: "march",
        presetName: "集结队",
        commanderId: "city_vanguard",
        soldierCount: 50,
        formation: "assault",
        power: 500,
      })),
    });
    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "liang", view: "detail" })
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    const target = map.body.data.tiles.find(
      (tile: { tile_id: string; tile_type: string }) => tile.tile_type === "pass",
    ) as { tile_id: string } | undefined;
    if (!target) throw new Error("梁州缺少关隘目标");
    targetTileId = target.tile_id;
  });

  afterAll(async () => {
    const ids = [leader?.playerId, member?.playerId].filter(Boolean);
    if (ids.length) {
      await prisma.warMeritRecord.deleteMany({ where: { playerId: { in: ids } } });
      await prisma.strategicControlRecord.deleteMany({ where: { controllerId: sectId } });
      await prisma.sectRallyMember.deleteMany({ where: { playerId: { in: ids } } });
      await prisma.sectRally.deleteMany({ where: { sectId } });
      await prisma.cityArmyPreset.deleteMany({ where: { playerId: { in: ids } } });
      await prisma.worldBlockOwnership.deleteMany({ where: { playerId: { in: ids } } });
      await prisma.playerCity.deleteMany({ where: { playerId: { in: ids } } });
      await prisma.sectMember.deleteMany({ where: { playerId: { in: ids } } });
      await prisma.sect.deleteMany({ where: { sectId } });
    }
    await prisma.$disconnect();
    await app.close();
  });

  it("宗主发起、成员响应并把战略控制权切换为宗门", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/world/rallies")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_r4_create_${nonce()}`)
      .send({ target_tile_id: targetTileId, rally_type: "attack" })
      .expect(201);
    const rallyId = created.body.data.rally.rally_id as string;
    await joinRally(app, leader.token, rallyId);
    await joinRally(app, member.token, rallyId);
    const resolved = await request(app.getHttpServer())
      .post("/api/world/rallies/resolve")
      .set("Authorization", `Bearer ${leader.token}`)
      .set("Idempotency-Key", `idem_r4_resolve_${nonce()}`)
      .send({ rally_id: rallyId })
      .expect(201);
    expect(resolved.body.data).toMatchObject({ won: true });
    expect(resolved.body.data.control).toMatchObject({
      controller_type: "sect",
      controller_id: sectId,
    });
    const ownership = await prisma.worldBlockOwnership.findUnique({
      where: { eraId_tileId: { eraId: "era_mvp_001", tileId: targetTileId } },
    });
    expect(ownership).toBeNull();
    const leaderboard = await request(app.getHttpServer())
      .get("/api/world/province-war")
      .set("Authorization", `Bearer ${leader.token}`)
      .expect(200);
    expect(
      leaderboard.body.data.provinces.find(
        (province: { province_id: string }) => province.province_id === "liang",
      ),
    ).toMatchObject({ score: 60, pass_controls: 1, dominant_sect_name: expect.any(String) });
    const merit = await request(app.getHttpServer())
      .get("/api/world/war-merit")
      .set("Authorization", `Bearer ${member.token}`)
      .expect(200);
    expect(merit.body.data.entries[0]).toMatchObject({
      source_type: "sect_rally",
      result: "won",
    });
    expect(merit.body.data.sect_merit).toBeGreaterThanOrEqual(30);
  });
});

interface PlayerState {
  token: string;
  playerId: string;
  cityId: string;
}

async function createPlayer(
  app: INestApplication,
  prefix: string,
  provinceId: string,
): Promise<PlayerState> {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r4_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r4_create_player_${key}`)
    .send({ name: `${prefix}${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  const settled = await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r4_settle_${key}`)
    .send({ province_id: provinceId, city_name: `${prefix}城` })
    .expect(201);
  return {
    token,
    playerId: created.body.data.profile.player.player_id as string,
    cityId: settled.body.data.city.city_id as string,
  };
}

async function joinRally(app: INestApplication, token: string, rallyId: string) {
  await request(app.getHttpServer())
    .post("/api/world/rallies/join")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r4_join_${nonce()}`)
    .send({ rally_id: rallyId })
    .expect(201);
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
