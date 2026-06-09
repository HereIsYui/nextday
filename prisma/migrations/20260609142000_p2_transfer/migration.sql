-- P2 受限转服申请与个人影响报告。只生成报告、审核和执行预留，不默认迁移真实资产。
CREATE TABLE "transfer_request_record" (
    "transfer_request_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "source_server_id" TEXT NOT NULL,
    "target_server_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "dry_run_report" JSONB NOT NULL,
    "asset_mapping_summary" JSONB,
    "rank_cooldown_until" TIMESTAMP(3),
    "sect_cleanup_summary" JSONB,
    "payment_asset_check_summary" JSONB,
    "risk_summary" JSONB,
    "review_operator_id" TEXT,
    "review_reason" TEXT,
    "execute_status" TEXT NOT NULL DEFAULT 'dry_run_only',
    "idempotency_key" TEXT,
    "transfer_config_version" TEXT NOT NULL,
    "risk_ruleset_version" TEXT NOT NULL,
    "settlement_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),

    CONSTRAINT "transfer_request_record_pkey" PRIMARY KEY ("transfer_request_id")
);

CREATE UNIQUE INDEX "transfer_request_record_idempotency_key_key" ON "transfer_request_record"("idempotency_key");
CREATE INDEX "transfer_request_record_player_id_idx" ON "transfer_request_record"("player_id");
CREATE INDEX "transfer_request_record_account_id_idx" ON "transfer_request_record"("account_id");
CREATE INDEX "transfer_request_record_source_server_id_idx" ON "transfer_request_record"("source_server_id");
CREATE INDEX "transfer_request_record_target_server_id_idx" ON "transfer_request_record"("target_server_id");
CREATE INDEX "transfer_request_record_era_id_idx" ON "transfer_request_record"("era_id");
CREATE INDEX "transfer_request_record_status_idx" ON "transfer_request_record"("status");
CREATE INDEX "transfer_request_record_execute_status_idx" ON "transfer_request_record"("execute_status");
CREATE INDEX "transfer_request_record_rank_cooldown_until_idx" ON "transfer_request_record"("rank_cooldown_until");
CREATE INDEX "transfer_request_record_review_operator_id_idx" ON "transfer_request_record"("review_operator_id");
CREATE INDEX "transfer_request_record_created_at_idx" ON "transfer_request_record"("created_at");
CREATE INDEX "transfer_request_record_reviewed_at_idx" ON "transfer_request_record"("reviewed_at");
CREATE INDEX "transfer_request_record_executed_at_idx" ON "transfer_request_record"("executed_at");
CREATE INDEX "transfer_request_record_player_id_status_created_at_idx" ON "transfer_request_record"("player_id", "status", "created_at");
CREATE INDEX "transfer_request_record_target_server_id_status_idx" ON "transfer_request_record"("target_server_id", "status");

ALTER TABLE "transfer_request_record" ADD CONSTRAINT "transfer_request_record_player_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transfer_request_record" ADD CONSTRAINT "transfer_request_record_account_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;
