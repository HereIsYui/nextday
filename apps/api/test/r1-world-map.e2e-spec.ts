import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const provinceOrder = ["冀州", "兖州", "青州", "徐州", "扬州", "荆州", "豫州", "梁州", "雍州"];
const birthProvinceIds = ["ji", "yan", "qing", "xu"];

describe("R1 九州城池地图只读接口", () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-world-map-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    token = await createPlayerToken(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it("返回九州、郡域、出生开放状态和州战摘要", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/world/provinces")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const provinces = response.body.data.provinces as Array<{
      province_id: string;
      name: string;
      birth_available: boolean;
      recommended_birth: boolean;
      commanderies: Array<{ birth_available: boolean; tile_count: number }>;
      war_state: { season_id: string; score: number; tower_state: string };
    }>;

    expect(provinces).toHaveLength(9);
    expect(provinces.map((province) => province.name)).toEqual(provinceOrder);
    expect(JSON.stringify(provinces)).not.toContain("幽州");
    expect(response.body.data.recommended_province_id).toBe("ji");
    expect(response.body.data.config_version).toBe("world_city_era_r1_001");

    for (const province of provinces) {
      expect(province.commanderies).toHaveLength(3);
      expect(province.war_state.season_id).toBe("season_city_era_001");
      expect(province.war_state.score).toBeGreaterThan(0);
      expect(province.war_state.tower_state.length).toBeGreaterThan(0);
      expect(province.birth_available).toBe(birthProvinceIds.includes(province.province_id));
    }

    expect(provinces.find((province) => province.province_id === "ji")?.recommended_birth).toBe(
      true,
    );
    expect(
      provinces.find((province) => province.province_id === "ji")?.commanderies[0]?.birth_available,
    ).toBe(true);
  });

  it("返回指定州地图，包含主城地、资源点、关隘、州府和九塔", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "ji" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const data = response.body.data as {
      province: { province_id: string; name: string };
      commanderies: Array<{ commandery_id: string; tile_count: number }>;
      tiles: Array<{
        tile_id: string;
        tile_type: string;
        tile_name: string;
        x: number;
        y: number;
        occupiable: boolean;
        protected: boolean;
        nodes: Array<{
          node_type: string;
          occupiable: boolean;
          owner: { owner_province_id: string | null };
        }>;
      }>;
      visible_tile_count: number;
      occupiable_tile_count: number;
      player_city_hint: string;
    };

    expect(data.province).toMatchObject({ province_id: "ji", name: "冀州" });
    expect(data.commanderies).toHaveLength(3);
    expect(data.commanderies.reduce((total, commandery) => total + commandery.tile_count, 0)).toBe(
      data.tiles.length,
    );
    expect(data.tiles.map((tile) => tile.tile_type).sort()).toEqual([
      "capital",
      "main_city",
      "pass",
      "resource",
      "tower",
      "wild",
    ]);
    expect(data.visible_tile_count).toBe(data.tiles.length);
    expect(data.occupiable_tile_count).toBeGreaterThanOrEqual(4);
    expect(data.player_city_hint).toContain("建立主城");

    for (const tile of data.tiles) {
      expect(tile.tile_id.length).toBeGreaterThan(0);
      expect(tile.tile_name.length).toBeGreaterThan(0);
      expect(Number.isInteger(tile.x)).toBe(true);
      expect(Number.isInteger(tile.y)).toBe(true);
      expect(tile.nodes.length).toBeGreaterThan(0);
    }

    expect(data.tiles.find((tile) => tile.tile_type === "main_city")).toMatchObject({
      occupiable: false,
      protected: true,
    });
    expect(data.tiles.find((tile) => tile.tile_type === "resource")?.nodes[0]).toMatchObject({
      occupiable: true,
      owner: { owner_province_id: "ji" },
    });
    expect(data.tiles.find((tile) => tile.tile_type === "pass")?.nodes[0]?.node_type).toBe("pass");
    expect(data.tiles.find((tile) => tile.tile_type === "tower")?.nodes[0]?.node_type).toBe(
      "tower",
    );
  });

  it("未传州域时默认返回推荐出生州，未知州域返回错误", async () => {
    const defaultMap = await request(app.getHttpServer())
      .get("/api/world/map")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(defaultMap.body.data.province.province_id).toBe("ji");

    await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "you" })
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});

async function createPlayerToken(app: INestApplication): Promise<string> {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_world_map_${nonce}`, nickname: "地图道友" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_world_map_create_${nonce}`)
    .send({ name: `城主${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return token;
}
