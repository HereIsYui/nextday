-- P1 仙魔 / 散修路线状态
CREATE TABLE "player_faction_state" (
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "route" TEXT NOT NULL DEFAULT 'undecided',
    "reputation_immortal" INTEGER NOT NULL DEFAULT 0,
    "reputation_demon" INTEGER NOT NULL DEFAULT 0,
    "reputation_wanderer" INTEGER NOT NULL DEFAULT 0,
    "route_chosen_at" TIMESTAMP(3),
    "transfer_cooldown_until" TIMESTAMP(3),
    "transfer_count" INTEGER NOT NULL DEFAULT 0,
    "title_id" TEXT,
    "chronicle_title" TEXT,
    "ending_summary" TEXT,
    "display_appearance_id" TEXT,
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_faction_state_pkey" PRIMARY KEY ("player_id")
);

-- P1 转道审计记录
CREATE TABLE "faction_transfer_record" (
    "transfer_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "from_route" TEXT NOT NULL,
    "to_route" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "cost_summary" JSONB NOT NULL,
    "reputation_clear_summary" JSONB NOT NULL,
    "sect_conflict" BOOLEAN NOT NULL DEFAULT false,
    "previous_sect_alignment" TEXT,
    "title_id" TEXT,
    "display_appearance_id" TEXT,
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "faction_transfer_record_pkey" PRIMARY KEY ("transfer_record_id")
);

CREATE INDEX "player_faction_state_era_id_idx" ON "player_faction_state"("era_id");
CREATE INDEX "player_faction_state_route_idx" ON "player_faction_state"("route");
CREATE INDEX "player_faction_state_transfer_cooldown_until_idx" ON "player_faction_state"("transfer_cooldown_until");

CREATE UNIQUE INDEX "faction_transfer_record_idempotency_key_key" ON "faction_transfer_record"("idempotency_key");
CREATE INDEX "faction_transfer_record_player_id_idx" ON "faction_transfer_record"("player_id");
CREATE INDEX "faction_transfer_record_era_id_idx" ON "faction_transfer_record"("era_id");
CREATE INDEX "faction_transfer_record_from_route_idx" ON "faction_transfer_record"("from_route");
CREATE INDEX "faction_transfer_record_to_route_idx" ON "faction_transfer_record"("to_route");
CREATE INDEX "faction_transfer_record_created_at_idx" ON "faction_transfer_record"("created_at");

ALTER TABLE "player_faction_state" ADD CONSTRAINT "player_faction_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "faction_transfer_record" ADD CONSTRAINT "faction_transfer_record_player_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "faction_transfer_record" ADD CONSTRAINT "faction_transfer_record_state_fkey" FOREIGN KEY ("player_id") REFERENCES "player_faction_state"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
