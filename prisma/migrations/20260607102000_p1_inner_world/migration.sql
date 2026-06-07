-- CreateTable
CREATE TABLE "inner_world_state" (
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "world_level" INTEGER NOT NULL DEFAULT 1,
    "law_level" INTEGER NOT NULL DEFAULT 1,
    "law_exp" INTEGER NOT NULL DEFAULT 0,
    "creature_capacity" INTEGER NOT NULL DEFAULT 3,
    "assignment_limit" INTEGER NOT NULL DEFAULT 1,
    "support_count_today" INTEGER NOT NULL DEFAULT 0,
    "support_reset_key" TEXT NOT NULL DEFAULT '1970-01-01',
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inner_world_state_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "inner_world_creature" (
    "creature_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "creature_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "affinity_province_id" TEXT,
    "assignment_bonus_summary" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idle',
    "config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inner_world_creature_pkey" PRIMARY KEY ("creature_id")
);

-- CreateTable
CREATE TABLE "inner_world_assignment" (
    "assignment_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "creature_id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "reward_snapshot" JSONB NOT NULL,
    "law_exp_gain" INTEGER NOT NULL DEFAULT 0,
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,

    CONSTRAINT "inner_world_assignment_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "inner_world_law_record" (
    "law_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "law_type" TEXT NOT NULL,
    "exp_delta" INTEGER NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "before_level" INTEGER NOT NULL,
    "after_level" INTEGER NOT NULL,
    "before_exp" INTEGER NOT NULL DEFAULT 0,
    "after_exp" INTEGER NOT NULL DEFAULT 0,
    "config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inner_world_law_record_pkey" PRIMARY KEY ("law_record_id")
);

-- CreateTable
CREATE TABLE "inner_world_support_record" (
    "support_record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT NOT NULL,
    "tower_id" TEXT,
    "support_type" TEXT NOT NULL,
    "cost_summary" JSONB NOT NULL,
    "reward_summary" JSONB NOT NULL,
    "contribution_summary" JSONB NOT NULL,
    "idempotency_key" TEXT,
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inner_world_support_record_pkey" PRIMARY KEY ("support_record_id")
);

-- CreateIndex
CREATE INDEX "inner_world_state_era_id_idx" ON "inner_world_state"("era_id");

-- CreateIndex
CREATE INDEX "inner_world_state_world_level_idx" ON "inner_world_state"("world_level");

-- CreateIndex
CREATE INDEX "inner_world_creature_player_id_idx" ON "inner_world_creature"("player_id");

-- CreateIndex
CREATE INDEX "inner_world_creature_era_id_idx" ON "inner_world_creature"("era_id");

-- CreateIndex
CREATE INDEX "inner_world_creature_status_idx" ON "inner_world_creature"("status");

-- CreateIndex
CREATE INDEX "inner_world_creature_affinity_province_id_idx" ON "inner_world_creature"("affinity_province_id");

-- CreateIndex
CREATE UNIQUE INDEX "inner_world_assignment_idempotency_key_key" ON "inner_world_assignment"("idempotency_key");

-- CreateIndex
CREATE INDEX "inner_world_assignment_player_id_idx" ON "inner_world_assignment"("player_id");

-- CreateIndex
CREATE INDEX "inner_world_assignment_era_id_idx" ON "inner_world_assignment"("era_id");

-- CreateIndex
CREATE INDEX "inner_world_assignment_province_id_idx" ON "inner_world_assignment"("province_id");

-- CreateIndex
CREATE INDEX "inner_world_assignment_status_idx" ON "inner_world_assignment"("status");

-- CreateIndex
CREATE INDEX "inner_world_assignment_ends_at_idx" ON "inner_world_assignment"("ends_at");

-- CreateIndex
CREATE INDEX "inner_world_law_record_player_id_idx" ON "inner_world_law_record"("player_id");

-- CreateIndex
CREATE INDEX "inner_world_law_record_era_id_idx" ON "inner_world_law_record"("era_id");

-- CreateIndex
CREATE INDEX "inner_world_law_record_law_type_idx" ON "inner_world_law_record"("law_type");

-- CreateIndex
CREATE INDEX "inner_world_law_record_source_type_idx" ON "inner_world_law_record"("source_type");

-- CreateIndex
CREATE INDEX "inner_world_law_record_created_at_idx" ON "inner_world_law_record"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inner_world_support_record_idempotency_key_key" ON "inner_world_support_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "inner_world_support_record_player_id_idx" ON "inner_world_support_record"("player_id");

-- CreateIndex
CREATE INDEX "inner_world_support_record_era_id_idx" ON "inner_world_support_record"("era_id");

-- CreateIndex
CREATE INDEX "inner_world_support_record_province_id_idx" ON "inner_world_support_record"("province_id");

-- CreateIndex
CREATE INDEX "inner_world_support_record_support_type_idx" ON "inner_world_support_record"("support_type");

-- CreateIndex
CREATE INDEX "inner_world_support_record_created_at_idx" ON "inner_world_support_record"("created_at");

-- AddForeignKey
ALTER TABLE "inner_world_state" ADD CONSTRAINT "inner_world_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inner_world_creature" ADD CONSTRAINT "inner_world_creature_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inner_world_assignment" ADD CONSTRAINT "inner_world_assignment_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inner_world_assignment" ADD CONSTRAINT "inner_world_assignment_creature_id_fkey" FOREIGN KEY ("creature_id") REFERENCES "inner_world_creature"("creature_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inner_world_law_record" ADD CONSTRAINT "inner_world_law_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inner_world_support_record" ADD CONSTRAINT "inner_world_support_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
