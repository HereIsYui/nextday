CREATE TABLE "explore_event_record" (
    "event_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "explore_record_id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "province_name" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "choices" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "selected_choice_id" TEXT,
    "reward_snapshot" JSONB,
    "experience_snapshot" JSONB,
    "resolved_idempotency_key" TEXT,
    "config_version" TEXT NOT NULL DEFAULT 'p1_7_explore_event_v1',
    "ruleset_version" TEXT NOT NULL DEFAULT 'ruleset_p1_7_v1',
    "reward_config_version" TEXT NOT NULL DEFAULT 'reward_p1_7_v1',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "explore_event_record_pkey" PRIMARY KEY ("event_id")
);

CREATE TABLE "player_journal_entry" (
    "journal_entry_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "delta_summary" JSONB NOT NULL,
    "tags" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "experience_snapshot" JSONB,
    "config_version" TEXT NOT NULL DEFAULT 'p1_7_journal_v1',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_journal_entry_pkey" PRIMARY KEY ("journal_entry_id")
);

CREATE UNIQUE INDEX "explore_event_record_explore_record_id_key" ON "explore_event_record"("explore_record_id");
CREATE UNIQUE INDEX "explore_event_record_resolved_idempotency_key_key" ON "explore_event_record"("resolved_idempotency_key");
CREATE INDEX "explore_event_record_player_id_idx" ON "explore_event_record"("player_id");
CREATE INDEX "explore_event_record_era_id_province_id_idx" ON "explore_event_record"("era_id", "province_id");
CREATE INDEX "explore_event_record_status_idx" ON "explore_event_record"("status");
CREATE INDEX "explore_event_record_event_type_idx" ON "explore_event_record"("event_type");
CREATE INDEX "explore_event_record_created_at_idx" ON "explore_event_record"("created_at");

CREATE INDEX "player_journal_entry_player_id_idx" ON "player_journal_entry"("player_id");
CREATE INDEX "player_journal_entry_era_id_idx" ON "player_journal_entry"("era_id");
CREATE INDEX "player_journal_entry_source_type_source_id_idx" ON "player_journal_entry"("source_type", "source_id");
CREATE INDEX "player_journal_entry_created_at_idx" ON "player_journal_entry"("created_at");

ALTER TABLE "explore_event_record" ADD CONSTRAINT "explore_event_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "explore_event_record" ADD CONSTRAINT "explore_event_record_explore_record_id_fkey" FOREIGN KEY ("explore_record_id") REFERENCES "explore_action_record"("record_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "player_journal_entry" ADD CONSTRAINT "player_journal_entry_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
