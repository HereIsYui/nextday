-- 开发期地图改为区块购买制：清理旧占领产权与伪驻防数据。
DELETE FROM "territory_garrison"
WHERE "tile_id" IN (
    SELECT "tile_id"
    FROM "world_block_ownership"
    WHERE "source_type" = 'occupation' OR "ownership_type" = 'occupation'
);

DELETE FROM "world_block_ownership"
WHERE "source_type" = 'occupation' OR "ownership_type" = 'occupation';

-- 旧占领行军保留为清野记录，但不再具备产权结算能力。
UPDATE "march_queue"
SET "march_type" = 'clear_wild'
WHERE "march_type" = 'occupy';

DROP TABLE IF EXISTS "territory_occupation";
