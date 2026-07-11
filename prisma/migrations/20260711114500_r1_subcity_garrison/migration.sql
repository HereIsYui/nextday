CREATE TABLE "territory_garrison" (
    "garrison_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "tile_id" TEXT NOT NULL,
    "source_city_id" TEXT NOT NULL,
    "soldier_count" INTEGER NOT NULL,
    "defense_power" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "territory_garrison_pkey" PRIMARY KEY ("garrison_id")
);

CREATE UNIQUE INDEX "territory_garrison_era_id_tile_id_key"
ON "territory_garrison"("era_id", "tile_id");
CREATE INDEX "territory_garrison_player_id_idx" ON "territory_garrison"("player_id");
CREATE INDEX "territory_garrison_source_city_id_idx" ON "territory_garrison"("source_city_id");

ALTER TABLE "territory_garrison"
ADD CONSTRAINT "territory_garrison_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
