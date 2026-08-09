ALTER TABLE "player_action_state"
ADD COLUMN "active_action_last_active_at" TIMESTAMP(3),
ADD COLUMN "active_action_settled_until" TIMESTAMP(3),
ADD COLUMN "active_action_offline_snapshot" JSONB,
ADD COLUMN "active_action_offline_snapshot_at" TIMESTAMP(3);

ALTER TABLE "explore_action_record"
ADD COLUMN "settled_minutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "settled_battle_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_settled_at" TIMESTAMP(3),
ADD COLUMN "last_active_at" TIMESTAMP(3),
ADD COLUMN "offline_snapshot" JSONB,
ADD COLUMN "offline_snapshot_at" TIMESTAMP(3),
ADD COLUMN "offline_snapshot_claimed_at" TIMESTAMP(3);

CREATE INDEX "explore_action_record_last_settled_at_idx"
ON "explore_action_record"("last_settled_at");

CREATE INDEX "explore_action_record_last_active_at_idx"
ON "explore_action_record"("last_active_at");
