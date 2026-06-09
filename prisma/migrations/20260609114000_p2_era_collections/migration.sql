CREATE TABLE "era_collection_record" (
    "collection_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "collection_id" TEXT NOT NULL,
    "collection_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "rarity" TEXT NOT NULL DEFAULT 'common',
    "inherited" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "display_level" INTEGER NOT NULL DEFAULT 1,
    "display_slot" TEXT,
    "blessing_percent" INTEGER NOT NULL DEFAULT 0,
    "display_payload" JSONB NOT NULL,
    "inherit_rule" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "reward_boundary_version" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "era_collection_record_pkey" PRIMARY KEY ("collection_record_id")
);

CREATE UNIQUE INDEX "era_collection_record_player_id_collection_id_key" ON "era_collection_record"("player_id", "collection_id");
CREATE INDEX "era_collection_record_player_id_idx" ON "era_collection_record"("player_id");
CREATE INDEX "era_collection_record_era_id_idx" ON "era_collection_record"("era_id");
CREATE INDEX "era_collection_record_collection_type_idx" ON "era_collection_record"("collection_type");
CREATE INDEX "era_collection_record_source_type_idx" ON "era_collection_record"("source_type");
CREATE INDEX "era_collection_record_display_slot_idx" ON "era_collection_record"("display_slot");
CREATE INDEX "era_collection_record_inherited_idx" ON "era_collection_record"("inherited");

ALTER TABLE "era_collection_record" ADD CONSTRAINT "era_collection_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
