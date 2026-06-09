CREATE TABLE "mentor_relation_record" (
    "mentor_relation_id" TEXT NOT NULL,
    "mentor_player_id" TEXT NOT NULL,
    "apprentice_player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "task_summary" JSONB NOT NULL,
    "reward_boundary_summary" JSONB NOT NULL,
    "cooldown_until" TIMESTAMP(3),
    "risk_summary" JSONB,
    "idempotency_key" TEXT,
    "mentor_config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "risk_ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_relation_record_pkey" PRIMARY KEY ("mentor_relation_id")
);

CREATE TABLE "sect_diplomacy_record" (
    "diplomacy_record_id" TEXT NOT NULL,
    "source_sect_id" TEXT NOT NULL,
    "target_sect_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "diplomacy_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "proposal_summary" JSONB NOT NULL,
    "approval_summary" JSONB,
    "cooldown_until" TIMESTAMP(3),
    "announcement_id" TEXT,
    "idempotency_key" TEXT,
    "diplomacy_config_version" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sect_diplomacy_record_pkey" PRIMARY KEY ("diplomacy_record_id")
);

CREATE TABLE "sect_hire_record" (
    "hire_record_id" TEXT NOT NULL,
    "employer_sect_id" TEXT NOT NULL,
    "helper_sect_id" TEXT,
    "helper_player_id" TEXT,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "hire_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "allowed_action_scope" JSONB NOT NULL,
    "reward_escrow_summary" JSONB NOT NULL,
    "risk_status" TEXT NOT NULL DEFAULT 'normal',
    "settlement_status" TEXT NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT,
    "hire_config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "risk_ruleset_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3),

    CONSTRAINT "sect_hire_record_pkey" PRIMARY KEY ("hire_record_id")
);

CREATE UNIQUE INDEX "mentor_relation_record_idempotency_key_key" ON "mentor_relation_record"("idempotency_key");
CREATE INDEX "mentor_relation_record_mentor_player_id_idx" ON "mentor_relation_record"("mentor_player_id");
CREATE INDEX "mentor_relation_record_apprentice_player_id_idx" ON "mentor_relation_record"("apprentice_player_id");
CREATE INDEX "mentor_relation_record_era_id_idx" ON "mentor_relation_record"("era_id");
CREATE INDEX "mentor_relation_record_status_idx" ON "mentor_relation_record"("status");
CREATE INDEX "mentor_relation_record_cooldown_until_idx" ON "mentor_relation_record"("cooldown_until");
CREATE INDEX "mentor_relation_record_created_at_idx" ON "mentor_relation_record"("created_at");
CREATE INDEX "mentor_relation_record_mentor_player_id_apprentice_player_id_status_idx" ON "mentor_relation_record"("mentor_player_id", "apprentice_player_id", "status");
CREATE INDEX "mentor_relation_record_apprentice_player_id_status_idx" ON "mentor_relation_record"("apprentice_player_id", "status");

CREATE UNIQUE INDEX "sect_diplomacy_record_idempotency_key_key" ON "sect_diplomacy_record"("idempotency_key");
CREATE INDEX "sect_diplomacy_record_source_sect_id_idx" ON "sect_diplomacy_record"("source_sect_id");
CREATE INDEX "sect_diplomacy_record_target_sect_id_idx" ON "sect_diplomacy_record"("target_sect_id");
CREATE INDEX "sect_diplomacy_record_era_id_idx" ON "sect_diplomacy_record"("era_id");
CREATE INDEX "sect_diplomacy_record_diplomacy_type_idx" ON "sect_diplomacy_record"("diplomacy_type");
CREATE INDEX "sect_diplomacy_record_status_idx" ON "sect_diplomacy_record"("status");
CREATE INDEX "sect_diplomacy_record_cooldown_until_idx" ON "sect_diplomacy_record"("cooldown_until");
CREATE INDEX "sect_diplomacy_record_announcement_id_idx" ON "sect_diplomacy_record"("announcement_id");
CREATE INDEX "sect_diplomacy_record_created_at_idx" ON "sect_diplomacy_record"("created_at");
CREATE INDEX "sect_diplomacy_record_source_sect_id_target_sect_id_status_idx" ON "sect_diplomacy_record"("source_sect_id", "target_sect_id", "status");
CREATE INDEX "sect_diplomacy_record_era_id_diplomacy_type_status_idx" ON "sect_diplomacy_record"("era_id", "diplomacy_type", "status");

CREATE UNIQUE INDEX "sect_hire_record_idempotency_key_key" ON "sect_hire_record"("idempotency_key");
CREATE INDEX "sect_hire_record_employer_sect_id_idx" ON "sect_hire_record"("employer_sect_id");
CREATE INDEX "sect_hire_record_helper_sect_id_idx" ON "sect_hire_record"("helper_sect_id");
CREATE INDEX "sect_hire_record_helper_player_id_idx" ON "sect_hire_record"("helper_player_id");
CREATE INDEX "sect_hire_record_era_id_idx" ON "sect_hire_record"("era_id");
CREATE INDEX "sect_hire_record_hire_type_idx" ON "sect_hire_record"("hire_type");
CREATE INDEX "sect_hire_record_status_idx" ON "sect_hire_record"("status");
CREATE INDEX "sect_hire_record_risk_status_idx" ON "sect_hire_record"("risk_status");
CREATE INDEX "sect_hire_record_settled_at_idx" ON "sect_hire_record"("settled_at");
CREATE INDEX "sect_hire_record_created_at_idx" ON "sect_hire_record"("created_at");
CREATE INDEX "sect_hire_record_status_created_at_idx" ON "sect_hire_record"("status", "created_at");
CREATE INDEX "sect_hire_record_helper_sect_id_helper_player_id_status_idx" ON "sect_hire_record"("helper_sect_id", "helper_player_id", "status");

ALTER TABLE "mentor_relation_record" ADD CONSTRAINT "mentor_relation_record_mentor_player_id_fkey" FOREIGN KEY ("mentor_player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mentor_relation_record" ADD CONSTRAINT "mentor_relation_record_apprentice_player_id_fkey" FOREIGN KEY ("apprentice_player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sect_diplomacy_record" ADD CONSTRAINT "sect_diplomacy_record_source_sect_id_fkey" FOREIGN KEY ("source_sect_id") REFERENCES "sect"("sect_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sect_diplomacy_record" ADD CONSTRAINT "sect_diplomacy_record_target_sect_id_fkey" FOREIGN KEY ("target_sect_id") REFERENCES "sect"("sect_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sect_hire_record" ADD CONSTRAINT "sect_hire_record_employer_sect_id_fkey" FOREIGN KEY ("employer_sect_id") REFERENCES "sect"("sect_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sect_hire_record" ADD CONSTRAINT "sect_hire_record_helper_sect_id_fkey" FOREIGN KEY ("helper_sect_id") REFERENCES "sect"("sect_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sect_hire_record" ADD CONSTRAINT "sect_hire_record_helper_player_id_fkey" FOREIGN KEY ("helper_player_id") REFERENCES "player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;
