import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const provinceOrder = ["冀州", "兖州", "青州", "徐州", "扬州", "荆州", "豫州", "梁州", "雍州"];
const provinceBlockCounts: Record<string, number> = {
  ji: 900,
  yan: 648,
  qing: 704,
  xu: 760,
  yang: 1056,
  jing: 1296,
  yu: 756,
  liang: 1368,
  yong: 1400,
};

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
      block_count: number;
      tower_block_count: number;
      birth_plain_count: number;
      commanderies: Array<{
        birth_available: boolean;
        tile_count: number;
        birth_plain_count: number;
      }>;
      war_state: { season_id: string; score: number; tower_state: string };
    }>;

    expect(provinces).toHaveLength(9);
    expect(provinces.map((province) => province.name)).toEqual(provinceOrder);
    expect(JSON.stringify(provinces)).not.toContain("幽州");
    expect(response.body.data.recommended_province_id).toBe("ji");
    expect(response.body.data.config_version).toBe("world_city_era_r1_06_8888");
    expect(provinces.reduce((total, province) => total + province.block_count, 0)).toBe(8888);

    for (const province of provinces) {
      expect(province.commanderies).toHaveLength(3);
      expect(province.block_count).toBe(provinceBlockCounts[province.province_id]);
      expect(province.tower_block_count).toBe(16);
      expect(province.birth_plain_count).toBeGreaterThanOrEqual(20);
      expect(province.war_state.season_id).toBe("season_city_era_001");
      expect(province.war_state.score).toBeGreaterThan(0);
      expect(province.war_state.tower_state.length).toBeGreaterThan(0);
      expect(province.birth_available).toBe(true);
    }

    expect(provinces.find((province) => province.province_id === "ji")?.recommended_birth).toBe(
      true,
    );
    expect(
      provinces.find((province) => province.province_id === "ji")?.commanderies[0]?.birth_available,
    ).toBe(true);
  });

  it("返回指定州大地图，包含地形、所有权、购买状态和九塔 4×4 区域", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "ji", view: "detail" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const data = response.body.data as {
      province: { province_id: string; name: string };
      view: string;
      block_count: number;
      commanderies: Array<{ commandery_id: string; tile_count: number; birth_plain_count: number }>;
      mini_map_summary: {
        total_blocks: number;
        tower_blocks: number;
        terrain_counts: Record<string, number>;
      };
      tiles: Array<{
        tile_id: string;
        tile_type: string;
        terrain_type: string;
        terrain_label: string;
        terrain_effects: string[];
        labels: string[];
        landmark_group_id: string | null;
        tile_name: string;
        x: number;
        y: number;
        occupiable: boolean;
        protected: boolean;
        ownership: { owner_player_id: string | null };
        purchase_state: { purchasable: boolean; reason: string; cost_spirit_stone: string };
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
    expect(data.view).toBe("detail");
    expect(data.block_count).toBe(900);
    expect(data.commanderies).toHaveLength(3);
    expect(data.commanderies.reduce((total, commandery) => total + commandery.tile_count, 0)).toBe(
      data.tiles.length,
    );
    expect(new Set(data.tiles.map((tile) => tile.tile_type))).toEqual(
      new Set(["capital", "pass", "resource", "tower", "wild"]),
    );
    expect(new Set(data.tiles.map((tile) => tile.terrain_type))).toEqual(
      new Set(["plain", "swamp", "forest", "mountain", "desert"]),
    );
    expect(data.visible_tile_count).toBe(data.tiles.length);
    expect(data.occupiable_tile_count).toBeGreaterThan(300);
    expect(data.player_city_hint).toContain("安全平原");
    expect(data.mini_map_summary.total_blocks).toBe(900);
    expect(data.mini_map_summary.tower_blocks).toBe(16);
    expect(
      Object.values(data.mini_map_summary.terrain_counts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(900);

    for (const tile of data.tiles) {
      expect(tile.tile_id.length).toBeGreaterThan(0);
      expect(tile.tile_name.length).toBeGreaterThan(0);
      expect(tile.terrain_label.length).toBeGreaterThan(0);
      expect(tile.terrain_effects.length).toBeGreaterThan(0);
      expect(Number.isInteger(tile.x)).toBe(true);
      expect(Number.isInteger(tile.y)).toBe(true);
      expect(tile.nodes.length).toBeGreaterThan(0);
      expect(tile.purchase_state.reason.length).toBeGreaterThan(0);
    }

    const towerTiles = data.tiles.filter((tile) => tile.landmark_group_id === "ji_tower");
    expect(towerTiles).toHaveLength(16);
    const towerXs = new Set(towerTiles.map((tile) => tile.x));
    const towerYs = new Set(towerTiles.map((tile) => tile.y));
    expect(towerXs.size).toBe(4);
    expect(towerYs.size).toBe(4);
    expect(data.tiles.find((tile) => tile.tile_type === "pass")?.nodes[0]?.node_type).toBe("pass");
    expect(data.tiles.find((tile) => tile.tile_type === "tower")?.nodes[0]?.node_type).toBe(
      "tower",
    );
    const birthPlainZones = new Set(
      data.tiles
        .filter((tile) => tile.labels.includes("安全出生池"))
        .map((tile) => Math.floor(tile.x / 10)),
    );
    expect(birthPlainZones.size).toBeGreaterThanOrEqual(3);
  });

  it("小地图返回势力分布摘要", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ province_id: "liang", view: "mini" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.view).toBe("mini");
    expect(response.body.data.block_count).toBe(1368);
    expect(response.body.data.mini_map_summary).toMatchObject({
      province_id: "liang",
      total_blocks: 1368,
      tower_blocks: 16,
    });
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

  it("大地图支持按坐标读取视口详情，避免一次传输整州区块", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/world/map")
      .query({ height: 12, province_id: "jing", view: "detail", width: 12, x: 10, y: 8 })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const data = response.body.data as {
      block_count: number;
      tiles: Array<{ x: number; y: number }>;
      viewport: {
        height: number;
        total_height: number;
        total_width: number;
        width: number;
        x: number;
        y: number;
      };
    };
    expect(data.block_count).toBe(1296);
    expect(data.tiles).toHaveLength(144);
    expect(data.viewport).toMatchObject({
      height: 12,
      total_height: 36,
      total_width: 36,
      width: 12,
      x: 10,
      y: 8,
    });
    expect(
      data.tiles.every((tile) => tile.x >= 10 && tile.x < 22 && tile.y >= 8 && tile.y < 20),
    ).toBe(true);
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
