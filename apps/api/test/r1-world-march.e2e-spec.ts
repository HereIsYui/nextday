import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R1 基础行军队列", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "r1-world-march-secret";
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

  it("未建立主城时不能发起行军", async () => {
    const { token } = await createR1MarchPlayer(app, "无城");

    await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_march_no_city_${Date.now()}_${randomSuffix()}`)
      .send({ target_tile_id: "ji_block_5_5", march_type: "scout" })
      .expect(400);
  });

  it("玩家可以从主城向同州野地发起行军，重复幂等请求不重复创建队列", async () => {
    const { token } = await createR1MarchPlayer(app, "行军");
    await settleMainCity(app, token, "冀北仙城");
    const targetTile = await findMapTile(app, token, "ji", (tile) => tile.tile_type === "wild");
    const idempotencyKey = `idem_r1_march_start_${Date.now()}_${randomSuffix()}`;

    const response = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ target_tile_id: targetTile.tile_id, march_type: "scout" })
      .expect(201);

    expect(response.body.data.march).toMatchObject({
      target_tile_id: targetTile.tile_id,
      target_name: targetTile.tile_name,
      province_id: "ji",
      commandery_id: targetTile.commandery_id,
      march_type: "scout",
      status: "marching",
    });
    expect(response.body.data.march.source_city_name).toBe("冀北仙城");
    expect(response.body.data.march.remaining_seconds).toBeGreaterThan(0);
    expect(response.body.data.march.team).toMatchObject({
      soldier_count: 30,
      supply_cost: 12,
    });

    const duplicate = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ target_tile_id: targetTile.tile_id, march_type: "scout" })
      .expect(201);

    expect(duplicate.body.data.march.march_id).toBe(response.body.data.march.march_id);

    const list = await request(app.getHttpServer())
      .get("/api/world/marches")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(list.body.data.active_count).toBe(1);
    expect(list.body.data.marches).toHaveLength(1);
    expect(list.body.data.marches[0].march_id).toBe(response.body.data.march.march_id);
  });

  it("抵达后的队列显示为已抵达，且不阻塞下一次行军", async () => {
    const { token, playerId } = await createR1MarchPlayer(app, "抵达");
    await settleMainCity(app, token, "常山仙城");
    const wildTile = await findMapTile(app, token, "ji", (tile) => tile.tile_type === "wild");
    const resourceTile = await findMapTile(
      app,
      token,
      "ji",
      (tile) => tile.tile_type === "resource",
    );
    const firstMarch = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_march_arrive_${Date.now()}_${randomSuffix()}`)
      .send({ target_tile_id: wildTile.tile_id, march_type: "scout" })
      .expect(201);

    await prisma.marchQueue.update({
      where: { marchId: firstMarch.body.data.march.march_id as string },
      data: { arrivesAt: new Date(Date.now() - 1000) },
    });

    const arrived = await request(app.getHttpServer())
      .get("/api/world/marches")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(arrived.body.data.active_count).toBe(0);
    expect(arrived.body.data.marches[0]).toMatchObject({
      march_id: firstMarch.body.data.march.march_id,
      status: "arrived",
      remaining_seconds: 0,
    });
    expect(arrived.body.data.marches[0].action_hint).toContain("目标地块");

    const secondMarch = await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_march_second_${Date.now()}_${randomSuffix()}`)
      .send({ target_tile_id: resourceTile.tile_id, march_type: "scout" })
      .expect(201);

    expect(secondMarch.body.data.march.target_tile_id).toBe(resourceTile.tile_id);
    expect(secondMarch.body.data.march.status).toBe("marching");

    const marchCount = await prisma.marchQueue.count({ where: { playerId } });
    expect(marchCount).toBe(2);
  });

  it("R1 阶段不允许跨州行军或前往锁定州府", async () => {
    const { token } = await createR1MarchPlayer(app, "限制");
    await settleMainCity(app, token, "边郡仙城");
    const yanTarget = await findMapTile(app, token, "yan", (tile) => tile.tile_type === "wild");
    const capitalTarget = await findMapTile(
      app,
      token,
      "ji",
      (tile) => tile.tile_type === "capital",
    );

    await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_march_cross_${Date.now()}_${randomSuffix()}`)
      .send({ target_tile_id: yanTarget.tile_id, march_type: "scout" })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/world/march")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_r1_march_locked_${Date.now()}_${randomSuffix()}`)
      .send({ target_tile_id: capitalTarget.tile_id, march_type: "scout" })
      .expect(400);
  });
});

interface TestMapTile {
  tile_id: string;
  tile_name: string;
  commandery_id: string;
  tile_type: string;
  ownership: { owner_player_id: string | null };
}

async function findMapTile(
  app: INestApplication,
  token: string,
  provinceId: string,
  predicate: (tile: TestMapTile) => boolean,
): Promise<TestMapTile> {
  const map = await request(app.getHttpServer())
    .get("/api/world/map")
    .query({ province_id: provinceId, view: "detail" })
    .set("Authorization", `Bearer ${token}`)
    .expect(200);
  const tile = (map.body.data.tiles as TestMapTile[]).find(
    (item) => !item.ownership.owner_player_id && predicate(item),
  );

  if (!tile) {
    throw new Error(`未找到 ${provinceId} 可用地块`);
  }

  return tile;
}

async function createR1MarchPlayer(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r1_march_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_march_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return { token, playerId: createResponse.body.data.profile.player.player_id as string };
}

async function settleMainCity(
  app: INestApplication,
  token: string,
  cityName: string,
): Promise<void> {
  await request(app.getHttpServer())
    .post("/api/city/settle")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r1_march_settle_${Date.now()}_${randomSuffix()}`)
    .send({ province_id: "ji", commandery_id: "ji_commandery_1", city_name: cityName })
    .expect(201);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
