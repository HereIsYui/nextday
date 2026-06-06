import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("M1 数据层与模拟登录", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m1-test-secret";
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

  it("无 JWT 访问玩家档案返回认证错误", async () => {
    const response = await request(app.getHttpServer()).get("/api/player/profile").expect(401);

    expect(response.body.code).toBe(10000);
  });

  it("游客登录返回 JWT，并写入账号与登录日志", async () => {
    const deviceId = `m1_device_${Date.now()}`;
    const response = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .set("User-Agent", "m1-test-agent")
      .send({ device_id: deviceId, nickname: "测试道友" })
      .expect(201);

    expect(response.body.data.token).toMatch(/\./);
    expect(response.body.data.account.account_type).toBe("guest");

    const account = await prisma.account.findUnique({
      where: { deviceId },
    });
    expect(account?.accountId).toBe(response.body.data.account.account_id);

    const loginLog = await prisma.loginLog.findFirst({
      where: { accountId: response.body.data.account.account_id, loginType: "guest" },
      orderBy: { createdAt: "desc" },
    });
    expect(loginLog?.userAgentHash).toHaveLength(64);
    expect(loginLog?.userAgentHash).not.toBe("m1-test-agent");
  });

  it("模拟鱼排登录同一用户会复用账号", async () => {
    const fishpiUserId = `fishpi_${Date.now()}`;
    const first = await request(app.getHttpServer())
      .post("/api/auth/mock-fishpi-login")
      .send({ fishpi_user_id: fishpiUserId, username: "鱼排测试" })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/api/auth/mock-fishpi-login")
      .send({ fishpi_user_id: fishpiUserId, username: "鱼排测试二" })
      .expect(201);

    expect(second.body.data.account.account_id).toBe(first.body.data.account.account_id);
  });

  it("创建角色会生成进度、钱包、审计日志，并支持幂等复用", async () => {
    const loginResponse = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `m1_create_${Date.now()}`, nickname: "建号道友" })
      .expect(201);
    const token = loginResponse.body.data.token as string;
    const accountId = loginResponse.body.data.account.account_id as string;
    const idempotencyKey = `idem_m1_create_${Date.now()}`;
    const body = { name: `测道${Date.now()}`, route: "qi" };

    const created = await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);

    const playerId = created.body.data.profile.player.player_id as string;
    expect(repeated.body.data.profile.player.player_id).toBe(playerId);

    const playerCount = await prisma.player.count({ where: { accountId } });
    const progress = await prisma.playerProgress.findUnique({ where: { playerId } });
    const wallet = await prisma.playerWallet.findUnique({ where: { playerId } });
    const audit = await prisma.auditLog.findFirst({
      where: { playerId, action: "player_create", idempotencyKey },
    });

    expect(playerCount).toBe(1);
    expect(progress?.eraId).toBe("era_mvp_001");
    expect(wallet?.spiritStone.toString()).toBe("0");
    expect(audit?.targetId).toBe(playerId);
  });

  it("角色创建缺少幂等键时被拒绝", async () => {
    const loginResponse = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `m1_missing_idem_${Date.now()}` })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${loginResponse.body.data.token}`)
      .send({ name: `缺键${Date.now()}`, route: "qi" })
      .expect(400);

    expect(response.body.message).toContain("Idempotency-Key");
  });

  it("配置接口返回四类合法 envelope", async () => {
    for (const configType of ["realm", "item", "reward", "action"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .expect(200);

      expect(response.body.data).toMatchObject({
        config_type: configType,
        ruleset_version: "ruleset_m1_v1",
      });
      expect(response.body.data.config_version).toContain(configType);
    }
  });

  it("行为日志记录请求轨迹，且 IP 与 UA 只保存摘要", async () => {
    const loginResponse = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .set("User-Agent", "m1-behavior-agent")
      .send({ device_id: `m1_behavior_${Date.now()}` })
      .expect(201);
    const token = loginResponse.body.data.token as string;

    await request(app.getHttpServer())
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)
      .set("User-Agent", "m1-behavior-agent")
      .expect(200);

    const accountId = loginResponse.body.data.account.account_id as string;
    const behaviorLog = await waitForRecord(() =>
      prisma.behaviorLog.findFirst({
        where: { accountId, path: "/api/auth/me" },
        orderBy: { createdAt: "desc" },
      }),
    );

    expect(behaviorLog.userAgentHash).toHaveLength(64);
    expect(behaviorLog.userAgentHash).not.toBe("m1-behavior-agent");
    expect(behaviorLog.ipHash).toHaveLength(64);
  });

  it("开发后台日志查询需要正确 X-Admin-Token", async () => {
    const loginResponse = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `m1_admin_${Date.now()}` })
      .expect(201);
    const token = loginResponse.body.data.token as string;
    const createResponse = await request(app.getHttpServer())
      .post("/api/player/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m1_admin_${Date.now()}`)
      .send({ name: `查录${Date.now()}`, route: "body" })
      .expect(201);
    const playerId = createResponse.body.data.profile.player.player_id as string;

    await request(app.getHttpServer())
      .get(`/api/admin/logs/player/${playerId}?type=audit`)
      .set("X-Admin-Token", "bad-token")
      .expect(403);

    const response = await request(app.getHttpServer())
      .get(`/api/admin/logs/player/${playerId}?type=audit`)
      .set("X-Admin-Token", process.env.ADMIN_DEV_TOKEN ?? "nextday-admin-dev")
      .expect(200);

    expect(response.body.data.player_id).toBe(playerId);
    expect(response.body.data.rows.length).toBeGreaterThan(0);
  });
});

async function waitForRecord<TRecord>(
  loader: () => Promise<TRecord | null>,
  attempts = 20,
): Promise<TRecord> {
  for (let index = 0; index < attempts; index += 1) {
    const record = await loader();
    if (record) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("等待记录写入超时");
}
