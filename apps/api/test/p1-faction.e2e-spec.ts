import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P1 仙魔散修路线系统", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-faction-secret";
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

  it("未解锁玩家可查看路线预告，但不能正式选择", async () => {
    const { token } = await createFactionPlayer(app, prisma, "未开", "qi");

    const routes = await request(app.getHttpServer())
      .get("/api/factions/routes")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(routes.body.data.state.unlocked).toBe(false);
    expect(routes.body.data.state.unlock_hint).toContain("化神");
    expect(routes.body.data.routes.map((route: { route_id: string }) => route.route_id)).toEqual([
      "immortal",
      "demon",
      "wanderer",
    ]);

    const rejected = await request(app.getHttpServer())
      .post("/api/factions/choose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_locked_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "immortal" })
      .expect(400);

    expect(rejected.body.message).toContain("仙魔路线需");
  });

  it("化神或第五章后可选择路线，重复幂等键不重复创建记录", async () => {
    const { token, playerId } = await createUnlockedFactionPlayer(app, prisma, "成仙", "qi");
    const idempotencyKey = `idem_p1_faction_choose_${Date.now()}_${randomSuffix()}`;

    const first = await request(app.getHttpServer())
      .post("/api/factions/choose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ route_id: "immortal" })
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/factions/choose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ route_id: "immortal" })
      .expect(201);

    expect(first.body.data.state.route).toBe("immortal");
    expect(first.body.data.state.title_name).toBe("云阙真君");
    expect(repeated.body.data.record_id).toBe(first.body.data.record_id);
    expect(await prisma.factionTransferRecord.count({ where: { playerId, idempotencyKey } })).toBe(
      1,
    );
    expect((await prisma.player.findUniqueOrThrow({ where: { playerId } })).alignment).toBe(
      "immortal",
    );
  });

  it("已选择路线后不能再次走初选流程", async () => {
    const { token } = await createUnlockedFactionPlayer(app, prisma, "复选", "body");
    await request(app.getHttpServer())
      .post("/api/factions/choose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_once_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "demon" })
      .expect(201);

    const rejected = await request(app.getHttpServer())
      .post("/api/factions/choose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_twice_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "wanderer" })
      .expect(400);

    expect(rejected.body.message).toContain("已选择仙魔路线");
  });

  it("转道需要正确任务、扣灵石、清声望并设置 14 天冷却", async () => {
    const { token, playerId } = await createUnlockedFactionPlayer(app, prisma, "转道", "qi");
    await grantSpiritStone(prisma, playerId, 3000n);
    await request(app.getHttpServer())
      .post("/api/factions/choose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_transfer_choose_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "immortal" })
      .expect(201);

    const wrongTask = await request(app.getHttpServer())
      .post("/api/factions/transfer")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_wrong_task_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "demon", task_id: "wrong_task" })
      .expect(400);
    expect(wrongTask.body.message).toContain("任务不匹配");

    const beforeWallet = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });
    const transferred = await request(app.getHttpServer())
      .post("/api/factions/transfer")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_transfer_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "demon", task_id: "transfer_demon_oath" })
      .expect(201);
    const afterWallet = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });

    expect(transferred.body.data.state.route).toBe("demon");
    expect(transferred.body.data.state.transfer_cooldown_until).toBeTruthy();
    expect(transferred.body.data.state.reputation.immortal).toBeLessThan(120);
    expect(afterWallet.spiritStone).toBe(beforeWallet.spiritStone - 500n);

    const cooling = await request(app.getHttpServer())
      .post("/api/factions/transfer")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_transfer_cooling_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "wanderer", task_id: "transfer_wanderer_oath" })
      .expect(400);
    expect(cooling.body.message).toContain("转道冷却中");
  });

  it("宗门立场冲突会返回限制提示", async () => {
    const { token, playerId } = await createUnlockedFactionPlayer(app, prisma, "冲突", "qi");
    await createSectForPlayer(prisma, playerId, "neutral");

    const chosen = await request(app.getHttpServer())
      .post("/api/factions/choose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p1_faction_conflict_${Date.now()}_${randomSuffix()}`)
      .send({ route_id: "immortal" })
      .expect(201);

    expect(chosen.body.data.state.sect_conflict).toBe(true);
    expect(chosen.body.data.state.sect_conflict_hint).toContain("旁观者视角");

    const reputation = await request(app.getHttpServer())
      .get("/api/factions/reputation")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(reputation.body.data.state.sect_alignment).toBe("neutral");
    expect(reputation.body.data.state.sect_conflict).toBe(true);
  });

  it("配置和后台发布校验会拒绝付费、限定、唯一战力和倍率奖励", async () => {
    const config = await request(app.getHttpServer()).get("/api/config/faction_route").expect(200);
    expect(config.body.data.config_type).toBe("faction_route");
    expect(config.body.data.payload.routes).toHaveLength(3);
    expect(JSON.stringify(config.body.data.payload)).not.toContain("jade_paid");
    expect(JSON.stringify(config.body.data.payload)).not.toContain("reward_multiplier");

    const rejected = await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", "nextday-admin-dev")
      .set("Idempotency-Key", `idem_p1_faction_bad_config_${Date.now()}_${randomSuffix()}`)
      .send({
        config_type: "faction_route",
        config_version: `faction_bad_${Date.now()}`,
        payload: {
          routes: [
            { route_id: "immortal", rewards: { jade_paid: "1" } },
            { route_id: "demon", rewards: { ancient_treasure: "taoyi_danding" } },
            { route_id: "wanderer", reward_multiplier: 2 },
          ],
        },
      })
      .expect(400);

    expect(rejected.body.message).toContain("阵营路线配置不能包含");
  });
});

async function createUnlockedFactionPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const player = await createFactionPlayer(app, prisma, namePrefix, route);
  await prisma.player.update({
    where: { playerId: player.playerId },
    data: { currentRealm: 5, currentLevel: 45 },
  });
  await prisma.playerProgress.update({
    where: { playerId: player.playerId },
    data: { chapterId: 5 },
  });

  return player;
}

async function createFactionPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const playerName = `${namePrefix}${Date.now().toString(36).slice(-5)}${randomSuffix()}`.slice(
    0,
    16,
  );
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p1_faction_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p1_faction_create_${nonce}`)
    .send({ name: playerName, route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await request(app.getHttpServer())
    .get("/api/game/overview")
    .set("Authorization", `Bearer ${token}`)
    .expect(200);

  return { token, playerId };
}

async function grantSpiritStone(prisma: PrismaClient, playerId: string, amount: bigint) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: amount } },
  });
}

async function createSectForPlayer(
  prisma: PrismaClient,
  playerId: string,
  alignment: "immortal" | "demon" | "neutral",
) {
  const sectId = `sect_p1_faction_${Date.now()}_${randomSuffix()}`;
  await prisma.sect.create({
    data: {
      sectId,
      name: `试道宗${randomSuffix()}`,
      alignment,
      createdByPlayerId: playerId,
    },
  });
  await prisma.sectMember.create({
    data: {
      sectMemberId: `sect_member_p1_faction_${Date.now()}_${randomSuffix()}`,
      sectId,
      playerId,
      role: "leader",
    },
  });
  await prisma.player.update({
    where: { playerId },
    data: { sectId },
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
