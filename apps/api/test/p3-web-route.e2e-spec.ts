import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P3 Web 核心玩法入口", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p3-web-core-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("今日路线接口已删除", async () => {
    const login = await request(app.getHttpServer())
      .post("/api/auth/guest-login")
      .send({ device_id: `p3_route_${Date.now()}`, nickname: "路线测试" })
      .expect(201);
    await request(app.getHttpServer())
      .get("/api/game/daily-route")
      .set("Authorization", `Bearer ${login.body.data.token}`)
      .expect(404);
  });
});
