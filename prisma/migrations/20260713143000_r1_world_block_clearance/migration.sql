-- 清野结果按玩家记录，只解锁该玩家的购买资格，不改变区块产权。
CREATE TABLE "world_block_clearance" (
    "clearance_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "source_march_id" TEXT NOT NULL,
    "tile_id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "commandery_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "team_power" INTEGER NOT NULL,
    "enemy_power" INTEGER NOT NULL,
    "battle_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "config_version" TEXT NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_block_clearance_pkey" PRIMARY KEY ("clearance_id")
);

CREATE UNIQUE INDEX "world_block_clearance_source_march_id_key"
ON "world_block_clearance"("source_march_id");
CREATE UNIQUE INDEX "world_block_clearance_idempotency_key_key"
ON "world_block_clearance"("idempotency_key");
CREATE INDEX "world_block_clearance_player_id_tile_id_status_idx"
ON "world_block_clearance"("player_id", "tile_id", "status");
CREATE INDEX "world_block_clearance_era_id_tile_id_status_idx"
ON "world_block_clearance"("era_id", "tile_id", "status");
CREATE INDEX "world_block_clearance_province_id_commandery_id_idx"
ON "world_block_clearance"("province_id", "commandery_id");
CREATE INDEX "world_block_clearance_resolved_at_idx"
ON "world_block_clearance"("resolved_at");

ALTER TABLE "world_block_clearance"
ADD CONSTRAINT "world_block_clearance_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "world_block_clearance"
ADD CONSTRAINT "world_block_clearance_source_march_id_fkey"
FOREIGN KEY ("source_march_id") REFERENCES "march_queue"("march_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
