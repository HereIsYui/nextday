CREATE TABLE "action_settlement_record" (
    "settlement_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "action_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'online',
    "settlement_start_at" TIMESTAMP(3) NOT NULL,
    "settlement_end_at" TIMESTAMP(3) NOT NULL,
    "effective_minutes" INTEGER NOT NULL,
    "battle_count" INTEGER NOT NULL DEFAULT 0,
    "reward_snapshot" JSONB NOT NULL,
    "battle_ids" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_settlement_record_pkey" PRIMARY KEY ("settlement_id")
);

CREATE UNIQUE INDEX "action_settlement_record_idempotency_key_key"
ON "action_settlement_record"("idempotency_key");

CREATE UNIQUE INDEX "action_settlement_record_action_id_settlement_start_at_settlement_end_at_key"
ON "action_settlement_record"("action_id", "settlement_start_at", "settlement_end_at");

CREATE INDEX "action_settlement_record_player_id_created_at_idx"
ON "action_settlement_record"("player_id", "created_at");

CREATE INDEX "action_settlement_record_action_id_created_at_idx"
ON "action_settlement_record"("action_id", "created_at");

ALTER TABLE "action_settlement_record"
ADD CONSTRAINT "action_settlement_record_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "action_settlement_record"
ADD CONSTRAINT "action_settlement_record_action_id_fkey"
FOREIGN KEY ("action_id") REFERENCES "explore_action_record"("record_id") ON DELETE CASCADE ON UPDATE CASCADE;
