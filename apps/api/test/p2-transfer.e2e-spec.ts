import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const adminToken = "nextday-admin-dev";

describe("P2-5 转服 dry-run 与受限转服", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p2-transfer-secret";
    process.env.ADMIN_DEV_TOKEN = adminToken;

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

  it("transfer_rule 配置可读取，并拒绝自由转服和真实执行配置", async () => {
    const player = await createP2TransferPlayer(app, prisma, "配置");

    const config = await request(app.getHttpServer())
      .get("/api/config/transfer_rule")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);
    expect(config.body.data.config_type).toBe("transfer_rule");
    expect(config.body.data.payload.rule.free_transfer_enabled).toBe(false);
    expect(config.body.data.payload.rule.execute_enabled).toBe(false);
    expect(config.body.data.payload.rule.rank_cooldown_days).toBe(7);

    await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_p2_transfer_bad_config_${Date.now()}_${randomSuffix()}`)
      .send({
        config_type: "transfer_rule",
        config_version: `transfer_bad_${Date.now()}`,
        payload: {
          rule: {
            mode: "execute",
            free_transfer_enabled: true,
            execute_enabled: true,
            rank_cooldown_days: 0,
          },
        },
        operator: "admin_dev",
      })
      .expect(400);
  });

  it("玩家提交转服申请会生成个人报告，重复幂等不重复建单且不修改真实资产", async () => {
    const player = await createP2TransferPlayer(app, prisma, "玩家");
    await seedTransferAssets(prisma, player.playerId);
    const before = await readPlayerTransferSnapshot(prisma, player.playerId);
    const requestKey = `idem_p2_transfer_request_${Date.now()}_${randomSuffix()}`;
    const body = { target_server_id: "mvp_beta", reason: "想去朋友服" };

    const created = await request(app.getHttpServer())
      .post("/api/transfer/request")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", requestKey)
      .send(body)
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/transfer/request")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", requestKey)
      .send(body)
      .expect(201);

    expect(repeated.body.data.request.transfer_request_id).toBe(
      created.body.data.request.transfer_request_id,
    );
    expect(created.body.data.request.status).toBe("submitted");
    expect(created.body.data.request.dry_run_report.data_mutation).toBe(false);
    expect(created.body.data.request.asset_mapping_summary.wallet.jade_paid).toBe("120");
    expect(created.body.data.request.payment_asset_check_summary.gacha_pity_state_count).toBe(1);
    expect(created.body.data.request.rank_cooldown_until).toBeTruthy();
    expect(
      await prisma.transferRequestRecord.count({
        where: { playerId: player.playerId, targetServerId: "mvp_beta" },
      }),
    ).toBe(1);

    await request(app.getHttpServer())
      .post("/api/transfer/request")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", `idem_p2_transfer_second_${Date.now()}_${randomSuffix()}`)
      .send({ target_server_id: "mvp_gamma" })
      .expect(400);

    const after = await readPlayerTransferSnapshot(prisma, player.playerId);
    expect(after).toEqual(before);
  });

  it("最终战前 30 天目标服会拒绝转服申请", async () => {
    const player = await createP2TransferPlayer(app, prisma, "终战");

    await request(app.getHttpServer())
      .post("/api/transfer/request")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", `idem_p2_transfer_final_${Date.now()}_${randomSuffix()}`)
      .send({ target_server_id: "mvp_final_war_30d" })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/admin/transfer/dry-run")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_p2_transfer_final_admin_${Date.now()}_${randomSuffix()}`)
      .send({
        player_id: player.playerId,
        target_server_id: "mvp_beta",
        target_server_stage: "final_war_30d",
        operator: "admin_dev",
      })
      .expect(400);
  });

  it("玩家可取消未审核申请，取消后状态保留可追溯", async () => {
    const player = await createP2TransferPlayer(app, prisma, "取消");
    const created = await request(app.getHttpServer())
      .post("/api/transfer/request")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", `idem_p2_transfer_cancel_create_${Date.now()}_${randomSuffix()}`)
      .send({ target_server_id: "mvp_gamma" })
      .expect(201);

    const canceled = await request(app.getHttpServer())
      .post("/api/transfer/cancel")
      .set("Authorization", `Bearer ${player.token}`)
      .set("Idempotency-Key", `idem_p2_transfer_cancel_${Date.now()}_${randomSuffix()}`)
      .send({
        transfer_request_id: created.body.data.request.transfer_request_id,
        reason: "稍后再说",
      })
      .expect(201);

    expect(canceled.body.data.request.status).toBe("canceled");
    const status = await request(app.getHttpServer())
      .get("/api/transfer/status")
      .set("Authorization", `Bearer ${player.token}`)
      .expect(200);
    expect(status.body.data.current_request).toBeNull();
    expect(status.body.data.recent_requests[0].status).toBe("canceled");
  });

  it("后台 dry-run、审核和执行预留均幂等，并且不迁移玩家真实数据", async () => {
    const player = await createP2TransferPlayer(app, prisma, "后台");
    await seedTransferAssets(prisma, player.playerId);
    await createSect(app, prisma, player);
    const before = await readPlayerTransferSnapshot(prisma, player.playerId);
    const dryRunKey = `idem_p2_transfer_admin_dry_${Date.now()}_${randomSuffix()}`;
    const dryRunBody = {
      player_id: player.playerId,
      target_server_id: "mvp_beta",
      source_server_id: "server_mvp_001",
      operator: "admin_dev",
      reason: "人工演练",
    };
    const dryRun = await request(app.getHttpServer())
      .post("/api/admin/transfer/dry-run")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", dryRunKey)
      .send(dryRunBody)
      .expect(201);
    const repeatedDryRun = await request(app.getHttpServer())
      .post("/api/admin/transfer/dry-run")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", dryRunKey)
      .send(dryRunBody)
      .expect(201);

    expect(repeatedDryRun.body.data.request.transfer_request_id).toBe(
      dryRun.body.data.request.transfer_request_id,
    );
    expect(dryRun.body.data.request.status).toBe("draft");
    expect(dryRun.body.data.request.sect_cleanup_summary.cleanup_required).toBe(true);
    expect(dryRun.body.data.operation.action).toBe("transfer_dry_run");

    const requestId = dryRun.body.data.request.transfer_request_id as string;
    const reviewKey = `idem_p2_transfer_review_${Date.now()}_${randomSuffix()}`;
    const reviewed = await request(app.getHttpServer())
      .post("/api/admin/transfer/review")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", reviewKey)
      .send({
        transfer_request_id: requestId,
        decision: "approve",
        operator: "admin_dev",
        reason: "资产校验通过",
      })
      .expect(201);
    const repeatedReview = await request(app.getHttpServer())
      .post("/api/admin/transfer/review")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", reviewKey)
      .send({
        transfer_request_id: requestId,
        decision: "approve",
        operator: "admin_dev",
        reason: "资产校验通过",
      })
      .expect(201);

    expect(repeatedReview.body.data.request.status).toBe("pending_confirm");
    expect(reviewed.body.data.request.execute_status).toBe("reserved_only");
    expect(reviewed.body.data.request.rank_cooldown_until).toBeTruthy();

    const executeKey = `idem_p2_transfer_execute_${Date.now()}_${randomSuffix()}`;
    const executed = await request(app.getHttpServer())
      .post("/api/admin/transfer/execute")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", executeKey)
      .send({
        transfer_request_id: requestId,
        confirm_text: "确认转服执行预留",
        operator: "admin_dev",
        reason: "只写入审计",
      })
      .expect(201);
    const repeatedExecute = await request(app.getHttpServer())
      .post("/api/admin/transfer/execute")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", executeKey)
      .send({
        transfer_request_id: requestId,
        confirm_text: "确认转服执行预留",
        operator: "admin_dev",
        reason: "只写入审计",
      })
      .expect(201);

    expect(repeatedExecute.body.data.operation.operation_id).toBe(
      executed.body.data.operation.operation_id,
    );
    expect(executed.body.data.allowed).toBe(false);
    expect(executed.body.data.execution_status).toBe("reserved_only");
    expect(executed.body.data.request.status).toBe("pending_confirm");
    expect(executed.body.data.message).toContain("不迁移真实资产");

    const after = await readPlayerTransferSnapshot(prisma, player.playerId);
    expect(after).toEqual(before);
    const operationCount = await prisma.gmOperationLog.count({
      where: { targetId: requestId, targetType: "transfer_request_record" },
    });
    expect(operationCount).toBeGreaterThanOrEqual(3);
  });
});

async function createP2TransferPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  label: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p2_transfer_${label}_${nonce}`, nickname: `${label}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_transfer_create_${nonce}`)
    .send({ name: `${label}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { chapterId: 2, lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function seedTransferAssets(prisma: PrismaClient, playerId: string): Promise<void> {
  await prisma.playerWallet.update({
    where: { playerId },
    data: {
      jadePaid: { increment: 120n },
      jadeBound: { increment: 80n },
      spiritStone: { increment: 500n },
    },
  });
  await prisma.monthlyCardState.upsert({
    where: { playerId_cardType: { playerId, cardType: "small_monthly" } },
    create: {
      monthlyCardStateId: `monthly_state_${randomSuffix()}`,
      playerId,
      cardType: "small_monthly",
      activeUntil: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      remainingDays: 20,
      sourceOrderId: `order_seed_${randomSuffix()}`,
      configVersion: "monthly_card_m5_v1",
    },
    update: {
      activeUntil: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      remainingDays: 20,
    },
  });
  await prisma.gachaPityState.upsert({
    where: {
      playerId_eraId_poolType: {
        playerId,
        eraId: "era_mvp_001",
        poolType: "permanent",
      },
    },
    create: {
      gachaPityStateId: `pity_${randomSuffix()}`,
      playerId,
      eraId: "era_mvp_001",
      poolType: "permanent",
      pityCount: 8,
      totalDraws: 18,
      guaranteeAt: 50,
      gachaConfigVersion: "gacha_m5_v1",
    },
    update: { pityCount: 8, totalDraws: 18 },
  });
}

async function createSect(
  app: INestApplication,
  prisma: PrismaClient,
  player: { token: string; playerId: string },
): Promise<void> {
  await prisma.playerWallet.update({
    where: { playerId: player.playerId },
    data: { spiritStone: { increment: 1000n } },
  });
  await request(app.getHttpServer())
    .post("/api/multiplayer/sects/create")
    .set("Authorization", `Bearer ${player.token}`)
    .set("Idempotency-Key", `idem_p2_transfer_sect_${Date.now()}_${randomSuffix()}`)
    .send({ alignment: "neutral", name: `转服宗${randomSuffix()}`.slice(0, 18) })
    .expect(201);
}

async function readPlayerTransferSnapshot(prisma: PrismaClient, playerId: string) {
  const [player, wallet, itemCount, monthlyCount, pityCount] = await Promise.all([
    prisma.player.findUniqueOrThrow({
      where: { playerId },
      select: { currentLevel: true, currentRealm: true, sectId: true, status: true },
    }),
    prisma.playerWallet.findUniqueOrThrow({ where: { playerId } }),
    prisma.playerItem.count({ where: { playerId } }),
    prisma.monthlyCardState.count({ where: { playerId } }),
    prisma.gachaPityState.count({ where: { playerId } }),
  ]);

  return {
    player,
    wallet: {
      jadeBound: wallet.jadeBound.toString(),
      jadePaid: wallet.jadePaid.toString(),
      spiritStone: wallet.spiritStone.toString(),
    },
    itemCount,
    monthlyCount,
    pityCount,
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
