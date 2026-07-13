import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R2-02 军队训练与预设", () => {
  let app: INestApplication;
  let token: string;
  let cityTileId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r2-army-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const key = nonce();
    const login = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `r2_army_${key}`, nickname: "兵府道友" })
      .expect(201);
    token = login.body.data.token as string;
    await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_army_create_${key}`)
      .send({ name: `兵府${key}`.slice(0, 16), route: "qi" })
      .expect(201);
    const settled = await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_army_settle_${key}`)
      .send({ province_id: "ji", commandery_id: "ji_commandery_1", city_name: "镇北兵府" })
      .expect(201);
    cityTileId = settled.body.data.city.tile_id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it("训练道兵会扣除普通资源并保持幂等", async () => {
    const before = await getArmy(app, token);
    expect(before).toMatchObject({ available_soldiers: 60, soldier_capacity: 120 });
    expect(
      before.commanders.filter((commander: { unlocked: boolean }) => commander.unlocked),
    ).toHaveLength(1);

    const key = `idem_r2_army_train_${nonce()}`;
    const trained = await request(app.getHttpServer())
      .post("/api/city/army/train")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ soldier_count: 20 })
      .expect(201);
    expect(trained.body.data).toMatchObject({
      trained_soldiers: 20,
      cost: { spirit_stone: 40, grain: 160 },
      army: { available_soldiers: 80, soldier_capacity: 120 },
    });

    const duplicate = await request(app.getHttpServer())
      .post("/api/city/army/train")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key)
      .send({ soldier_count: 20 })
      .expect(201);
    expect(duplicate.body.data.record_id).toBe(trained.body.data.record_id);
    expect(duplicate.body.data.army.available_soldiers).toBe(80);
  });

  it("保存行军与驻防预设后会进入对应战斗快照", async () => {
    await request(app.getHttpServer())
      .post("/api/city/army/preset")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_army_locked_${nonce()}`)
      .send({
        preset_type: "march",
        commander_id: "defense_captain",
        soldier_count: 40,
        formation: "balanced",
      })
      .expect(400);

    const marchPreset = await savePreset(app, token, {
      preset_type: "march",
      commander_id: "city_vanguard",
      soldier_count: 40,
      formation: "assault",
    });
    const garrisonPreset = await savePreset(app, token, {
      preset_type: "garrison",
      commander_id: "city_vanguard",
      soldier_count: 30,
      formation: "defense",
    });
    expect(marchPreset.power).toBe(88);
    expect(garrisonPreset.power).toBe(69);

    const map = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "ji", view: "detail" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const target = map.body.data.tiles.find(
      (tile: {
        tile_id: string;
        tile_type: string;
        ownership: { owner_player_id: string | null };
      }) => tile.tile_type === "wild" && !tile.ownership.owner_player_id,
    ) as { tile_id: string } | undefined;
    expect(target).toBeTruthy();
    if (!target) throw new Error("没有可用行军目标");

    const march = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_army_march_${nonce()}`)
      .send({
        target_tile_id: target.tile_id,
        march_type: "scout",
        preset_id: marchPreset.preset_id,
      })
      .expect(201);
    expect(march.body.data.march.team).toMatchObject({
      preset_id: marchPreset.preset_id,
      commander_id: "city_vanguard",
      leader_name: "主城先锋",
      formation: "assault",
      soldier_count: 40,
      team_power: 88,
    });

    const defended = await request(app.getHttpServer())
      .post("/api/world/defend")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r2_army_defend_${nonce()}`)
      .send({
        tile_id: cityTileId,
        soldier_count: 30,
        preset_id: garrisonPreset.preset_id,
      })
      .expect(201);
    expect(defended.body.data.garrison).toMatchObject({
      preset_id: garrisonPreset.preset_id,
      commander_name: "主城先锋",
      formation: "defense",
      soldier_count: 30,
      defense_power: 69,
    });
  });
});

async function getArmy(app: INestApplication, token: string) {
  const response = await request(app.getHttpServer())
    .get("/api/city/army")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  return response.body.data;
}

async function savePreset(
  app: INestApplication,
  token: string,
  body: {
    preset_type: "march" | "garrison";
    commander_id: string;
    soldier_count: number;
    formation: "balanced" | "assault" | "defense" | "scout";
  },
) {
  const response = await request(app.getHttpServer())
    .post("/api/city/army/preset")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r2_army_preset_${body.preset_type}_${nonce()}`)
    .send(body)
    .expect(201);
  return response.body.data.preset as { preset_id: string; power: number };
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
