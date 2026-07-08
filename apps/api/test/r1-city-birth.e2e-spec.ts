import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 出生州选择与主城建立", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-city-birth-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("新角色建城前能看到开放出生州和推荐出生点", async () => {
    const { token } = await createR1CityPlayer(app, "候选");

    const overview = await request(app.getHttpServer())
      .get("/api/city/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(overview.body.data.main_city).toBeNull();
    expect(overview.body.data.birth_options).toHaveLength(4);
    expect(
      overview.body.data.birth_options.map((option: { province_id: string }) => option.province_id),
    ).toEqual(["ji", "yan", "qing", "xu"]);
    expect(overview.body.data.birth_options[0]).toMatchObject({
      province_id: "ji",
      available: true,
      recommended: true,
    });
    expect(overview.body.data.strategic_hint).toContain("建立主城");
  });

  it("玩家可以在出生州建立主城，重复幂等请求不会创建第二座主城", async () => {
    const { token } = await createR1CityPlayer(app, "主城");
    const idempotencyKey = `idem_r1_city_settle_${Date.now()}_${randomSuffix()}`;

    const settle = await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ province_id: "ji", commandery_id: "ji_commandery_1", city_name: "北境仙城" })
      .expect(201);

    expect(settle.body.data.city).toMatchObject({
      city_type: "main",
      province_id: "ji",
      province_name: "冀州",
      commandery_id: "ji_commandery_1",
      city_name: "北境仙城",
      city_level: 1,
      status: "protected",
    });
    expect(settle.body.data.city.tile_id).toContain("ji_birth_land");
    expect(settle.body.data.city.protection_until).not.toBeNull();
    expect(settle.body.data.city.resources).toMatchObject({
      spirit_stone: "800",
      grain: "1200",
      soldier: "60",
    });
    expect(settle.body.data.overview.main_city.city_id).toBe(settle.body.data.city.city_id);
    expect(settle.body.data.overview.birth_options).toHaveLength(0);

    const duplicate = await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ province_id: "ji", commandery_id: "ji_commandery_1", city_name: "北境仙城" })
      .expect(201);

    expect(duplicate.body.data.city.city_id).toBe(settle.body.data.city.city_id);

    const overview = await request(app.getHttpServer())
      .get("/api/city/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(overview.body.data.main_city.city_id).toBe(settle.body.data.city.city_id);
    expect(overview.body.data.strategic_hint).toContain("城外野地");
  });

  it("未开放州域不能建立主城，已有主城不能再次建立", async () => {
    const locked = await createR1CityPlayer(app, "锁州");

    await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${locked.token}`)
      .set("Idempotency-Key", `idem_r1_city_locked_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "yong", city_name: "太初城" })
      .expect(400);

    const settled = await createR1CityPlayer(app, "重复");

    await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${settled.token}`)
      .set("Idempotency-Key", `idem_r1_city_once_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "yan", city_name: "礼阵仙城" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/city/settle")
      .set("Authorization", `Bearer ${settled.token}`)
      .set("Idempotency-Key", `idem_r1_city_twice_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "qing", city_name: "潮生仙城" })
      .expect(400);
  });
});

async function createR1CityPlayer(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_city_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_city_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return { token, playerId: createResponse.body.data.profile.player.player_id as string };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
