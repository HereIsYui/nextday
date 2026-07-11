ALTER TABLE "player_city"
ADD COLUMN "territory_collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "city_building" (
    "building_id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "building_type" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "target_level" INTEGER,
    "upgrade_started_at" TIMESTAMP(3),
    "upgrade_ends_at" TIMESTAMP(3),
    "cost_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_building_pkey" PRIMARY KEY ("building_id")
);

CREATE UNIQUE INDEX "city_building_city_id_building_type_key"
ON "city_building"("city_id", "building_type");

CREATE INDEX "city_building_city_id_idx" ON "city_building"("city_id");
CREATE INDEX "city_building_status_idx" ON "city_building"("status");
CREATE INDEX "city_building_upgrade_ends_at_idx" ON "city_building"("upgrade_ends_at");

ALTER TABLE "city_building"
ADD CONSTRAINT "city_building_city_id_fkey"
FOREIGN KEY ("city_id") REFERENCES "player_city"("city_id")
ON DELETE CASCADE ON UPDATE CASCADE;
