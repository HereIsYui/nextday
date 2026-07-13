ALTER TABLE "territory_garrison"
ADD COLUMN "preset_snapshot" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "city_army_preset" (
    "preset_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "city_id" TEXT NOT NULL,
    "preset_type" TEXT NOT NULL,
    "preset_name" TEXT NOT NULL,
    "commander_id" TEXT NOT NULL,
    "soldier_count" INTEGER NOT NULL,
    "formation" TEXT NOT NULL,
    "power" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_army_preset_pkey" PRIMARY KEY ("preset_id")
);

CREATE UNIQUE INDEX "city_army_preset_player_id_preset_type_key"
ON "city_army_preset"("player_id", "preset_type");
CREATE INDEX "city_army_preset_city_id_idx" ON "city_army_preset"("city_id");
CREATE INDEX "city_army_preset_player_id_idx" ON "city_army_preset"("player_id");

ALTER TABLE "city_army_preset"
ADD CONSTRAINT "city_army_preset_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "city_army_preset"
ADD CONSTRAINT "city_army_preset_city_id_fkey"
FOREIGN KEY ("city_id") REFERENCES "player_city"("city_id")
ON DELETE CASCADE ON UPDATE CASCADE;
