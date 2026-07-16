import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { WarMeritPeriodSnapshot } from "@nextday/shared";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("R5-01B 州战日结与周结快照", () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let token: string;
  let playerIds: string[] = [];
  let sectId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET ||= "r5-war-settlement-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = new PrismaClient();
    await prisma.$connect();

    const players = [
      await createPlayer(app, "榜首"),
      await createPlayer(app, "同门"),
      await createPlayer(app, "外州"),
    ];
    token = players[0].token;
    playerIds = players.map((item) => item.playerId);
    sectId = `r5_sect_${nonce()}`;
    await prisma.sect.create({
      data: {
        sectId,
        name: `战功宗${nonce()}`.slice(0, 16),
        createdByPlayerId: playerIds[0],
      },
    });
    await prisma.warMeritRecord.createMany({
      data: [
        meritRecord(playerIds[0], sectId, "yong", 30, "a"),
        meritRecord(playerIds[0], sectId, "yong", 40, "b"),
        meritRecord(playerIds[1], sectId, "yong", 40, "c"),
        meritRecord(playerIds[2], null, "ji", 50, "d"),
      ],
    });
  });

  afterAll(async () => {
    await prisma.warMeritRecord.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.rankSnapshot.deleteMany({
      where: {
        rankType: {
          in: ["daily_player", "weekly_player", "weekly_sect", "weekly_province"],
        },
      },
    });
    if (sectId) await prisma.sect.deleteMany({ where: { sectId } });
    await prisma.$disconnect();
    await app.close();
  });

  it("生成个人、宗门和州域周期榜，重复读取只刷新同一组快照", async () => {
    const walletBefore = await prisma.playerWallet.findUniqueOrThrow({
      where: { playerId: playerIds[0] },
    });
    const first = await request(app.getHttpServer())
      .get("/api/world/war-settlement")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(first.body.data.daily.entries[0]).toMatchObject({
      target_type: "player",
      target_id: playerIds[0],
      score: 70,
    });
    expect(first.body.data.daily.period_key).toBe(`day_${localDateKey(new Date())}`);
    const weekly = new Map<string, WarMeritPeriodSnapshot>(
      (first.body.data.weekly as WarMeritPeriodSnapshot[]).map((item) => [item.rank_type, item]),
    );
    expect(weekly.get("weekly_player")?.entries[0]).toMatchObject({
      target_id: playerIds[0],
      score: 70,
    });
    expect(weekly.get("weekly_sect")?.entries[0]).toMatchObject({
      target_id: sectId,
      score: 110,
    });
    expect(weekly.get("weekly_province")?.entries[0]).toMatchObject({
      target_id: "yong",
      score: 110,
    });

    await request(app.getHttpServer())
      .get("/api/world/war-settlement")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const snapshots = await prisma.rankSnapshot.findMany({
      where: {
        rankType: {
          in: ["daily_player", "weekly_player", "weekly_sect", "weekly_province"],
        },
      },
    });
    expect(snapshots).toHaveLength(4);
    const walletAfter = await prisma.playerWallet.findUniqueOrThrow({
      where: { playerId: playerIds[0] },
    });
    expect(walletAfter.spiritStone).toBe(walletBefore.spiritStone);
    expect(walletAfter.jadeBound).toBe(walletBefore.jadeBound);
    expect(walletAfter.jadePaid).toBe(walletBefore.jadePaid);
  });
});

function meritRecord(
  playerId: string,
  sectId: string | null,
  provinceId: string,
  merit: number,
  suffix: string,
) {
  const id = `${nonce()}_${suffix}`;
  return {
    recordId: `merit_${id}`,
    playerId,
    sectId,
    provinceId,
    sourceType: "strategic_control",
    sourceId: `source_${id}`,
    merit,
    result: "won",
    detailSnapshot: { summary: "测试战功" },
  };
}

async function createPlayer(app: INestApplication, prefix: string) {
  const key = nonce();
  const login = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `r5_settlement_${key}`, nickname: `${prefix}道友` })
    .expect(201);
  const token = login.body.data.token as string;
  const created = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_r5_settlement_${key}`)
    .send({ name: `${prefix}${key}`.slice(0, 16), route: "qi" })
    .expect(201);
  return { token, playerId: created.body.data.profile.player.player_id as string };
}

function nonce(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
