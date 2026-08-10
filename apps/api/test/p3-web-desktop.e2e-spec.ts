import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P3 后续桌面 Web 体验闭环", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p3-web-desktop-secret";
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

  it("探索进行中可直接读取当前行旅，不依赖今日路线", async () => {
    const { token, playerId } = await createDesktopRoutePlayer(app);
    await markCompletedTasksClaimed(prisma, playerId);
    await markCaveJustCollected(prisma, playerId);

    await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_desktop_running_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji" })
      .expect(201);

    const current = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(current.body.data.action).toMatchObject({
      province_id: "ji",
      status: "active",
      can_claim: false,
    });
  });

  it("没有进行中探索时当前行旅为空，行动令不足不会伪造入口", async () => {
    const { token, playerId } = await createDesktopRoutePlayer(app);
    await markCompletedTasksClaimed(prisma, playerId);
    await markCaveJustCollected(prisma, playerId);
    const current = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(current.body.data.action).toBeNull();
    await request(app.getHttpServer())
      .get("/api/game/daily-route")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("修行境界弹窗接口返回完整小境界和等级，不暴露长内部标识", async () => {
    const { token } = await createDesktopRoutePlayer(app);
    const response = await request(app.getHttpServer())
      .get("/api/game/realm-progression")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.realms).toHaveLength(9);
    expect(response.body.data.realms[0].stages).toHaveLength(3);
    expect(response.body.data.realms[0].stages[0].levels).toHaveLength(3);
    expect(response.body.data.realms[8].stages[0].levels).toHaveLength(12);
    expect(
      response.body.data.realms[0].stages[0].levels.every(
        (level: { cultivation_required: string }) => BigInt(level.cultivation_required) > 0n,
      ),
    ).toBe(true);
  });
});

async function markCompletedTasksClaimed(prisma: PrismaClient, playerId: string) {
  await prisma.playerTaskState.updateMany({
    where: { playerId, status: "completed" },
    data: { status: "claimed" },
  });
}

async function markCaveJustCollected(prisma: PrismaClient, playerId: string) {
  await prisma.playerCaveState.update({
    where: { playerId },
    data: { lastCollectedAt: new Date(Date.now() + 5 * 60 * 1000) },
  });
}

async function createDesktopRoutePlayer(
  app: INestApplication,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p3_desktop_${nonce}`, nickname: "桌面试玩客" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p3_desktop_create_${nonce}`)
    .send({ name: `桌面${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return {
    playerId: createResponse.body.data.profile.player.player_id as string,
    token,
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
