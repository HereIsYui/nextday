CREATE TABLE "player_city" (
    "city_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "city_type" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "commandery_id" TEXT NOT NULL,
    "tile_id" TEXT NOT NULL,
    "city_name" TEXT NOT NULL,
    "city_level" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'protected',
    "protection_until" TIMESTAMP(3),
    "owner_sect_id" TEXT,
    "defense_snapshot" JSONB NOT NULL,
    "resource_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_city_pkey" PRIMARY KEY ("city_id")
);

CREATE UNIQUE INDEX "player_city_tile_id_key" ON "player_city"("tile_id");
CREATE INDEX "player_city_player_id_idx" ON "player_city"("player_id");
CREATE INDEX "player_city_era_id_idx" ON "player_city"("era_id");
CREATE INDEX "player_city_city_type_idx" ON "player_city"("city_type");
CREATE INDEX "player_city_province_id_idx" ON "player_city"("province_id");
CREATE INDEX "player_city_commandery_id_idx" ON "player_city"("commandery_id");
CREATE INDEX "player_city_status_idx" ON "player_city"("status");
CREATE INDEX "player_city_protection_until_idx" ON "player_city"("protection_until");

ALTER TABLE "player_city"
ADD CONSTRAINT "player_city_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
