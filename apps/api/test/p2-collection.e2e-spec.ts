import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { collectionBlessingCapPercent } from "../src/collection/collection.constants";
import { configureApp } from "../src/platform/configure-app";

describe("P2-2 多纪元收藏与纪元博物志", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p2-collection-secret";
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
    await prisma?.$disconnect();
    await app?.close();
  });

  it("era_collection 配置可读取，且声明不改变战力和收益公式", async () => {
    const { token } = await createP2CollectionPlayer(app, prisma);

    const response = await request(app.getHttpServer())
      .get("/api/config/era_collection")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.config_type).toBe("era_collection");
    expect(response.body.data.payload.reward_mutation_allowed).toBe(false);
    expect(response.body.data.payload.stat_bonus_allowed).toBe(false);
    expect(response.body.data.payload.blessing_cap_percent).toBe(collectionBlessingCapPercent);
    expect(JSON.stringify(response.body.data.payload.collections)).not.toMatch(
      /attack|damage|contribution_multiplier|drop_rate/i,
    );
  });

  it("收藏馆摘要会持久化已解锁收藏，并保持 stat_bonus 为空", async () => {
    const { token, playerId } = await createP2CollectionPlayer(app, prisma);

    const response = await request(app.getHttpServer())
      .get("/api/collection/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const owned = response.body.data.collections.filter(
      (collection: { owned: boolean }) => collection.owned,
    );
    expect(owned.length).toBeGreaterThanOrEqual(3);
    expect(owned.every((collection: { stat_bonus: null }) => collection.stat_bonus === null)).toBe(
      true,
    );
    expect(
      owned.every(
        (collection: { effective_blessing_percent: number }) =>
          collection.effective_blessing_percent <= collectionBlessingCapPercent,
      ),
    ).toBe(true);

    const persisted = await prisma.eraCollectionRecord.count({ where: { playerId } });
    expect(persisted).toBeGreaterThanOrEqual(3);
  });

  it("展示栏装备使用幂等键，重复提交不会重复写入收藏", async () => {
    const { token, playerId } = await createP2CollectionPlayer(app, prisma);
    const summary = await request(app.getHttpServer())
      .get("/api/collection/summary")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const target = summary.body.data.collections.find(
      (collection: { owned: boolean; display_positions: string[] }) =>
        collection.owned && collection.display_positions.includes("profile_showcase"),
    );
    expect(target).toBeTruthy();

    const idempotencyKey = `idem_p2_collection_equip_${Date.now()}_${randomSuffix()}`;
    const body = { collection_id: target.collection_id, display_slot: "profile_showcase" };
    const equipped = await request(app.getHttpServer())
      .post("/api/collection/display/equip")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/collection/display/equip")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);

    expect(repeated.body.data.record_id).toBe(equipped.body.data.record_id);
    expect(equipped.body.data.collection.display_slot).toBe("profile_showcase");
    expect(equipped.body.data.collection.stat_bonus).toBeNull();

    const displayCount = await prisma.eraCollectionRecord.count({
      where: { playerId, displaySlot: "profile_showcase" },
    });
    expect(displayCount).toBe(1);
  });

  it("纪元博物志只返回公开史料和可展示收藏，不泄露敏感语境", async () => {
    const { token } = await createP2CollectionPlayer(app, prisma);

    const response = await request(app.getHttpServer())
      .get("/api/collection/museum")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.entries.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data.featured_collections.length).toBeGreaterThan(0);
    expect(response.body.data.sensitive_filtered).toBe(true);
    expect(JSON.stringify(response.body.data)).not.toMatch(/订单|IP|UA|风控|GM|审计|后台/);
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /attack|damage|contribution_multiplier|drop_rate/i,
    );
  });
});

async function createP2CollectionPlayer(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p2_collection_${nonce}`, nickname: "收藏道友" })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_collection_create_${nonce}`)
    .send({ name: `收藏${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { chapterId: 2, lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
