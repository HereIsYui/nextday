import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

const adminToken = "nextday-admin-dev";

describe("P1 合服 dry-run 与执行预留", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p1-merge-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || adminToken;

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

  it("合服配置只开放 dry-run，不开放真实执行", async () => {
    const config = await request(app.getHttpServer()).get("/api/config/merge_dry_run").expect(200);

    expect(config.body.data.payload.mode).toBe("dry_run_only");
    expect(config.body.data.payload.execution_rule).toContain("默认不可用");

    const rejected = await request(app.getHttpServer())
      .post("/api/admin/configs/publish")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_p1_merge_bad_config_${randomSuffix()}`)
      .send({
        config_type: "merge_dry_run",
        config_version: `merge_bad_${Date.now()}_${randomSuffix()}`,
        payload: {
          mode: "execute",
          execution_enabled: true,
          note: "错误配置",
        },
        operator: "p1_merge_test",
      })
      .expect(400);

    expect(rejected.body.message).toContain("不能开放真实执行");
  });

  it("dry-run 生成报告且不修改真实业务数据", async () => {
    const before = await countBusinessTables(prisma);
    const idempotencyKey = `idem_p1_merge_dry_${Date.now()}_${randomSuffix()}`;
    const body = {
      source_server_ids: ["mvp_alpha", "mvp_beta"],
      target_server_id: "mvp_merged",
      include_inactive: true,
      operator: "p1_merge_test",
      reason: "P1 合服演练验收",
    };

    const created = await request(app.getHttpServer())
      .post("/api/admin/merge/dry-run")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/admin/merge/dry-run")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);
    const after = await countBusinessTables(prisma);

    expect(repeated.body.data.report.report_id).toBe(created.body.data.report.report_id);
    expect(created.body.data.report.execute_status).toBe("reserved_only");
    expect(created.body.data.report.summary.data_mutation).toBe(false);
    expect(created.body.data.report.rollback_suggestion.dry_run_rollback).toContain("不修改");
    expect(after).toEqual(before);
  });

  it("报告可查询，执行接口只写预留审计且拒绝真实合服", async () => {
    const created = await request(app.getHttpServer())
      .post("/api/admin/merge/dry-run")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_p1_merge_query_${Date.now()}_${randomSuffix()}`)
      .send({
        source_server_ids: ["mvp_gamma"],
        target_server_id: "mvp_target",
        include_inactive: false,
        operator: "p1_merge_test",
      })
      .expect(201);
    const reportId = created.body.data.report.report_id as string;

    const report = await request(app.getHttpServer())
      .get(`/api/admin/merge/dry-run?report_id=${reportId}`)
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(report.body.data.report.report_id).toBe(reportId);
    expect(report.body.data.report.asset_inheritance_summary.rule).toContain("不迁移");

    const execution = await request(app.getHttpServer())
      .post("/api/admin/merge/execute")
      .set("X-Admin-Token", adminToken)
      .set("Idempotency-Key", `idem_p1_merge_execute_${Date.now()}_${randomSuffix()}`)
      .send({
        report_id: reportId,
        confirm_text: "DRY_RUN_ONLY",
        operator: "p1_merge_test",
        reason: "确认执行入口仍然只预留",
      })
      .expect(201);

    expect(execution.body.data.allowed).toBe(false);
    expect(execution.body.data.execution_status).toBe("reserved_only");
    expect(execution.body.data.message).toContain("真实合服执行未开放");

    const operations = await request(app.getHttpServer())
      .get("/api/admin/operations")
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(
      operations.body.data.operations.some(
        (operation: { action: string; target_id: string }) =>
          operation.action === "merge_execute_reserved" && operation.target_id === reportId,
      ),
    ).toBe(true);
  });
});

async function countBusinessTables(prisma: PrismaClient) {
  const [
    players,
    sects,
    rankSnapshots,
    rankEntries,
    purchaseOrders,
    gachaPityStates,
    eventRecords,
    monthlyCards,
  ] = await Promise.all([
    prisma.player.count(),
    prisma.sect.count(),
    prisma.rankSnapshot.count(),
    prisma.rankEntry.count(),
    prisma.purchaseOrder.count(),
    prisma.gachaPityState.count(),
    prisma.eventRecord.count(),
    prisma.monthlyCardState.count(),
  ]);

  return {
    players,
    sects,
    rankSnapshots,
    rankEntries,
    purchaseOrders,
    gachaPityStates,
    eventRecords,
    monthlyCards,
  };
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
