CREATE TABLE "territory_occupation" (
    "occupation_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "source_march_id" TEXT NOT NULL,
    "tile_id" TEXT NOT NULL,
    "node_id" TEXT,
    "province_id" TEXT NOT NULL,
    "commandery_id" TEXT NOT NULL,
    "occupation_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'occupied',
    "production_snapshot" JSONB NOT NULL,
    "defense_snapshot" JSONB NOT NULL,
    "occupied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "idempotency_key" TEXT,
    "config_version" TEXT NOT NULL,

    CONSTRAINT "territory_occupation_pkey" PRIMARY KEY ("occupation_id")
);

CREATE UNIQUE INDEX "territory_occupation_source_march_id_key" ON "territory_occupation"("source_march_id");
CREATE UNIQUE INDEX "territory_occupation_idempotency_key_key" ON "territory_occupation"("idempotency_key");
CREATE INDEX "territory_occupation_player_id_idx" ON "territory_occupation"("player_id");
CREATE UNIQUE INDEX "territory_occupation_player_id_tile_id_key" ON "territory_occupation"("player_id", "tile_id");
CREATE INDEX "territory_occupation_era_id_idx" ON "territory_occupation"("era_id");
CREATE INDEX "territory_occupation_province_id_commandery_id_idx" ON "territory_occupation"("province_id", "commandery_id");
CREATE INDEX "territory_occupation_occupation_type_idx" ON "territory_occupation"("occupation_type");
CREATE INDEX "territory_occupation_status_idx" ON "territory_occupation"("status");
CREATE INDEX "territory_occupation_occupied_at_idx" ON "territory_occupation"("occupied_at");

ALTER TABLE "territory_occupation"
ADD CONSTRAINT "territory_occupation_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "territory_occupation"
ADD CONSTRAINT "territory_occupation_source_march_id_fkey"
FOREIGN KEY ("source_march_id") REFERENCES "march_queue"("march_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
