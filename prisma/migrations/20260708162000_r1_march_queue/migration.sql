CREATE TABLE "march_queue" (
    "march_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "source_city_id" TEXT NOT NULL,
    "source_tile_id" TEXT NOT NULL,
    "target_tile_id" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "commandery_id" TEXT NOT NULL,
    "march_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'marching',
    "team_snapshot" JSONB NOT NULL,
    "travel_seconds" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "arrives_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "march_queue_pkey" PRIMARY KEY ("march_id")
);

CREATE UNIQUE INDEX "march_queue_idempotency_key_key" ON "march_queue"("idempotency_key");
CREATE INDEX "march_queue_player_id_idx" ON "march_queue"("player_id");
CREATE INDEX "march_queue_era_id_idx" ON "march_queue"("era_id");
CREATE INDEX "march_queue_province_id_commandery_id_idx" ON "march_queue"("province_id", "commandery_id");
CREATE INDEX "march_queue_source_city_id_idx" ON "march_queue"("source_city_id");
CREATE INDEX "march_queue_target_tile_id_idx" ON "march_queue"("target_tile_id");
CREATE INDEX "march_queue_status_idx" ON "march_queue"("status");
CREATE INDEX "march_queue_arrives_at_idx" ON "march_queue"("arrives_at");
CREATE INDEX "march_queue_created_at_idx" ON "march_queue"("created_at");

ALTER TABLE "march_queue"
ADD CONSTRAINT "march_queue_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "march_queue"
ADD CONSTRAINT "march_queue_source_city_id_fkey"
FOREIGN KEY ("source_city_id") REFERENCES "player_city"("city_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
