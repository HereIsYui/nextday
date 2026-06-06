import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("API 健康检查", () => {
  let app: INestApplication;

  beforeAll(async () => {
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

  it("GET /health 返回统一响应", async () => {
    const response = await request(app.getHttpServer()).get("/health").expect(200);

    expect(response.body).toMatchObject({
      code: 0,
      message: "ok",
      data: {
        status: "ok",
        service: "nextday-api",
      },
    });
    expect(response.body.trace_id).toMatch(/^req_/);
  });

  it("允许 Web 本地开发来源通过 CORS 预检", async () => {
    const response = await request(app.getHttpServer())
      .options("/health")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "content-type,x-request-id,x-client-version")
      .expect(204);

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-headers"]).toContain("X-Request-Id");
  });

  it("状态变更接口缺少幂等键时返回错误", async () => {
    const response = await request(app.getHttpServer())
      .post("/health/idempotency-example")
      .expect(400);

    expect(response.body.code).not.toBe(0);
    expect(response.body.message).toContain("Idempotency-Key");
  });

  it("状态变更接口携带幂等键时通过", async () => {
    const response = await request(app.getHttpServer())
      .post("/health/idempotency-example")
      .set("Idempotency-Key", "idem_health_test")
      .expect(200);

    expect(response.body).toMatchObject({
      code: 0,
      data: {
        accepted: true,
      },
    });
  });
});
