import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { exploreEnemyPools, exploreLootPools } from "../src/game/game.constants";
import { configureApp } from "../src/platform/configure-app";

describe("P3-1 探索生态核心", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p3-exploration-secret";
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

  it("九州都有 10 只怪物和普通材料掉落池", () => {
    const forbiddenFragments = ["paid", "jade", "ancient", "gubao", "limited"];

    for (const provinceId of Object.keys(exploreEnemyPools)) {
      const enemies = exploreEnemyPools[provinceId];
      const lootPool = exploreLootPools[provinceId];

      expect(enemies).toHaveLength(10);
      expect(lootPool.length).toBeGreaterThanOrEqual(4);
      for (const enemy of enemies) {
        expect(enemy.traits.length).toBeGreaterThan(0);
        expect(enemy.skillName).not.toBe("山海妖息");
      }
      for (const loot of lootPool) {
        expect(loot.name).toBeTruthy();
        expect(loot.sourceHint).toBeTruthy();
        expect(loot.usageHint).toBeTruthy();
        expect(forbiddenFragments.some((fragment) => loot.itemId.includes(fragment))).toBe(false);
      }
    }
  });

  it("同一玩家同时发起探索时只会保留一条队列", async () => {
    const { playerId, token } = await createP3Player(app);
    const responses = await Promise.all(
      ["first", "second"].map((suffix) =>
        request(app.getHttpServer())
          .post("/api/game/explore")
          .set("Authorization", `Bearer ${token}`)
          .set(
            "Idempotency-Key",
            `idem_p3_parallel_explore_${Date.now()}_${suffix}_${randomSuffix()}`,
          )
          .send({ province_id: "ji", count: 1 }),
      ),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([201, 400]);
    const activeRecords = await prisma.exploreActionRecord.findMany({
      where: {
        claimedAt: null,
        playerId,
        status: { in: ["pending", "completed"] },
      },
    });
    expect(activeRecords).toHaveLength(1);
  });

  it("探索领取后返回怪物特性和掉落线索，不再新建奇遇", async () => {
    const { token } = await createP3Player(app);
    const started = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_explore_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", count: 5 })
      .expect(201);

    await prisma.exploreActionRecord.update({
      where: { recordId: started.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });

    const claimed = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_explore_claim_${Date.now()}_${randomSuffix()}`)
      .send({ record_id: started.body.data.record_id })
      .expect(201);

    const allowedJiLoot = new Set(exploreLootPools.ji.map((item) => item.itemId));
    const battles = claimed.body.data.battles as Array<{
      enemy_traits?: string[];
      loot_highlights?: string[];
      battle_hint?: string;
      reason_summary?: string[];
      rewards: { items?: Array<{ item_id: string; count: number }> };
    }>;

    expect(battles).toHaveLength(5);
    expect(claimed.body.data.event).toBeNull();
    expect(claimed.body.data.linked_event_hint).toBeNull();
    expect(claimed.body.data.experience.timeline[0].description).toBe(battles[0].battle_hint);

    const droppedItemIds = battles.flatMap((battle) =>
      (battle.rewards.items ?? []).map((item) => item.item_id),
    );
    expect(new Set(droppedItemIds).size).toBeGreaterThan(1);
    expect(droppedItemIds.every((itemId) => allowedJiLoot.has(itemId))).toBe(true);

    for (const battle of battles) {
      expect(battle.enemy_traits?.length).toBeGreaterThan(0);
      expect(battle.loot_highlights?.length).toBeGreaterThan(0);
      expect(battle.battle_hint).toMatch(/可用于|调整技能|服丹|炼器/);
      expect(battle.reason_summary?.some((reason) => reason.includes("敌方特性"))).toBe(true);
      expect(
        (battle.rewards.items ?? []).every(
          (item) => item.count === 1 && allowedJiLoot.has(item.item_id),
        ),
      ).toBe(true);
    }

    const firstTrait = battles[0].enemy_traits?.[0];
    expect(firstTrait).toBeTruthy();
    const filteredBattles = await request(app.getHttpServer())
      .get("/api/game/battles")
      .query({ enemy_trait: firstTrait, province_id: "ji", result: "win" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(filteredBattles.body.data.filters).toMatchObject({
      enemy_trait: firstTrait,
      province_id: "ji",
      result: "win",
    });
    expect(filteredBattles.body.data.battles.length).toBeGreaterThan(0);
    expect(
      filteredBattles.body.data.battles.every(
        (battle: { enemy_traits: string[]; loot_highlights: string[]; province_id: string }) =>
          battle.province_id === "ji" &&
          battle.enemy_traits.includes(firstTrait ?? "") &&
          battle.loot_highlights.length > 0,
      ),
    ).toBe(true);

    const current = await request(app.getHttpServer())
      .get("/api/game/explore/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(current.body.data.current.battles).toEqual(claimed.body.data.battles);
  });

  it("P3 探索配置 envelope 暴露掉落池和怪物特性", async () => {
    const lootConfig = await request(app.getHttpServer())
      .get("/api/config/explore_loot_pool")
      .expect(200);
    const traitConfig = await request(app.getHttpServer())
      .get("/api/config/enemy_trait")
      .expect(200);
    const linkRuleConfig = await request(app.getHttpServer())
      .get("/api/config/explore_event_link_rule")
      .expect(200);

    expect(lootConfig.body.data.config_type).toBe("explore_loot_pool");
    expect(lootConfig.body.data.config_version).toBe("explore_loot_pool_p3_v1");
    expect(lootConfig.body.data.payload.forbidden_rewards).toContain("paid_jade");
    expect(traitConfig.body.data.config_type).toBe("enemy_trait");
    expect(traitConfig.body.data.payload.enemies).toHaveLength(90);
    expect(
      traitConfig.body.data.payload.enemies.every(
        (enemy: { traits: string[] }) => enemy.traits.length > 0,
      ),
    ).toBe(true);
    expect(linkRuleConfig.body.data.config_type).toBe("explore_event_link_rule");
    expect(linkRuleConfig.body.data.payload.links).toHaveLength(4);
  });
});

async function createP3Player(app: INestApplication): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p3_explore_${nonce}`, nickname: "P3游历客" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p3_create_${nonce}`)
    .send({ name: `P3${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return {
    token,
    playerId: createResponse.body.data.profile.player.player_id as string,
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
