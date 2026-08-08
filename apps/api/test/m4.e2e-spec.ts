import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { type EraChronicleRecord, Prisma, PrismaClient, type TowerState } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { defaultEraId } from "../src/game/game.constants";
import {
  towerLifecycleAutoBreakProgressPerDay,
  towerLifecycleBreakProgressTarget,
  towerLifecycleConfigVersion,
  towerLifecycleMaxSealDelayProgress,
} from "../src/multiplayer/multiplayer.constants";
import { MultiplayerService } from "../src/multiplayer/multiplayer.service";
import { configureApp } from "../src/platform/configure-app";

describe("M4 多人异步玩法", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m4-test-secret";
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

  it("成仙后可镇封九塔，消耗行动令、推进塔状态，并支持幂等", async () => {
    const { token, playerId } = await createM4Player(app, prisma, "九塔", "qi");
    await setFactionRoute(prisma, playerId, "immortal");

    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(towers.body.data.towers).toHaveLength(9);
    expect(towers.body.data.towers.map((item: { tower_name: string }) => item.tower_name)).toEqual([
      "玄铁塔",
      "礼法塔",
      "潮生塔",
      "戈阳塔",
      "琉光塔",
      "万木塔",
      "天衡塔",
      "镇岳塔",
      "太初塔",
    ]);
    const tower = towers.body.data.towers[0];

    const beforeAction = await prisma.playerActionState.findUniqueOrThrow({ where: { playerId } });
    const idempotencyKey = `idem_m4_tower_${Date.now()}_${randomSuffix()}`;
    const first = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 2 })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 2 })
      .expect(201);

    expect(repeated.body.data.record_id).toBe(first.body.data.record_id);
    expect(first.body.data.contribution).toBeGreaterThan(0);
    expect(first.body.data.action_state.action_points).toBe(beforeAction.actionPoints - 4);
    expect(first.body.data.tower.seal_progress).toBeGreaterThanOrEqual(tower.seal_progress + 48);

    const recordCount = await prisma.towerActionRecord.count({
      where: { playerId, idempotencyKey },
    });
    expect(recordCount).toBe(1);
  });

  it("公共 Boss 使用镜像挑战汇总阶段血量池，不要求固定时间在线", async () => {
    const { token, playerId } = await createM4Player(app, prisma, "Boss", "body");

    const before = await request(app.getHttpServer())
      .get("/api/multiplayer/boss")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const beforeBoss = before.body.data.boss;

    const challenged = await request(app.getHttpServer())
      .post("/api/multiplayer/boss/challenge")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_boss_${Date.now()}_${randomSuffix()}`)
      .send({ boss_id: beforeBoss.boss_id })
      .expect(201);

    expect(challenged.body.data.damage_done).toBeGreaterThan(0);
    expect(challenged.body.data.log.length).toBeGreaterThan(0);
    expect(challenged.body.data.boss.boss_id).toBe(beforeBoss.boss_id);

    const record = await prisma.worldBossChallengeRecord.findFirst({
      where: { playerId },
      orderBy: { createdAt: "desc" },
    });
    expect(record?.damageDone).toBe(challenged.body.data.damage_done);
  });

  it("宗门支持创建、任务和仓库白名单，付费或绑定产物不能入库", async () => {
    const { token, playerId } = await createM4Player(app, prisma, "宗门", "qi");
    await grantSpiritStone(prisma, playerId, 1000);

    const created = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_sect_create_${Date.now()}_${randomSuffix()}`)
      .send({ name: `青岚${randomSuffix()}`, alignment: "neutral" })
      .expect(201);

    expect(created.body.data.sect.my_role).toBe("leader");
    const player = await prisma.player.findUniqueOrThrow({ where: { playerId } });
    expect(player.sectId).toBe(created.body.data.sect.sect_id);

    const task = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/tasks/complete")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_sect_task_${Date.now()}_${randomSuffix()}`)
      .send({ task_id: "sect_patrol" })
      .expect(201);
    expect(task.body.data.contribution).toBeGreaterThan(0);
    expect(Number(task.body.data.sect.funds)).toBeGreaterThan(0);

    const boundItemId = await createItem(prisma, playerId, "raw_iron", 2, "bound", "test_seed");
    await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_bound_${Date.now()}_${randomSuffix()}`)
      .send({ item_instance_id: boundItemId, count: 1 })
      .expect(400);

    const paidItemId = await createItem(prisma, playerId, "raw_iron", 2, "unbound", "paid_pack");
    await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_paid_${Date.now()}_${randomSuffix()}`)
      .send({ item_instance_id: paidItemId, count: 1 })
      .expect(400);

    const itemInstanceId = await createItem(
      prisma,
      playerId,
      "raw_iron",
      3,
      "unbound",
      "test_seed",
    );
    const deposited = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/deposit")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_deposit_${Date.now()}_${randomSuffix()}`)
      .send({ item_instance_id: itemInstanceId, count: 2 })
      .expect(201);

    expect(
      deposited.body.data.warehouse.some(
        (item: { item_id: string }) => item.item_id === "raw_iron",
      ),
    ).toBe(true);

    const withdrawn = await request(app.getHttpServer())
      .post("/api/multiplayer/sects/warehouse/withdraw")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_wh_withdraw_${Date.now()}_${randomSuffix()}`)
      .send({ item_id: "raw_iron", count: 1 })
      .expect(201);
    expect(
      withdrawn.body.data.bag.items.some(
        (item: { item_id: string }) => item.item_id === "raw_iron",
      ),
    ).toBe(true);
  });

  it("九塔行动可结算专用炼制材料，并保留个人行动记录", async () => {
    const { token, playerId } = await createM4Player(app, prisma, "材料", "qi");
    await setFactionRoute(prisma, playerId, "immortal");

    const response = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m4_tower_material_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: "tower_chaosheng", action_type: "seal", count: 1 })
      .expect(201);

    expect(response.body.data.rewards.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "alch_void_moss", name: "玄阴苔", count: 1 }),
      ]),
    );
    const record = await prisma.towerActionRecord.findUniqueOrThrow({
      where: { recordId: response.body.data.record_id },
    });
    expect(record.playerId).toBe(playerId);
    expect(record.towerId).toBe("tower_chaosheng");
  });

  it("九塔镇封与破阵受仙魔路线限制，失败时不消耗行动令", async () => {
    const undecided = await createM4Player(app, prisma, "未定", "qi");
    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${undecided.token}`)
      .expect(200);
    const tower = towers.body.data.towers[0] as { tower_id: string };
    const before = await prisma.playerActionState.findUniqueOrThrow({
      where: { playerId: undecided.playerId },
    });

    await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${undecided.token}`)
      .set("Idempotency-Key", `idem_m4_undecided_seal_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${undecided.token}`)
      .set("Idempotency-Key", `idem_m4_undecided_break_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "break", count: 1 })
      .expect(400);

    const after = await prisma.playerActionState.findUniqueOrThrow({
      where: { playerId: undecided.playerId },
    });
    expect(after.actionPoints).toBe(before.actionPoints);
    expect(await prisma.towerActionRecord.count({ where: { playerId: undecided.playerId } })).toBe(
      0,
    );
    const guardBefore = await prisma.towerState.findUniqueOrThrow({
      where: { eraId_towerId: { eraId: "era_mvp_001", towerId: tower.tower_id } },
    });
    const guarded = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${undecided.token}`)
      .set("Idempotency-Key", `idem_m4_undecided_guard_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "guard", count: 1 })
      .expect(201);
    expect(guarded.body.data.tower.seal_progress).toBe(guardBefore.sealProgress);
    expect(guarded.body.data.tower.integrity).toBeGreaterThan(guardBefore.integrity);

    const immortal = await createM4Player(app, prisma, "仙路", "qi");
    await setFactionRoute(prisma, immortal.playerId, "immortal");
    await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${immortal.token}`)
      .set("Idempotency-Key", `idem_m4_immortal_break_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "break", count: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${immortal.token}`)
      .set("Idempotency-Key", `idem_m4_immortal_seal_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 1 })
      .expect(201);

    const demon = await createM4Player(app, prisma, "魔路", "body");
    await setFactionRoute(prisma, demon.playerId, "demon");
    await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${demon.token}`)
      .set("Idempotency-Key", `idem_m4_demon_seal_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "seal", count: 1 })
      .expect(400);
    await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${demon.token}`)
      .set("Idempotency-Key", `idem_m4_demon_break_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "break", count: 1 })
      .expect(201);
  });

  it("九塔自然破阵受镇封延缓上限约束，并幂等写入终局史册", async () => {
    const multiplayerService = app.get(MultiplayerService);

    const originalTowers = await prisma.towerState.findMany({
      where: { eraId: defaultEraId },
      orderBy: { towerId: "asc" },
    });
    const originalChronicles = await prisma.eraChronicleRecord.findMany({
      where: {
        eraId: defaultEraId,
        serverId: "default",
        chronicleType: { in: ["tower_lifecycle", "tower_finale"] },
      },
      orderBy: { chronicleType: "asc" },
    });
    const activationAt = new Date("2040-01-01T00:00:00.000Z");
    const dayMilliseconds = 24 * 60 * 60 * 1000;
    const naturalProgressBeforeFinale =
      Math.ceil(towerLifecycleBreakProgressTarget / towerLifecycleAutoBreakProgressPerDay) *
      towerLifecycleAutoBreakProgressPerDay;
    const naturalProgressAtFinale =
      Math.ceil(
        (towerLifecycleBreakProgressTarget + towerLifecycleMaxSealDelayProgress) /
          towerLifecycleAutoBreakProgressPerDay,
      ) * towerLifecycleAutoBreakProgressPerDay;
    const reachesUnsealedTargetAt = new Date(
      activationAt.getTime() +
        (naturalProgressBeforeFinale / towerLifecycleAutoBreakProgressPerDay) * dayMilliseconds,
    );
    const reachesDelayedTargetAt = new Date(
      activationAt.getTime() +
        (naturalProgressAtFinale / towerLifecycleAutoBreakProgressPerDay) * dayMilliseconds,
    );
    const massiveSealProgress = towerLifecycleMaxSealDelayProgress * 10;

    try {
      expect(originalTowers).toHaveLength(9);
      const towerIds = originalTowers.map((tower) => tower.towerId);
      const towerStateIds = originalTowers.map((tower) => tower.towerStateId);
      await prisma.$transaction(async (tx) => {
        await tx.eraChronicleRecord.deleteMany({
          where: {
            eraId: defaultEraId,
            serverId: "default",
            chronicleType: { in: ["tower_lifecycle", "tower_finale"] },
          },
        });
        await tx.towerState.updateMany({
          where: { towerStateId: { in: towerStateIds } },
          data: {
            integrity: 1000,
            sealProgress: massiveSealProgress,
            breakProgress: 0,
            supplyProgress: 0,
            riftPressure: 0,
            corruption: 0,
            phase: 1,
          },
        });
        await tx.eraChronicleRecord.create({
          data: {
            chronicleId: `tower_lifecycle_${defaultEraId}`,
            eraId: defaultEraId,
            serverId: "default",
            chronicleType: "tower_lifecycle",
            publicSummary: {
              title: "九塔生命周期测试",
              summary: "验证自然破阵不会被大量镇封永久阻断。",
              highlights: [],
            },
            privateSummary: {
              activation_at: activationAt.toISOString(),
              break_baselines: Object.fromEntries(towerIds.map((towerId) => [towerId, 0])),
              eligible_player_count: 1,
              selected_player_count: 1,
              seal_baselines: Object.fromEntries(towerIds.map((towerId) => [towerId, 0])),
            },
            relatedSourceIds: towerStateIds,
            visibilityRule: "admin",
            storyConfigVersion: towerLifecycleConfigVersion,
            collectionConfigVersion: towerLifecycleConfigVersion,
          },
        });
      });

      await multiplayerService.reconcileTowerLifecycle(undefined, reachesUnsealedTargetAt);

      const delayedTowers = await prisma.towerState.findMany({
        where: { towerStateId: { in: towerStateIds } },
      });
      expect(delayedTowers).toHaveLength(9);
      for (const tower of delayedTowers) {
        expect(tower.sealProgress).toBe(massiveSealProgress);
        expect(tower.breakProgress).toBe(
          naturalProgressBeforeFinale - towerLifecycleMaxSealDelayProgress,
        );
        expect(tower.breakProgress).toBeLessThan(towerLifecycleBreakProgressTarget);
        expect(tower.phase).toBe(2);
      }
      expect(
        await prisma.eraChronicleRecord.count({
          where: {
            eraId: defaultEraId,
            serverId: "default",
            chronicleType: "tower_finale",
          },
        }),
      ).toBe(0);

      await multiplayerService.reconcileTowerLifecycle(undefined, reachesDelayedTargetAt);

      const finale = await prisma.eraChronicleRecord.findUniqueOrThrow({
        where: {
          eraId_serverId_chronicleType: {
            eraId: defaultEraId,
            serverId: "default",
            chronicleType: "tower_finale",
          },
        },
      });
      const brokenTowers = await prisma.towerState.findMany({
        where: { towerStateId: { in: towerStateIds } },
      });
      expect(brokenTowers).toHaveLength(9);
      for (const tower of brokenTowers) {
        expect(tower.breakProgress).toBeGreaterThanOrEqual(towerLifecycleBreakProgressTarget);
        expect(tower.phase).toBe(3);
      }

      await multiplayerService.reconcileTowerLifecycle(undefined, reachesDelayedTargetAt);

      const finales = await prisma.eraChronicleRecord.findMany({
        where: {
          eraId: defaultEraId,
          serverId: "default",
          chronicleType: "tower_finale",
        },
      });
      expect(finales).toHaveLength(1);
      expect(finales[0]?.chronicleId).toBe(finale.chronicleId);
      expect(finales[0]?.createdAt).toEqual(finale.createdAt);
    } finally {
      await restoreDefaultEraTowerLifecycle(prisma, originalTowers, originalChronicles);
    }
  });

  it("个人、宗门与九塔排行榜可读取，奖励预览不发唯一战力道具", async () => {
    for (const rankType of ["personal", "sect", "tower_week"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/multiplayer/ranks/${rankType}`)
        .set(
          "Authorization",
          `Bearer ${(await createM4Player(app, prisma, `榜${rankType}`, "qi")).token}`,
        )
        .expect(200);

      expect(response.body.data.rank_type).toBe(rankType);
      for (const entry of response.body.data.entries) {
        const rewardText = JSON.stringify(entry.reward_preview);
        expect(rewardText).not.toContain("unique");
        expect(rewardText).not.toContain("限定法宝");
        expect(rewardText).not.toContain("古宝");
      }
    }
  });

  it("M4 配置类型和幂等键校验可用", async () => {
    const { token } = await createM4Player(app, prisma, "配置", "qi");
    for (const configType of ["tower", "boss", "sect", "rank"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .expect(200);

      expect(response.body.data.config_type).toBe(configType);
      expect(response.body.data.ruleset_version).toBeTruthy();
    }

    const response = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${token}`)
      .send({ tower_id: "tower_xuantie", action_type: "seal", count: 1 })
      .expect(400);

    expect(response.body.message).toContain("Idempotency-Key");
  });
});

async function createM4Player(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix.slice(0, 2)}${Date.now()
    .toString(36)
    .slice(-5)}${randomSuffix()}`.slice(0, 16);
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `m4_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m4_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function setFactionRoute(
  prisma: PrismaClient,
  playerId: string,
  route: "immortal" | "demon",
) {
  await prisma.$transaction([
    prisma.player.update({ where: { playerId }, data: { alignment: route } }),
    prisma.playerFactionState.upsert({
      where: { playerId },
      create: {
        playerId,
        eraId: "era_mvp_001",
        route,
        routeChosenAt: new Date(),
        configVersion: "faction_route_p1_v1",
        rewardConfigVersion: "reward_faction_p1_v1",
      },
      update: { route, routeChosenAt: new Date() },
    }),
  ]);
}

async function restoreDefaultEraTowerLifecycle(
  prisma: PrismaClient,
  towers: TowerState[],
  chronicles: EraChronicleRecord[],
) {
  await prisma.$transaction(async (tx) => {
    await tx.eraChronicleRecord.deleteMany({
      where: {
        eraId: defaultEraId,
        serverId: "default",
        chronicleType: { in: ["tower_lifecycle", "tower_finale"] },
      },
    });
    await Promise.all(
      towers.map((tower) =>
        tx.towerState.update({
          where: { towerStateId: tower.towerStateId },
          data: {
            integrity: tower.integrity,
            sealProgress: tower.sealProgress,
            breakProgress: tower.breakProgress,
            supplyProgress: tower.supplyProgress,
            riftPressure: tower.riftPressure,
            corruption: tower.corruption,
            phase: tower.phase,
            updatedAt: tower.updatedAt,
          },
        }),
      ),
    );
    await Promise.all(
      chronicles.map((chronicle) =>
        tx.eraChronicleRecord.create({
          data: {
            chronicleId: chronicle.chronicleId,
            eraId: chronicle.eraId,
            serverId: chronicle.serverId,
            chronicleType: chronicle.chronicleType,
            publicSummary: chronicle.publicSummary as Prisma.InputJsonValue,
            privateSummary:
              chronicle.privateSummary === null
                ? Prisma.DbNull
                : (chronicle.privateSummary as Prisma.InputJsonValue),
            relatedSnapshotId: chronicle.relatedSnapshotId,
            relatedSourceIds: chronicle.relatedSourceIds as Prisma.InputJsonValue,
            visibilityRule: chronicle.visibilityRule,
            storyConfigVersion: chronicle.storyConfigVersion,
            collectionConfigVersion: chronicle.collectionConfigVersion,
            createdAt: chronicle.createdAt,
          },
        }),
      ),
    );
  });
}

async function grantSpiritStone(prisma: PrismaClient, playerId: string, amount: number) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: BigInt(amount) } },
  });
}

async function createItem(
  prisma: PrismaClient,
  playerId: string,
  itemId: string,
  count: number,
  bindType: string,
  sourceType: string,
): Promise<string> {
  const itemInstanceId = `item_m4_${Date.now()}_${randomSuffix()}`;
  await prisma.playerItem.create({
    data: {
      itemInstanceId,
      playerId,
      itemId,
      count,
      bindType,
      sourceType,
    },
  });

  return itemInstanceId;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
