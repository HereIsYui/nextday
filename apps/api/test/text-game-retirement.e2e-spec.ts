import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma, PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const retiredTableNames = [
  "player_city",
  "city_building",
  "city_herb_garden_plot",
  "city_army_preset",
  "world_block_clearance",
  "march_queue",
  "territory_garrison",
  "world_block_ownership",
  "siege_record",
  "strategic_control_record",
  "sect_rally",
  "sect_rally_member",
  "war_merit_record",
  "war_season_settlement",
  "war_season_reward",
  "world_cycle_settlement",
  "world_cycle_reward",
  "world_chronicle_event",
  "resource_point_state",
  "pvp_battle_record",
];

describe("文字修行城池退役", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "text-retirement-test-secret";
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

  it("城池、世界地图、资源点与 PVP 路由不再存在", async () => {
    const { token } = await createTextGamePlayer(app, "路由");

    await request(app.getHttpServer())
      .get("/api/city/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get("/api/world/map")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get("/api/multiplayer/resource-points")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .post("/api/multiplayer/pvp/attack")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_text_retirement_pvp_${Date.now()}`)
      .send({ defender_player_id: "retired", resource_point_id: "retired" })
      .expect(404);
  });

  it("关键城池、资源点与 PVP 表已经删除，新角色不会产生迁移资产", async () => {
    const { playerId } = await createTextGamePlayer(app, "新角");
    const remainingTables = await prisma.$queryRaw<Array<{ table_name: string }>>(
      Prisma.sql`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN (${Prisma.join(retiredTableNames)})
      `,
    );

    expect(remainingTables).toEqual([]);

    const [retirementItems, retirementAudits] = await Promise.all([
      prisma.playerItem.findMany({
        where: { playerId, sourceType: "city_retirement" },
      }),
      prisma.auditLog.findMany({
        where: { playerId, action: "city_retirement_migration" },
      }),
    ]);

    expect(retirementItems).toEqual([]);
    expect(retirementAudits).toEqual([]);
  });
});

async function createTextGamePlayer(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `text_retirement_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_text_retirement_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return {
    token,
    playerId: createResponse.body.data.profile.player.player_id as string,
  };
}
