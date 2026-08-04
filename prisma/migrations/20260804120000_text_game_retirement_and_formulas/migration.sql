-- 此迁移不可逆：先转移可映射的城池库存、待领取产出与药圃收成，再删除城池战略数据。
-- 粮草、道兵、建筑等级和占领地块不折现，仅在迁移审计中保留数量记录。
WITH city_inventory AS (
  SELECT
    "player_id",
    COALESCE(SUM(GREATEST(0, COALESCE(NULLIF("resource_snapshot" ->> 'spirit_stone', '')::BIGINT, 0))), 0)::BIGINT AS spirit_stone,
    COALESCE(SUM(GREATEST(0, COALESCE(NULLIF("resource_snapshot" ->> 'ore', '')::BIGINT, 0))), 0)::BIGINT AS ore,
    COALESCE(SUM(GREATEST(0, COALESCE(NULLIF("resource_snapshot" ->> 'wood', '')::BIGINT, 0))), 0)::BIGINT AS wood,
    COALESCE(SUM(GREATEST(0, COALESCE(NULLIF("resource_snapshot" ->> 'herb', '')::BIGINT, 0))), 0)::BIGINT AS herb,
    COALESCE(SUM(GREATEST(0, COALESCE(NULLIF("resource_snapshot" ->> 'grain', '')::BIGINT, 0))), 0)::BIGINT AS grain,
    COALESCE(SUM(GREATEST(0, COALESCE(NULLIF("resource_snapshot" ->> 'soldier', '')::BIGINT, 0))), 0)::BIGINT AS soldier
  FROM "player_city"
  GROUP BY "player_id"
),
garden_assets AS (
  SELECT
    "player_id",
    (COUNT(*) FILTER (WHERE "status" <> 'empty' AND "herb_id" IS NOT NULL) * 3)::BIGINT AS herb
  FROM "city_herb_garden_plot"
  GROUP BY "player_id"
),
territory_hourly AS (
  SELECT
    "player_id",
    COALESCE(SUM(CASE "terrain_type" WHEN 'plain' THEN 2 WHEN 'swamp' THEN 4 WHEN 'forest' THEN 3 WHEN 'mountain' THEN 7 WHEN 'desert' THEN 10 ELSE 0 END), 0)::BIGINT AS spirit_stone_hourly,
    COALESCE(SUM(CASE "terrain_type" WHEN 'plain' THEN 0 WHEN 'swamp' THEN 0 WHEN 'forest' THEN 0 WHEN 'mountain' THEN 16 WHEN 'desert' THEN 5 ELSE 0 END), 0)::BIGINT AS ore_hourly,
    COALESCE(SUM(CASE "terrain_type" WHEN 'plain' THEN 2 WHEN 'swamp' THEN 1 WHEN 'forest' THEN 14 WHEN 'mountain' THEN 1 WHEN 'desert' THEN 0 ELSE 0 END), 0)::BIGINT AS wood_hourly,
    COALESCE(SUM(CASE "terrain_type" WHEN 'plain' THEN 0 WHEN 'swamp' THEN 11 WHEN 'forest' THEN 5 WHEN 'mountain' THEN 0 WHEN 'desert' THEN 0 ELSE 0 END), 0)::BIGINT AS herb_hourly
  FROM "world_block_ownership"
  WHERE "status" = 'owned'
  GROUP BY "player_id"
),
warehouse_levels AS (
  SELECT
    "city_id",
    COALESCE(MAX(CASE WHEN "building_type" = 'warehouse' THEN "level" END), 1) AS warehouse_level
  FROM "city_building"
  GROUP BY "city_id"
),
main_city_context AS (
  SELECT
    city."player_id",
    LEAST(
      GREATEST(EXTRACT(EPOCH FROM CURRENT_TIMESTAMP - city."territory_collected_at")::BIGINT, 0),
      43200
    )::BIGINT AS elapsed_seconds,
    COALESCE(warehouse.warehouse_level, 1)::BIGINT AS warehouse_level,
    GREATEST(0, COALESCE(NULLIF(city."resource_snapshot" ->> 'spirit_stone', '')::BIGINT, 0))::BIGINT AS city_spirit_stone,
    GREATEST(0, COALESCE(NULLIF(city."resource_snapshot" ->> 'ore', '')::BIGINT, 0))::BIGINT AS city_ore,
    GREATEST(0, COALESCE(NULLIF(city."resource_snapshot" ->> 'wood', '')::BIGINT, 0))::BIGINT AS city_wood,
    GREATEST(0, COALESCE(NULLIF(city."resource_snapshot" ->> 'herb', '')::BIGINT, 0))::BIGINT AS city_herb
  FROM "player_city" AS city
  LEFT JOIN warehouse_levels AS warehouse ON warehouse."city_id" = city."city_id"
  WHERE city."city_type" = 'main'
),
pending_territory_assets AS (
  SELECT
    city."player_id",
    GREATEST(
      0::BIGINT,
      LEAST(
        FLOOR(COALESCE(hourly.spirit_stone_hourly, 0) * city.elapsed_seconds / 3600.0)::BIGINT,
        (3000 + city.warehouse_level * 2200)::BIGINT - city.city_spirit_stone
      )
    ) AS spirit_stone,
    GREATEST(
      0::BIGINT,
      LEAST(
        FLOOR(COALESCE(hourly.ore_hourly, 0) * city.elapsed_seconds / 3600.0)::BIGINT,
        (1800 + city.warehouse_level * 1500)::BIGINT - city.city_ore
      )
    ) AS ore,
    GREATEST(
      0::BIGINT,
      LEAST(
        FLOOR(COALESCE(hourly.wood_hourly, 0) * city.elapsed_seconds / 3600.0)::BIGINT,
        (2200 + city.warehouse_level * 1800)::BIGINT - city.city_wood
      )
    ) AS wood,
    GREATEST(
      0::BIGINT,
      LEAST(
        FLOOR(COALESCE(hourly.herb_hourly, 0) * city.elapsed_seconds / 3600.0)::BIGINT,
        (1400 + city.warehouse_level * 1200)::BIGINT - city.city_herb
      )
    ) AS herb
  FROM main_city_context AS city
  LEFT JOIN territory_hourly AS hourly ON hourly."player_id" = city."player_id"
),
retirement_player_ids AS (
  SELECT "player_id" FROM city_inventory
  UNION
  SELECT "player_id" FROM garden_assets
  UNION
  SELECT "player_id" FROM pending_territory_assets
),
retirement_assets AS (
  SELECT
    player_ids."player_id",
    COALESCE(inventory.spirit_stone, 0) AS city_spirit_stone,
    COALESCE(inventory.ore, 0) AS city_ore,
    COALESCE(inventory.wood, 0) AS city_wood,
    COALESCE(inventory.herb, 0) AS city_herb,
    COALESCE(inventory.grain, 0) AS unconverted_grain,
    COALESCE(inventory.soldier, 0) AS unconverted_soldier,
    COALESCE(territory.spirit_stone, 0) AS territory_spirit_stone,
    COALESCE(territory.ore, 0) AS territory_ore,
    COALESCE(territory.wood, 0) AS territory_wood,
    COALESCE(territory.herb, 0) AS territory_herb,
    COALESCE(garden.herb, 0) AS garden_herb
  FROM retirement_player_ids AS player_ids
  LEFT JOIN city_inventory AS inventory ON inventory."player_id" = player_ids."player_id"
  LEFT JOIN pending_territory_assets AS territory ON territory."player_id" = player_ids."player_id"
  LEFT JOIN garden_assets AS garden ON garden."player_id" = player_ids."player_id"
)
INSERT INTO "audit_log" (
  "audit_log_id", "account_id", "player_id", "action", "target_type", "target_id", "after_snapshot", "reason", "config_version", "created_at"
)
SELECT
  'audit_city_retirement_' || assets."player_id",
  player."account_id",
  player."player_id",
  'city_retirement_migration',
  'player',
  player."player_id",
  jsonb_build_object(
    'migration', '20260804120000_text_game_retirement_and_formulas',
    'transferred', jsonb_build_object(
      'spirit_stone', assets.city_spirit_stone + assets.territory_spirit_stone,
      'raw_iron', assets.city_ore + assets.territory_ore,
      'spirit_wood', assets.city_wood + assets.territory_wood,
      'low_herb', assets.city_herb + assets.territory_herb + assets.garden_herb
    ),
    'city_inventory', jsonb_build_object(
      'spirit_stone', assets.city_spirit_stone,
      'raw_iron', assets.city_ore,
      'spirit_wood', assets.city_wood,
      'low_herb', assets.city_herb
    ),
    'territory_pending', jsonb_build_object(
      'spirit_stone', assets.territory_spirit_stone,
      'raw_iron', assets.territory_ore,
      'spirit_wood', assets.territory_wood,
      'low_herb', assets.territory_herb
    ),
    'garden_harvest', jsonb_build_object('low_herb', assets.garden_herb),
    'not_converted', jsonb_build_object(
      'grain', assets.unconverted_grain,
      'soldier', assets.unconverted_soldier
    )
  ),
  '文字修行重构：返还城池库存、待领取领地产出与药圃收成；粮草和道兵不折现。',
  'text_game_v1',
  CURRENT_TIMESTAMP
FROM retirement_assets AS assets
JOIN "player" AS player ON player."player_id" = assets."player_id";

INSERT INTO "player_wallet" ("player_id", "spirit_stone", "updated_at")
SELECT
  "player_id",
  ("after_snapshot" -> 'transferred' ->> 'spirit_stone')::BIGINT,
  CURRENT_TIMESTAMP
FROM "audit_log"
WHERE "action" = 'city_retirement_migration'
  AND "config_version" = 'text_game_v1'
ON CONFLICT ("player_id") DO UPDATE
SET
  "spirit_stone" = "player_wallet"."spirit_stone" + EXCLUDED."spirit_stone",
  "updated_at" = EXCLUDED."updated_at";

INSERT INTO "player_item" (
  "item_instance_id", "player_id", "item_id", "count", "bind_type", "locked", "source_type", "metadata", "created_at", "updated_at"
)
SELECT
  'city_retirement_raw_iron_' || "player_id",
  "player_id",
  'raw_iron',
  ("after_snapshot" -> 'transferred' ->> 'raw_iron')::BIGINT,
  'bound',
  false,
  'city_retirement',
  jsonb_build_object('migration', '20260804120000_text_game_retirement_and_formulas'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "audit_log"
WHERE "action" = 'city_retirement_migration'
  AND "config_version" = 'text_game_v1'
  AND ("after_snapshot" -> 'transferred' ->> 'raw_iron')::BIGINT > 0;

INSERT INTO "player_item" (
  "item_instance_id", "player_id", "item_id", "count", "bind_type", "locked", "source_type", "metadata", "created_at", "updated_at"
)
SELECT
  'city_retirement_spirit_wood_' || "player_id",
  "player_id",
  'spirit_wood',
  ("after_snapshot" -> 'transferred' ->> 'spirit_wood')::BIGINT,
  'bound',
  false,
  'city_retirement',
  jsonb_build_object('migration', '20260804120000_text_game_retirement_and_formulas'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "audit_log"
WHERE "action" = 'city_retirement_migration'
  AND "config_version" = 'text_game_v1'
  AND ("after_snapshot" -> 'transferred' ->> 'spirit_wood')::BIGINT > 0;

INSERT INTO "player_item" (
  "item_instance_id", "player_id", "item_id", "count", "bind_type", "locked", "source_type", "metadata", "created_at", "updated_at"
)
SELECT
  'city_retirement_low_herb_' || "player_id",
  "player_id",
  'low_herb',
  ("after_snapshot" -> 'transferred' ->> 'low_herb')::BIGINT,
  'bound',
  false,
  'city_retirement',
  jsonb_build_object('migration', '20260804120000_text_game_retirement_and_formulas'),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "audit_log"
WHERE "action" = 'city_retirement_migration'
  AND "config_version" = 'text_game_v1'
  AND ("after_snapshot" -> 'transferred' ->> 'low_herb')::BIGINT > 0;

DROP TABLE "city_herb_garden_plot";
DROP TABLE "city_building";
DROP TABLE "city_army_preset";
DROP TABLE "world_block_clearance";
DROP TABLE "march_queue";
DROP TABLE "territory_garrison";
DROP TABLE "world_block_ownership";
DROP TABLE "siege_record";
DROP TABLE "strategic_control_record";
DROP TABLE "sect_rally_member";
DROP TABLE "sect_rally";
DROP TABLE "war_season_reward";
DROP TABLE "war_season_settlement";
DROP TABLE "world_cycle_reward";
DROP TABLE "world_cycle_settlement";
DROP TABLE "war_merit_record";
DROP TABLE "world_chronicle_event";
DROP TABLE "player_city";

ALTER TABLE "alchemy_record" ALTER COLUMN "recipe_id" DROP NOT NULL;
ALTER TABLE "alchemy_record" ADD COLUMN "formula_id" TEXT;
ALTER TABLE "alchemy_record" ADD COLUMN "composition_hash" TEXT;
CREATE INDEX "alchemy_record_formula_id_idx" ON "alchemy_record"("formula_id");
CREATE INDEX "alchemy_record_composition_hash_idx" ON "alchemy_record"("composition_hash");

ALTER TABLE "equipment_operation_record" ADD COLUMN "formula_id" TEXT;
ALTER TABLE "equipment_operation_record" ADD COLUMN "composition_hash" TEXT;
CREATE INDEX "equipment_operation_record_formula_id_idx" ON "equipment_operation_record"("formula_id");
CREATE INDEX "equipment_operation_record_composition_hash_idx" ON "equipment_operation_record"("composition_hash");

ALTER TABLE "explore_action_record" ADD COLUMN "explore_boost_percent" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "player_production_effect" (
  "effect_id" TEXT NOT NULL,
  "player_id" TEXT NOT NULL,
  "effect_type" TEXT NOT NULL,
  "effect_value" INTEGER NOT NULL,
  "remaining_uses" INTEGER NOT NULL DEFAULT 1,
  "source_item_id" TEXT,
  "source_formula_id" TEXT,
  "expires_at" TIMESTAMP(3),
  "consumed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "player_production_effect_pkey" PRIMARY KEY ("effect_id")
);
CREATE INDEX "player_production_effect_player_id_effect_type_consumed_at_idx" ON "player_production_effect"("player_id", "effect_type", "consumed_at");
CREATE INDEX "player_production_effect_expires_at_idx" ON "player_production_effect"("expires_at");
ALTER TABLE "player_production_effect" ADD CONSTRAINT "player_production_effect_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "production_formula" (
  "formula_id" TEXT NOT NULL,
  "player_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "composition_hash" TEXT NOT NULL,
  "material_snapshot" JSONB NOT NULL,
  "result_template_snapshot" JSONB NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "source_record_id" TEXT NOT NULL,
  "rule_version" TEXT NOT NULL,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "production_formula_pkey" PRIMARY KEY ("formula_id")
);
CREATE UNIQUE INDEX "production_formula_player_id_kind_composition_hash_key" ON "production_formula"("player_id", "kind", "composition_hash");
CREATE INDEX "production_formula_kind_visibility_published_at_idx" ON "production_formula"("kind", "visibility", "published_at");
CREATE INDEX "production_formula_player_id_kind_updated_at_idx" ON "production_formula"("player_id", "kind", "updated_at");
ALTER TABLE "production_formula" ADD CONSTRAINT "production_formula_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE CASCADE ON UPDATE CASCADE;
