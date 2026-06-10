import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { exploreEnemyPools } from "../src/game/game.constants";
import { configureApp } from "../src/platform/configure-app";

describe("M2 核心循环", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m2-test-secret";
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

  it("创建角色后能读取 M2 第一屏总览", async () => {
    const { token, playerId } = await createM2Player(app, "总览");

    const response = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.profile.player.player_id).toBe(playerId);
    expect(response.body.data.action_state.action_points).toBeGreaterThanOrEqual(60);
    expect(response.body.data.cultivation.claimable_cultivation).toMatch(/^\d+$/);
    expect(response.body.data.cave.claimable_minutes).toBeGreaterThanOrEqual(0);
    expect(response.body.data.provinces).toHaveLength(9);
    expect(response.body.data.provinces[0]).toMatchObject({
      province_id: "ji",
      name: "冀州",
      tower_name: "玄铁塔",
      unlocked: true,
    });
    expect(response.body.data.provinces[8]).toMatchObject({
      province_id: "yong",
      name: "雍州",
      tower_name: "太初塔",
      unlocked: false,
    });
    expect(
      response.body.data.tasks.some(
        (task: { task_id: string }) => task.task_id === "daily_explore",
      ),
    ).toBe(true);
  });

  it("领取修为支持幂等，且不会重复结算", async () => {
    const { token } = await createM2Player(app, "修为");
    const idempotencyKey = `idem_m2_claim_${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post("/api/game/cultivation/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/game/cultivation/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .expect(201);

    expect(first.body.data.record_id).toBe(repeated.body.data.record_id);
    expect(Number(first.body.data.gained_cultivation)).toBeGreaterThanOrEqual(0);
    expect(first.body.data.completed_task_ids).toContain("novice_claim_cultivation");
  });

  it("普通探索先生成异步队列，完成后领取战报、任务和奖励", async () => {
    const { token, playerId } = await createM2Player(app, "探索");
    const before = await request(app.getHttpServer())
      .get("/api/game/overview")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const beforeActionPoints = before.body.data.action_state.action_points as number;

    const response = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_explore_${Date.now()}`)
      .send({ province_id: "ji", count: 5 })
      .expect(201);

    expect(response.body.data.action_state.action_points).toBe(beforeActionPoints - 5);
    expect(response.body.data.status).toBe("pending");
    expect(response.body.data.seconds_per_explore).toBe(20);
    expect(response.body.data.battles).toHaveLength(0);

    await prisma.exploreActionRecord.update({
      where: { recordId: response.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });
    const claimed = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_explore_claim_${Date.now()}`)
      .send({ record_id: response.body.data.record_id })
      .expect(201);

    expect(claimed.body.data.status).toBe("claimed");
    expect(claimed.body.data.battles).toHaveLength(5);
    const jiEnemyNames = new Set(exploreEnemyPools.ji.map((enemy) => enemy.enemyName));
    const battleEnemyNames = claimed.body.data.battles.map(
      (battle: { enemy_name: string }) => battle.enemy_name,
    );
    expect(battleEnemyNames.every((enemyName: string) => jiEnemyNames.has(enemyName))).toBe(true);
    expect(new Set(battleEnemyNames).size).toBeGreaterThan(1);
    const enemySkillNames = claimed.body.data.battles.flatMap(
      (battle: { enemy_name: string; log: Array<{ actor: string; skill: string }> }) =>
        battle.log.filter((round) => round.actor === battle.enemy_name).map((round) => round.skill),
    );
    expect(enemySkillNames).not.toContain("山海妖息");
    expect(claimed.body.data.battles[0].log.length).toBeGreaterThan(0);
    expect(claimed.body.data.completed_task_ids).toContain("novice_explore_ji");
    expect(claimed.body.data.completed_task_ids).toContain("daily_explore");

    const battleCount = await prisma.battleLog.count({
      where: { playerId, battleType: "explore" },
    });
    const provinceProgress = await prisma.playerProvinceProgress.findUnique({
      where: { playerId_provinceId: { playerId, provinceId: "ji" } },
    });
    const exploreRecord = await prisma.exploreActionRecord.findUnique({
      where: { recordId: response.body.data.record_id },
    });
    expect(exploreRecord?.battleSnapshot).toEqual(claimed.body.data.battles);
    expect(battleCount).toBe(5);
    expect(provinceProgress?.explorationCount).toBe(5);
  });

  it("重复探索请求使用同一幂等键时不会重复扣行动令", async () => {
    const { token } = await createM2Player(app, "幂等");
    const idempotencyKey = `idem_m2_explore_repeat_${Date.now()}`;

    const first = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ province_id: "ji", count: 2 })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ province_id: "ji", count: 2 })
      .expect(201);

    expect(first.body.data.record_id).toBe(repeated.body.data.record_id);
    expect(first.body.data.action_state.action_points).toBe(
      repeated.body.data.action_state.action_points,
    );
    expect(first.body.data.battles).toHaveLength(0);
    expect(repeated.body.data.status).toBe("pending");
  });

  it("探索未完成不能领取，完成后同一玩家不能再保留第二个待领取队列", async () => {
    const { token } = await createM2Player(app, "异步");
    const started = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_async_explore_${Date.now()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);

    const earlyClaim = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_async_claim_early_${Date.now()}`)
      .send({ record_id: started.body.data.record_id })
      .expect(400);
    expect(earlyClaim.body.message).toContain("探索尚未完成");

    await prisma.exploreActionRecord.update({
      where: { recordId: started.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });
    const current = await request(app.getHttpServer())
      .get("/api/game/explore/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(current.body.data.current.status).toBe("completed");

    const secondStart = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_async_second_${Date.now()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(400);
    expect(secondStart.body.message).toContain("已有探索完成待领取");
  });

  it("行动令不足时拒绝探索", async () => {
    const { token, playerId } = await createM2Player(app, "行动");
    await prisma.playerActionState.update({
      where: { playerId },
      data: { actionPoints: 0, lastRecoveredAt: new Date() },
    });

    const response = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_no_action_${Date.now()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(400);

    expect(response.body.message).toContain("行动令不足");
  });

  it("已完成任务可领取奖励，洞府收取会写入记录", async () => {
    const { token, playerId } = await createM2Player(app, "任务");

    const taskResponse = await request(app.getHttpServer())
      .post("/api/game/tasks/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_task_${Date.now()}`)
      .send({ task_id: "novice_create_role" })
      .expect(201);

    expect(taskResponse.body.data.task.status).toBe("claimed");
    expect(taskResponse.body.data.rewards.spirit_stone).toBe("100");

    await prisma.playerCaveState.update({
      where: { playerId },
      data: { lastCollectedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    const caveResponse = await request(app.getHttpServer())
      .post("/api/game/cave/collect")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m2_cave_${Date.now()}`)
      .expect(201);

    expect(Number(caveResponse.body.data.rewards.spirit_stone)).toBeGreaterThan(0);
    expect(caveResponse.body.data.completed_task_ids).toContain("daily_cave_collect");

    const caveRecord = await prisma.caveCollectRecord.findFirst({
      where: { playerId },
      orderBy: { createdAt: "desc" },
    });
    expect(caveRecord?.collectedMinutes).toBeGreaterThan(0);
  });

  it("M2 新增配置类型都返回合法 envelope", async () => {
    for (const configType of ["world", "task", "battle", "cave"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .expect(200);

      expect(response.body.data.config_type).toBe(configType);
      expect(response.body.data.config_version).toContain(configType);
      expect(response.body.data.ruleset_version).toBe("ruleset_m2_v1");
    }
  });
});

async function createM2Player(
  app: INestApplication,
  namePrefix: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `m2_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m2_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return {
    token,
    playerId: createResponse.body.data.profile.player.player_id as string,
  };
}
