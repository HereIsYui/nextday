import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const provinceOrder = ["冀州", "兖州", "青州", "徐州", "扬州", "荆州", "豫州", "梁州", "雍州"];
const towerOrder = [
  "玄铁塔",
  "礼法塔",
  "潮生塔",
  "戈阳塔",
  "琉光塔",
  "万木塔",
  "天衡塔",
  "镇岳塔",
  "太初塔",
];

describe("P1 九州全域与九塔机制", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-world-secret";
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

  it("总览和配置返回九州全域，幽州不作为系统州名", async () => {
    const { token } = await createP1WorldPlayer(app, prisma, "九州", "qi");

    const overview = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const provinces = overview.body.data.provinces as Array<{
      name: string;
      theme: string;
      tower_name: string;
      chapter_required: number;
      resources: string[];
      low_level_entry: string;
      long_term_goal: string;
      tower_effect: string;
      unlocked: boolean;
    }>;

    expect(provinces.map((province) => province.name)).toEqual(provinceOrder);
    expect(JSON.stringify(provinces)).not.toContain("幽州");
    expect(provinces[0]).toMatchObject({
      name: "冀州",
      tower_name: "玄铁塔",
      chapter_required: 1,
      unlocked: true,
    });
    expect(provinces[8]).toMatchObject({
      name: "雍州",
      tower_name: "太初塔",
      chapter_required: 6,
      unlocked: false,
    });
    for (const province of provinces) {
      expect(province.theme.length).toBeGreaterThan(0);
      expect(province.resources.length).toBe(3);
      expect(province.low_level_entry.length).toBeGreaterThan(0);
      expect(province.long_term_goal.length).toBeGreaterThan(0);
      expect(province.tower_effect.length).toBeGreaterThan(0);
    }

    const worldConfig = await request(app.getHttpServer()).get("/api/config/world").expect(200);
    expect(
      worldConfig.body.data.payload.provinces.map((item: { name: string }) => item.name),
    ).toEqual(provinceOrder);

    const battleConfig = await request(app.getHttpServer()).get("/api/config/battle").expect(200);
    expect(battleConfig.body.data.payload.enemies).toHaveLength(9);
    expect(JSON.stringify(battleConfig.body.data.payload.enemies)).toContain("九婴残首");
  });

  it("九塔全量返回机制字段，新增五塔可异步提交行动", async () => {
    const { token } = await createP1WorldPlayer(app, prisma, "九塔", "body");

    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const towerList = towers.body.data.towers as Array<{
      tower_id: string;
      tower_name: string;
      mechanism: string;
      boss_name: string;
      material_name: string;
      state_effect: string;
    }>;

    expect(towerList.map((tower) => tower.tower_name)).toEqual(towerOrder);
    for (const tower of towerList) {
      expect(tower.mechanism.length).toBeGreaterThan(0);
      expect(tower.boss_name.length).toBeGreaterThan(0);
      expect(tower.material_name.length).toBeGreaterThan(0);
      expect(tower.state_effect.length).toBeGreaterThan(0);
    }

    for (const tower of towerList.slice(4)) {
      const response = await request(app.getHttpServer())
        .post("/api/multiplayer/towers/action")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `idem_p1_world_${tower.tower_id}_${Date.now()}_${randomSuffix()}`)
        .send({ tower_id: tower.tower_id, action_type: "supply", count: 1 })
        .expect(201);

      expect(response.body.data.tower.tower_id).toBe(tower.tower_id);
      expect(response.body.data.contribution).toBeGreaterThan(0);
      expect(
        response.body.data.experience.reason_tags.map((tag: { code: string }) => tag.code),
      ).toContain("async_tower");
    }
  });

  it("九州作为文字地点保留州域探索与战报", async () => {
    const { token } = await createP1WorldPlayer(app, prisma, "游历", "qi");

    const started = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_world_explore_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);

    expect(started.body.data).toMatchObject({
      province_id: "ji",
      province_name: "冀州",
      status: "pending",
    });
    await prisma.exploreActionRecord.update({
      where: { recordId: started.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });
    const claimed = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_world_claim_${Date.now()}_${randomSuffix()}`)
      .send({ record_id: started.body.data.record_id })
      .expect(201);

    expect(claimed.body.data.status).toBe("claimed");
    expect(claimed.body.data.battles).toHaveLength(1);
  });
});

async function createP1WorldPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix}${Date.now().toString(36).slice(-5)}${randomSuffix()}`.slice(
    0,
    16,
  );
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p1_world_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p1_world_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
