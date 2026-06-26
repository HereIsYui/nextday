import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P3-4 今日路线与 Web 体验", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p3-web-route-secret";
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

  it("新玩家今日路线会给出可执行探索步骤，并去重步骤入口", async () => {
    const { token, playerId } = await createP3RoutePlayer(app);
    await markCompletedTasksClaimed(prisma, playerId);

    const route = await request(app.getHttpServer())
      .get("/api/game/daily-route")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(route.body.data.config_version).toBe("daily_route_p3_v1");
    expect(route.body.data.title).toBe("今日修行路线");
    expect(["collect_cave", "explore"]).toContain(route.body.data.primary_action_hint);
    expect(route.body.data.steps.length).toBeGreaterThanOrEqual(6);
    expect(
      new Set(route.body.data.steps.map((step: { step_id: string }) => step.step_id)).size,
    ).toBe(route.body.data.steps.length);
    expect(
      route.body.data.steps.some(
        (step: { action_hint: string; status: string }) =>
          step.action_hint === "explore" && step.status === "active",
      ),
    ).toBe(true);
  });

  it("探索完成未领取时，今日路线优先提示领取探索战报", async () => {
    const { token, playerId } = await createP3RoutePlayer(app);
    await markCompletedTasksClaimed(prisma, playerId);
    const started = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_route_explore_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);
    await prisma.exploreActionRecord.update({
      where: { recordId: started.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });

    const route = await request(app.getHttpServer())
      .get("/api/game/daily-route")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(route.body.data.primary_action_hint).toBe("claim_explore");
    expect(route.body.data.steps[0]).toMatchObject({
      action_hint: "claim_explore",
      status: "active",
    });
  });

  it("洞府有可收取产出时，路线在原地给出收取入口", async () => {
    const { token, playerId } = await createP3RoutePlayer(app);
    await markCompletedTasksClaimed(prisma, playerId);
    await prisma.playerActionState.update({
      where: { playerId },
      data: { actionPoints: 0 },
    });
    await prisma.playerCaveState.update({
      where: { playerId },
      data: { lastCollectedAt: new Date(Date.now() - 90 * 60 * 1000) },
    });

    const route = await request(app.getHttpServer())
      .get("/api/game/daily-route")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(route.body.data.primary_action_hint).toBe("collect_cave");
    expect(
      route.body.data.steps.find(
        (step: { action_hint: string }) => step.action_hint === "collect_cave",
      ),
    ).toMatchObject({
      status: "active",
      target_tab: "growth",
    });
  });
});

async function markCompletedTasksClaimed(prisma: PrismaClient, playerId: string) {
  await prisma.playerTaskState.updateMany({
    where: { playerId, status: "completed" },
    data: { status: "claimed" },
  });
}

async function createP3RoutePlayer(
  app: INestApplication,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p3_route_${nonce}`, nickname: "P3路线客" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p3_route_create_${nonce}`)
    .send({ name: `路线${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return {
    playerId: createResponse.body.data.profile.player.player_id as string,
    token,
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
