-- P1 合服 dry-run 报告。只生成影响报告，不修改真实业务数据。
CREATE TABLE "merge_dry_run_report" (
    "report_id" TEXT NOT NULL,
    "source_server_ids" JSONB NOT NULL,
    "target_server_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'generated',
    "summary" JSONB NOT NULL,
    "conflict_summary" JSONB NOT NULL,
    "asset_inheritance_summary" JSONB NOT NULL,
    "rank_freeze_summary" JSONB NOT NULL,
    "sect_conflict_summary" JSONB NOT NULL,
    "compensation_suggestion" JSONB NOT NULL,
    "risk_summary" JSONB NOT NULL,
    "rollback_suggestion" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL,
    "execute_status" TEXT NOT NULL DEFAULT 'reserved_only',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merge_dry_run_report_pkey" PRIMARY KEY ("report_id")
);

CREATE UNIQUE INDEX "merge_dry_run_report_idempotency_key_key" ON "merge_dry_run_report"("idempotency_key");
CREATE INDEX "merge_dry_run_report_target_server_id_idx" ON "merge_dry_run_report"("target_server_id");
CREATE INDEX "merge_dry_run_report_status_idx" ON "merge_dry_run_report"("status");
CREATE INDEX "merge_dry_run_report_execute_status_idx" ON "merge_dry_run_report"("execute_status");
CREATE INDEX "merge_dry_run_report_created_at_idx" ON "merge_dry_run_report"("created_at");
