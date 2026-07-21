import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 九州战略总览", () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-world-atlas-secret";
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

  it("返回九州压缩势力格，而不是完整区块清单", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/world/atlas")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const data = response.body.data as {
      provinces: Array<{
        province: { province_id: string; block_count: number; tower_block_count: number };
        layout_x: number;
        layout_y: number;
        neutral_blocks: number;
        owned_blocks: number;
        layout_width: number;
        layout_height: number;
        player_count: number;
        my_city_count: number;
        my_garrison_soldiers: number;
        active_march_count: number;
        available_birth_blocks: number;
        terrain_distribution: Record<string, number>;
        terrain_rows: string[];
        control_rows: string[];
        landmark_rows: string[];
        city_rows: string[];
        cells: Array<{
          terrain_type: string;
          control: string;
          landmark: string | null;
        }>;
      }>;
    };

    expect(data.provinces).toHaveLength(9);
    expect(data.provinces.reduce((total, item) => total + item.province.block_count, 0)).toBe(8888);

    for (const province of data.provinces) {
      expect(province.cells.length).toBeGreaterThan(0);
      expect(province.cells.length).toBeLessThan(province.province.block_count);
      expect(province.neutral_blocks + province.owned_blocks).toBe(province.province.block_count);
      expect(province.layout_x).toBeGreaterThanOrEqual(0);
      expect(province.layout_y).toBeGreaterThanOrEqual(0);
      expect(province.cells.some((cell) => cell.landmark === "tower")).toBe(true);
      expect(province.terrain_rows).toHaveLength(province.layout_height);
      expect(province.control_rows).toHaveLength(province.layout_height);
      expect(province.landmark_rows).toHaveLength(province.layout_height);
      expect(province.city_rows).toHaveLength(province.layout_height);
      expect(province.terrain_rows.every((row) => row.length === province.layout_width)).toBe(true);
      expect(province.city_rows.every((row) => row.length === province.layout_width)).toBe(true);
      expect(province.landmark_rows.join("")).toContain("t");
      expect(province.city_rows.join("")).toContain("g");
      expect(province.terrain_rows.some((row) => row.includes("."))).toBe(true);
      expect(province.player_count).toBeGreaterThanOrEqual(0);
      expect(province.my_city_count).toBe(0);
      expect(province.my_garrison_soldiers).toBe(0);
      expect(province.active_march_count).toBe(0);
      expect(province.available_birth_blocks).toBeGreaterThan(0);
      expect(
        Object.values(province.terrain_distribution).reduce((total, count) => total + count, 0),
      ).toBe(province.province.block_count);
    }

    const occupiedCells = new Map<string, string>();
    for (const province of data.provinces) {
      for (const cell of atlasProvinceOccupiedCells(province)) {
        expect(occupiedCells.has(cell.key)).toBe(false);
        occupiedCells.set(cell.key, cell.provinceId);
      }
    }
    expect(occupiedCells.size).toBe(8888);
    for (const province of data.provinces) {
      expect(
        atlasProvinceOccupiedCells(province).some((cell) =>
          [
            `${cell.x + 1}:${cell.y}`,
            `${cell.x - 1}:${cell.y}`,
            `${cell.x}:${cell.y + 1}`,
            `${cell.x}:${cell.y - 1}`,
          ].some((neighbor) => {
            const owner = occupiedCells.get(neighbor);
            return owner !== undefined && owner !== cell.provinceId;
          }),
        ),
      ).toBe(true);
    }
  });

  it("并发读取角色状态不会重复创建州域进度", async () => {
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        request(app.getHttpServer())
          .get("/api/game/overview")
          .set("Authorization", `Bearer ${token}`),
      ),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(response.body.data.profile.player).toBeTruthy();
    }
  });
});

function atlasProvincesShareBorder(
  left: { layout_x: number; layout_y: number; layout_width: number; layout_height: number },
  right: { layout_x: number; layout_y: number; layout_width: number; layout_height: number },
): boolean {
  const horizontalOverlap =
    Math.min(left.layout_x + left.layout_width, right.layout_x + right.layout_width) -
    Math.max(left.layout_x, right.layout_x);
  const verticalOverlap =
    Math.min(left.layout_y + left.layout_height, right.layout_y + right.layout_height) -
    Math.max(left.layout_y, right.layout_y);

  return (
    ((left.layout_x + left.layout_width === right.layout_x ||
      right.layout_x + right.layout_width === left.layout_x) &&
      verticalOverlap > 0) ||
    ((left.layout_y + left.layout_height === right.layout_y ||
      right.layout_y + right.layout_height === left.layout_y) &&
      horizontalOverlap > 0)
  );
}

function atlasProvinceOccupiedCells(province: {
  province: { province_id: string };
  layout_x: number;
  layout_y: number;
  terrain_rows: string[];
}) {
  return province.terrain_rows.flatMap((row, y) =>
    Array.from(row).flatMap((terrain, x) =>
      terrain === "."
        ? []
        : [
            {
              key: `${province.layout_x + x}:${province.layout_y + y}`,
              provinceId: province.province.province_id,
              x: province.layout_x + x,
              y: province.layout_y + y,
            },
          ],
    ),
  );
}

async function createPlayerToken(app: INestApplication): Promise<string> {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_world_atlas_${nonce}`, nickname: "沙盘道友" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_world_atlas_create_${nonce}`)
    .send({ name: `城主${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return token;
}
