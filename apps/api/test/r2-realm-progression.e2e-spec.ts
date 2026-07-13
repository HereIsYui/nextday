import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R2-03 修仙境界与城池联动", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let playerId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r2-realm-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();

    const key = nonce();
    const login = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `r2_realm_${key}`, nickname: "悟道城主" })
      .expect(201);
    token = login.body.data.token as string;
    const created = await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_realm_create_${key}`)
      .send({ name: `悟道${key}`.slice(0, 16), route: "qi" })
      .expect(201);
    playerId = created.body.data.profile.player.player_id as string;
    await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_realm_settle_${key}`)
      .send({ province_id: "ji", city_name: "悟道城" })
      .expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  it("新城主能看到当前境界、战力增益和下一境解锁", async () => {
    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(overview.body.data.cultivation).toMatchObject({
      current_realm: 1,
      current_realm_name: "练气",
      next_realm_name: "筑基",
      maximum_realm: 9,
      realm_power_bonus_percent: 0,
      breakthrough_required: "600",
    });
    expect(
      overview.body.data.cultivation.next_unlock_features.map(
        (feature: { feature_id: string }) => feature.feature_id,
      ),
    ).toEqual(expect.arrayContaining(["sub_city", "defense_formation"]));

    await request(app.getHttpServer())
      .post("/api/city/subcity")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_realm_locked_sub_${nonce()}`)
      .send({ tile_id: "ji_block_0_0" })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/city/army/preset")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_realm_locked_formation_${nonce()}`)
      .send({
        preset_type: "garrison",
        commander_id: "city_vanguard",
        soldier_count: 20,
        formation: "defense",
      })
      .expect(400);
  });

  it("练气圆满突破筑基后开放分城与守御军阵", async () => {
    await prisma.player.update({
      where: { playerId },
      data: { currentRealm: 1, currentLevel: 9 },
    });
    await prisma.playerProgress.update({
      where: { playerId },
      data: { cultivationValue: 600n },
    });

    const breakthrough = await request(app.getHttpServer())
      .post("/api/game/cultivation/breakthrough")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_realm_breakthrough_${nonce()}`)
      .expect(201);
    expect(breakthrough.body.data).toMatchObject({ success: true });
    expect(breakthrough.body.data.message).toContain("筑基");
    expect(breakthrough.body.data.experience.summary).toContain("分城与药园");

    const army = await request(app.getHttpServer())
      .get("/api/city/army")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(army.body.data).toMatchObject({ current_realm: 2, current_realm_name: "筑基" });
    expect(
      army.body.data.formations.find(
        (formation: { formation: string }) => formation.formation === "defense",
      ),
    ).toMatchObject({ unlocked: true, required_realm: 2 });
    expect(army.body.data.soldier_capacity).toBeGreaterThan(120);
  });
});

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
