-- M6 行为风控：风险记录与延迟结算池
CREATE TABLE "behavior_risk_record" (
    "risk_record_id" TEXT NOT NULL,
    "account_id" TEXT,
    "player_id" TEXT,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "risk_domain" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "source_record_id" TEXT,
    "risk_status" TEXT NOT NULL,
    "risk_level" TEXT NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "rule_codes" JSONB NOT NULL,
    "decision_action" TEXT NOT NULL,
    "settlement_status" TEXT NOT NULL DEFAULT 'settled',
    "request_id" TEXT,
    "idempotency_key" TEXT,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "metadata" JSONB,
    "risk_ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_risk_record_pkey" PRIMARY KEY ("risk_record_id")
);

CREATE TABLE "delayed_settlement_record" (
    "settlement_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "source_record_id" TEXT,
    "risk_record_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'delayed',
    "amount_snapshot" JSONB NOT NULL,
    "review_action" TEXT,
    "review_reason" TEXT,
    "reviewer" TEXT,
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "risk_ruleset_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delayed_settlement_record_pkey" PRIMARY KEY ("settlement_record_id")
);

CREATE UNIQUE INDEX "delayed_settlement_record_idempotency_key_key" ON "delayed_settlement_record"("idempotency_key");

CREATE INDEX "behavior_risk_record_account_id_idx" ON "behavior_risk_record"("account_id");
CREATE INDEX "behavior_risk_record_player_id_idx" ON "behavior_risk_record"("player_id");
CREATE INDEX "behavior_risk_record_era_id_idx" ON "behavior_risk_record"("era_id");
CREATE INDEX "behavior_risk_record_risk_domain_action_type_idx" ON "behavior_risk_record"("risk_domain", "action_type");
CREATE INDEX "behavior_risk_record_risk_status_idx" ON "behavior_risk_record"("risk_status");
CREATE INDEX "behavior_risk_record_risk_level_idx" ON "behavior_risk_record"("risk_level");
CREATE INDEX "behavior_risk_record_target_type_target_id_idx" ON "behavior_risk_record"("target_type", "target_id");
CREATE INDEX "behavior_risk_record_source_record_id_idx" ON "behavior_risk_record"("source_record_id");
CREATE INDEX "behavior_risk_record_created_at_idx" ON "behavior_risk_record"("created_at");

CREATE INDEX "delayed_settlement_record_player_id_idx" ON "delayed_settlement_record"("player_id");
CREATE INDEX "delayed_settlement_record_era_id_idx" ON "delayed_settlement_record"("era_id");
CREATE INDEX "delayed_settlement_record_source_type_idx" ON "delayed_settlement_record"("source_type");
CREATE INDEX "delayed_settlement_record_source_record_id_idx" ON "delayed_settlement_record"("source_record_id");
CREATE INDEX "delayed_settlement_record_risk_record_id_idx" ON "delayed_settlement_record"("risk_record_id");
CREATE INDEX "delayed_settlement_record_status_idx" ON "delayed_settlement_record"("status");
CREATE INDEX "delayed_settlement_record_created_at_idx" ON "delayed_settlement_record"("created_at");

ALTER TABLE "behavior_risk_record" ADD CONSTRAINT "behavior_risk_record_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "behavior_risk_record" ADD CONSTRAINT "behavior_risk_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delayed_settlement_record" ADD CONSTRAINT "delayed_settlement_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delayed_settlement_record" ADD CONSTRAINT "delayed_settlement_record_risk_record_id_fkey" FOREIGN KEY ("risk_record_id") REFERENCES "behavior_risk_record"("risk_record_id") ON DELETE SET NULL ON UPDATE CASCADE;
