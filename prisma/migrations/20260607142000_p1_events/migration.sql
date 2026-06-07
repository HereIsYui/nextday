-- P1 异步活动实例
CREATE TABLE "event_instance" (
    "event_instance_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "server_id" TEXT NOT NULL DEFAULT 'default',
    "event_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "async_enabled" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "settlement_at" TIMESTAMP(3) NOT NULL,
    "event_config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_instance_pkey" PRIMARY KEY ("event_instance_id")
);

-- P1 玩家活动参与记录
CREATE TABLE "event_record" (
    "event_record_id" TEXT NOT NULL,
    "event_instance_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "period_key" TEXT NOT NULL,
    "province_id" TEXT,
    "sect_id" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target_progress" INTEGER NOT NULL,
    "contribution" BIGINT NOT NULL DEFAULT 0,
    "rank_score" BIGINT NOT NULL DEFAULT 0,
    "reward_state" TEXT NOT NULL DEFAULT 'unsettled',
    "event_config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_action_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "event_record_pkey" PRIMARY KEY ("event_record_id")
);

-- P1 活动奖励记录
CREATE TABLE "event_reward_record" (
    "reward_record_id" TEXT NOT NULL,
    "event_instance_id" TEXT NOT NULL,
    "event_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "reward_type" TEXT NOT NULL,
    "reward_summary" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "claim_idempotency_key" TEXT,
    "reward_config_version" TEXT NOT NULL,
    "risk_ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),

    CONSTRAINT "event_reward_record_pkey" PRIMARY KEY ("reward_record_id")
);

CREATE UNIQUE INDEX "event_instance_era_id_event_id_key" ON "event_instance"("era_id", "event_id");
CREATE INDEX "event_instance_event_id_idx" ON "event_instance"("event_id");
CREATE INDEX "event_instance_era_id_idx" ON "event_instance"("era_id");
CREATE INDEX "event_instance_event_type_idx" ON "event_instance"("event_type");
CREATE INDEX "event_instance_status_idx" ON "event_instance"("status");
CREATE INDEX "event_instance_starts_at_idx" ON "event_instance"("starts_at");
CREATE INDEX "event_instance_ends_at_idx" ON "event_instance"("ends_at");

CREATE UNIQUE INDEX "event_record_idempotency_key_key" ON "event_record"("idempotency_key");
CREATE UNIQUE INDEX "event_record_event_instance_id_player_id_period_key_key" ON "event_record"("event_instance_id", "player_id", "period_key");
CREATE INDEX "event_record_event_id_idx" ON "event_record"("event_id");
CREATE INDEX "event_record_player_id_idx" ON "event_record"("player_id");
CREATE INDEX "event_record_era_id_idx" ON "event_record"("era_id");
CREATE INDEX "event_record_period_key_idx" ON "event_record"("period_key");
CREATE INDEX "event_record_reward_state_idx" ON "event_record"("reward_state");
CREATE INDEX "event_record_created_at_idx" ON "event_record"("created_at");

CREATE UNIQUE INDEX "event_reward_record_claim_idempotency_key_key" ON "event_reward_record"("claim_idempotency_key");
CREATE INDEX "event_reward_record_event_instance_id_idx" ON "event_reward_record"("event_instance_id");
CREATE INDEX "event_reward_record_event_record_id_idx" ON "event_reward_record"("event_record_id");
CREATE INDEX "event_reward_record_player_id_idx" ON "event_reward_record"("player_id");
CREATE INDEX "event_reward_record_era_id_idx" ON "event_reward_record"("era_id");
CREATE INDEX "event_reward_record_reward_type_idx" ON "event_reward_record"("reward_type");
CREATE INDEX "event_reward_record_status_idx" ON "event_reward_record"("status");
CREATE INDEX "event_reward_record_created_at_idx" ON "event_reward_record"("created_at");

ALTER TABLE "event_record" ADD CONSTRAINT "event_record_event_instance_id_fkey" FOREIGN KEY ("event_instance_id") REFERENCES "event_instance"("event_instance_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_record" ADD CONSTRAINT "event_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_reward_record" ADD CONSTRAINT "event_reward_record_event_instance_id_fkey" FOREIGN KEY ("event_instance_id") REFERENCES "event_instance"("event_instance_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_reward_record" ADD CONSTRAINT "event_reward_record_event_record_id_fkey" FOREIGN KEY ("event_record_id") REFERENCES "event_record"("event_record_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_reward_record" ADD CONSTRAINT "event_reward_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
