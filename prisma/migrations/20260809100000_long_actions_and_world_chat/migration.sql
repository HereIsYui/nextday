ALTER TABLE "player_action_state"
ADD COLUMN "active_action_type" TEXT,
ADD COLUMN "active_action_id" TEXT,
ADD COLUMN "active_action_province_id" TEXT,
ADD COLUMN "active_action_started_at" TIMESTAMP(3),
ADD COLUMN "active_action_ended_at" TIMESTAMP(3),
ADD COLUMN "active_action_reward_snapshot" JSONB;

ALTER TABLE "explore_action_record"
ADD COLUMN "action_mode" TEXT NOT NULL DEFAULT 'timed';

CREATE TABLE "world_chat_message" (
  "message_id" TEXT NOT NULL,
  "player_id" TEXT NOT NULL,
  "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
  "server_id" TEXT NOT NULL DEFAULT 'default',
  "map_id" TEXT NOT NULL,
  "player_name" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "item_share" JSONB,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "world_chat_message_pkey" PRIMARY KEY ("message_id")
);

CREATE UNIQUE INDEX "world_chat_message_idempotency_key_key"
ON "world_chat_message"("idempotency_key");
CREATE INDEX "world_chat_message_server_id_map_id_created_at_idx"
ON "world_chat_message"("server_id", "map_id", "created_at");
CREATE INDEX "world_chat_message_player_id_created_at_idx"
ON "world_chat_message"("player_id", "created_at");

ALTER TABLE "world_chat_message"
ADD CONSTRAINT "world_chat_message_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE CASCADE ON UPDATE CASCADE;
