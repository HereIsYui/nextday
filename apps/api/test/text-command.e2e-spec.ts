import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("文字命令接口", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "text-command-test-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("帮助接口要求登录，命令接口要求幂等键", async () => {
    await request(app.getHttpServer()).get("/api/game/command-help").expect(401);

    const { token } = await createTextCommandPlayer(app, "校验");
    const response = await request(app.getHttpServer())
      .post("/api/game/commands")
      .set("Authorization", `Bearer ${token}`)
      .send({ command: "状态" })
      .expect(400);

    expect(response.body.message).toContain("Idempotency-Key");
  });

  it("返回帮助日志、中文错误提示，并复用底层探索结算幂等键", async () => {
    const { token } = await createTextCommandPlayer(app, "指令");
    const help = await request(app.getHttpServer())
      .get("/api/game/command-help")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(help.body.data.groups[0]).toMatchObject({ group_id: "overview", title: "总览" });

    const invalid = await request(app.getHttpServer())
      .post("/api/game/commands")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_text_invalid_${randomSuffix()}`)
      .send({ command: "探索" })
      .expect(201);

    expect(invalid.body.data.command_id).toBe("invalid");
    expect(invalid.body.data.entries).toEqual([
      expect.objectContaining({ entry_id: "entry_1", tone: "error" }),
    ]);
    expect(invalid.body.data.entries[0].text).toContain("探索 <州域> [次数]");

    const idempotencyKey = `idem_text_explore_${randomSuffix()}`;
    const first = await request(app.getHttpServer())
      .post("/api/game/commands")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ command: "游历 冀州 1" })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/game/commands")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ command: "游历 冀州 1" })
      .expect(201);

    expect(first.body.data.command_id).toBe("explore");
    expect(first.body.data.entries[0]).toMatchObject({ entry_id: "entry_1", tone: "success" });
    expect(first.body.data.state.result.record_id).toBe(repeated.body.data.state.result.record_id);
  });
});

async function createTextCommandPlayer(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string }> {
  const nonce = randomSuffix();
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `text_command_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_text_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return { token };
}

function randomSuffix(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
