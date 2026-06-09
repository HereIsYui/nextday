CREATE TABLE "story_scroll_record" (
    "scroll_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "scroll_id" TEXT NOT NULL,
    "chapter_id" INTEGER NOT NULL,
    "unlock_state" TEXT NOT NULL DEFAULT 'unlocked',
    "fragment_state" JSONB NOT NULL,
    "battle_refs" JSONB NOT NULL,
    "choice_summary" JSONB NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "story_config_version" TEXT NOT NULL,
    "story_ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_scroll_record_pkey" PRIMARY KEY ("scroll_record_id")
);

CREATE TABLE "era_chronicle_record" (
    "chronicle_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "server_id" TEXT NOT NULL DEFAULT 'default',
    "chronicle_type" TEXT NOT NULL,
    "public_summary" JSONB NOT NULL,
    "private_summary" JSONB,
    "related_snapshot_id" TEXT,
    "related_source_ids" JSONB NOT NULL,
    "visibility_rule" TEXT NOT NULL DEFAULT 'server',
    "story_config_version" TEXT NOT NULL,
    "collection_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "era_chronicle_record_pkey" PRIMARY KEY ("chronicle_id")
);

CREATE UNIQUE INDEX "story_scroll_record_player_id_era_id_scroll_id_key" ON "story_scroll_record"("player_id", "era_id", "scroll_id");
CREATE INDEX "story_scroll_record_player_id_idx" ON "story_scroll_record"("player_id");
CREATE INDEX "story_scroll_record_era_id_idx" ON "story_scroll_record"("era_id");
CREATE INDEX "story_scroll_record_scroll_id_idx" ON "story_scroll_record"("scroll_id");
CREATE INDEX "story_scroll_record_chapter_id_idx" ON "story_scroll_record"("chapter_id");
CREATE INDEX "story_scroll_record_source_type_source_id_idx" ON "story_scroll_record"("source_type", "source_id");
CREATE INDEX "story_scroll_record_updated_at_idx" ON "story_scroll_record"("updated_at");

CREATE UNIQUE INDEX "era_chronicle_record_era_id_server_id_chronicle_type_key" ON "era_chronicle_record"("era_id", "server_id", "chronicle_type");
CREATE INDEX "era_chronicle_record_era_id_idx" ON "era_chronicle_record"("era_id");
CREATE INDEX "era_chronicle_record_server_id_idx" ON "era_chronicle_record"("server_id");
CREATE INDEX "era_chronicle_record_chronicle_type_idx" ON "era_chronicle_record"("chronicle_type");
CREATE INDEX "era_chronicle_record_visibility_rule_idx" ON "era_chronicle_record"("visibility_rule");
CREATE INDEX "era_chronicle_record_created_at_idx" ON "era_chronicle_record"("created_at");

ALTER TABLE "story_scroll_record" ADD CONSTRAINT "story_scroll_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
