import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("M7 前端与插件体验接口", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m7-test-secret";
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

  it("未登录访问插件状态会被拒绝", async () => {
    await request(app.getHttpServer()).get("/api/plugin/status-card").expect(401);
  });

  it("登录并创建角色后能读取插件小卡片和展开面板", async () => {
    const { token } = await createM7Player(app, "随身", "qi");

    const status = await request(app.getHttpServer())
      .get("/api/plugin/status-card")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(status.body.data.player.name).toContain("随");
    expect(status.body.data.action_state.action_point_cap).toBeGreaterThan(0);
    expect(status.body.data.navigation_links.length).toBeGreaterThan(0);

    const panel = await request(app.getHttpServer())
      .get("/api/plugin/expanded-panel")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(panel.body.data.tasks.length).toBeGreaterThan(0);
    expect(panel.body.data.provinces.length).toBeGreaterThan(0);
    expect(panel.body.data.towers.length).toBeGreaterThan(0);
    expect(panel.body.data.digests.length).toBeGreaterThan(0);
    expect(
      panel.body.data.digests.map((digest: { digest_id: string }) => digest.digest_id),
    ).toContain("ancient_treasure");
  });

  it("插件一键领取按单项结算，重复请求不会重复创建幂等结果", async () => {
    const { token } = await createM7Player(app, "领取", "body");
    const idempotencyKey = `idem_m7_quick_${Date.now()}_${randomSuffix()}`;

    const first = await request(app.getHttpServer())
      .post("/api/plugin/quick-claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ include_tasks: true })
      .expect(201);
    expect(first.body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(first.body.data.status.player.name).toContain("领");

    const second = await request(app.getHttpServer())
      .post("/api/plugin/quick-claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ include_tasks: true })
      .expect(201);
    expect(second.body.data.items.length).toBeGreaterThanOrEqual(2);
  });

  it("插件预设行动只接受白名单并继续消耗服务端行动令", async () => {
    const { token } = await createM7Player(app, "预设", "qi");

    const response = await request(app.getHttpServer())
      .post("/api/plugin/submit-preset")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m7_preset_${Date.now()}_${randomSuffix()}`)
      .send({ preset_id: "explore_ji_once" })
      .expect(201);
    expect(response.body.data.preset_id).toBe("explore_ji_once");
    expect(response.body.data.status.action_state.action_points).toBeLessThan(
      response.body.data.status.action_state.action_point_cap,
    );

    await request(app.getHttpServer())
      .post("/api/plugin/submit-preset")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m7_bad_${Date.now()}_${randomSuffix()}`)
      .send({ preset_id: "bad_script_action" })
      .expect(400);
  });

  it("插件导航返回 Web 与 H5 深链", async () => {
    const { token } = await createM7Player(app, "导航", "qi");
    const response = await request(app.getHttpServer())
      .get("/api/plugin/navigation-links")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.links.map((link: { key: string }) => link.key)).toContain("h5");
  });
});

async function createM7Player(
  app: INestApplication,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix.slice(0, 2)}${Date.now()
    .toString(36)
    .slice(-5)}${randomSuffix()}`.slice(0, 16);
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `m7_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m7_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);

  return {
    token,
    playerId: createResponse.body.data.profile.player.player_id as string,
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
