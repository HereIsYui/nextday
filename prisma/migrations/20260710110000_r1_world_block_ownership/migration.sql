CREATE TABLE "world_block_ownership" (
    "ownership_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "tile_id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "commandery_id" TEXT NOT NULL,
    "terrain_type" TEXT NOT NULL,
    "ownership_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'owned',
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "purchase_cost" BIGINT NOT NULL DEFAULT 0,
    "idempotency_key" TEXT,
    "config_version" TEXT NOT NULL,
    "owned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_block_ownership_pkey" PRIMARY KEY ("ownership_id")
);

CREATE UNIQUE INDEX "world_block_ownership_idempotency_key_key" ON "world_block_ownership"("idempotency_key");
CREATE UNIQUE INDEX "world_block_ownership_era_id_tile_id_key" ON "world_block_ownership"("era_id", "tile_id");
CREATE INDEX "world_block_ownership_player_id_idx" ON "world_block_ownership"("player_id");
CREATE INDEX "world_block_ownership_era_id_idx" ON "world_block_ownership"("era_id");
CREATE INDEX "world_block_ownership_province_id_commandery_id_idx" ON "world_block_ownership"("province_id", "commandery_id");
CREATE INDEX "world_block_ownership_terrain_type_idx" ON "world_block_ownership"("terrain_type");
CREATE INDEX "world_block_ownership_ownership_type_idx" ON "world_block_ownership"("ownership_type");
CREATE INDEX "world_block_ownership_status_idx" ON "world_block_ownership"("status");
CREATE INDEX "world_block_ownership_owned_at_idx" ON "world_block_ownership"("owned_at");

ALTER TABLE "world_block_ownership"
ADD CONSTRAINT "world_block_ownership_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE CASCADE ON UPDATE CASCADE;
