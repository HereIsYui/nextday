CREATE TABLE "explore_action_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT NOT NULL,
    "province_name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "seconds_per_explore" INTEGER NOT NULL,
    "total_seconds" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completes_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "reward_snapshot" JSONB,
    "battle_snapshot" JSONB,
    "experience_snapshot" JSONB,
    "completed_task_ids" JSONB,
    "action_state_snapshot" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "config_version" TEXT NOT NULL DEFAULT 'm2_core_loop_v2',
    "ruleset_version" TEXT NOT NULL DEFAULT 'ruleset_p1_6_v1',
    "reward_config_version" TEXT NOT NULL DEFAULT 'reward_p1_6_v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explore_action_record_pkey" PRIMARY KEY ("record_id")
);

CREATE UNIQUE INDEX "explore_action_record_idempotency_key_key" ON "explore_action_record"("idempotency_key");
CREATE INDEX "explore_action_record_player_id_idx" ON "explore_action_record"("player_id");
CREATE INDEX "explore_action_record_era_id_province_id_idx" ON "explore_action_record"("era_id", "province_id");
CREATE INDEX "explore_action_record_status_idx" ON "explore_action_record"("status");
CREATE INDEX "explore_action_record_completes_at_idx" ON "explore_action_record"("completes_at");
CREATE INDEX "explore_action_record_created_at_idx" ON "explore_action_record"("created_at");

ALTER TABLE "explore_action_record" ADD CONSTRAINT "explore_action_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
