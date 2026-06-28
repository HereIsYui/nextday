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

  it("探索进行中时今日路线优先显示等待队列，不被任务查看卡住", async () => {
    const { token, playerId } = await createDesktopRoutePlayer(app);
    await markCompletedTasksClaimed(prisma, playerId);
    await markCaveJustCollected(prisma, playerId);

    await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_desktop_running_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);

    const route = await request(app.getHttpServer())
      .get("/api/game/daily-route")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(route.body.data.primary_action_hint).toBe("claim_explore");
    expect(route.body.data.steps[0]).toMatchObject({
      action_hint: "claim_explore",
      state_label: "等待完成",
      status: "pending",
      view_state: "waiting",
    });
    expect(
      route.body.data.steps.find((step: { step_id: string }) => step.step_id === "claim_task"),
    ).toMatchObject({
      action_label: "查看任务",
      view_state: "jump",
    });
  });

  it("无可领任务且行动令不足时给出查看进度与缺条件，不显示假可领入口", async () => {
    const { token, playerId } = await createDesktopRoutePlayer(app);
    await markCompletedTasksClaimed(prisma, playerId);
    await markCaveJustCollected(prisma, playerId);
    await prisma.playerActionState.update({
      where: { playerId },
      data: { actionPoints: 0 },
    });

    const route = await request(app.getHttpServer())
      .get("/api/game/daily-route")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const taskStep = route.body.data.steps.find(
      (step: { step_id: string }) => step.step_id === "claim_task",
    );
    const exploreStep = route.body.data.steps.find(
      (step: { step_id: string }) => step.step_id === "start_explore",
    );

    expect(route.body.data.primary_step_id).toBe("claim_task");
    expect(taskStep).toMatchObject({
      action_label: "查看任务",
      state_label: "查看进度",
      status: "pending",
      view_state: "jump",
    });
    expect(exploreStep).toMatchObject({
      action_label: "等待行动令",
      state_label: "缺条件",
      view_state: "blocked",
    });
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
