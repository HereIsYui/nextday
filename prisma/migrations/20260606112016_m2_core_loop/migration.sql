-- AlterTable
ALTER TABLE "player_progress" ADD COLUMN     "cultivation_rate_per_hour" INTEGER NOT NULL DEFAULT 240,
ADD COLUMN     "last_cultivation_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "player_action_state" (
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "action_points" INTEGER NOT NULL DEFAULT 60,
    "action_point_cap" INTEGER NOT NULL DEFAULT 180,
    "action_point_restore_per_hour" INTEGER NOT NULL DEFAULT 12,
    "last_recovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_action_state_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "province_state" (
    "province_state_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tower_name" TEXT NOT NULL,
    "chapter_required" INTEGER NOT NULL DEFAULT 1,
    "unlocked" BOOLEAN NOT NULL DEFAULT true,
    "tower_integrity" INTEGER NOT NULL DEFAULT 1000,
    "rift_pressure" INTEGER NOT NULL DEFAULT 0,
    "corruption" INTEGER NOT NULL DEFAULT 0,
    "spirit_vein_level" INTEGER NOT NULL DEFAULT 1,
    "faction_control" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "province_state_pkey" PRIMARY KEY ("province_state_id")
);

-- CreateTable
CREATE TABLE "player_province_progress" (
    "province_progress_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT NOT NULL,
    "unlocked" BOOLEAN NOT NULL DEFAULT false,
    "best_explore_stage" INTEGER NOT NULL DEFAULT 0,
    "exploration_count" INTEGER NOT NULL DEFAULT 0,
    "last_action_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_province_progress_pkey" PRIMARY KEY ("province_progress_id")
);

-- CreateTable
CREATE TABLE "battle_log" (
    "battle_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "battle_type" TEXT NOT NULL,
    "province_id" TEXT,
    "enemy_id" TEXT NOT NULL,
    "enemy_name" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "rounds" INTEGER NOT NULL,
    "damage_done" INTEGER NOT NULL,
    "damage_taken" INTEGER NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "battle_log" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battle_log_pkey" PRIMARY KEY ("battle_id")
);

-- CreateTable
CREATE TABLE "player_task_state" (
    "task_state_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target_value" INTEGER NOT NULL,
    "progress_value" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "reset_key" TEXT NOT NULL DEFAULT 'permanent',
    "reward_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_task_state_pkey" PRIMARY KEY ("task_state_id")
);

-- CreateTable
CREATE TABLE "player_cave_state" (
    "player_id" TEXT NOT NULL,
    "spirit_field_level" INTEGER NOT NULL DEFAULT 1,
    "spirit_array_level" INTEGER NOT NULL DEFAULT 1,
    "alchemy_room_level" INTEGER NOT NULL DEFAULT 1,
    "refinery_room_level" INTEGER NOT NULL DEFAULT 1,
    "last_collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_cave_state_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "cave_collect_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "spirit_stone" BIGINT NOT NULL,
    "herb_count" INTEGER NOT NULL,
    "ore_count" INTEGER NOT NULL,
    "collected_minutes" INTEGER NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cave_collect_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateIndex
CREATE INDEX "player_action_state_era_id_idx" ON "player_action_state"("era_id");

-- CreateIndex
CREATE INDEX "province_state_era_id_idx" ON "province_state"("era_id");

-- CreateIndex
CREATE INDEX "province_state_province_id_idx" ON "province_state"("province_id");

-- CreateIndex
CREATE UNIQUE INDEX "province_state_era_id_province_id_key" ON "province_state"("era_id", "province_id");

-- CreateIndex
CREATE INDEX "player_province_progress_player_id_idx" ON "player_province_progress"("player_id");

-- CreateIndex
CREATE INDEX "player_province_progress_era_id_province_id_idx" ON "player_province_progress"("era_id", "province_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_province_progress_player_id_province_id_key" ON "player_province_progress"("player_id", "province_id");

-- CreateIndex
CREATE INDEX "battle_log_player_id_idx" ON "battle_log"("player_id");

-- CreateIndex
CREATE INDEX "battle_log_era_id_idx" ON "battle_log"("era_id");

-- CreateIndex
CREATE INDEX "battle_log_battle_type_idx" ON "battle_log"("battle_type");

-- CreateIndex
CREATE INDEX "battle_log_province_id_idx" ON "battle_log"("province_id");

-- CreateIndex
CREATE INDEX "battle_log_created_at_idx" ON "battle_log"("created_at");

-- CreateIndex
CREATE INDEX "player_task_state_player_id_idx" ON "player_task_state"("player_id");

-- CreateIndex
CREATE INDEX "player_task_state_task_type_status_idx" ON "player_task_state"("task_type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "player_task_state_player_id_task_id_reset_key_key" ON "player_task_state"("player_id", "task_id", "reset_key");

-- CreateIndex
CREATE INDEX "cave_collect_record_player_id_idx" ON "cave_collect_record"("player_id");

-- CreateIndex
CREATE INDEX "cave_collect_record_created_at_idx" ON "cave_collect_record"("created_at");

-- AddForeignKey
ALTER TABLE "player_action_state" ADD CONSTRAINT "player_action_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_province_progress" ADD CONSTRAINT "player_province_progress_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battle_log" ADD CONSTRAINT "battle_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_task_state" ADD CONSTRAINT "player_task_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_cave_state" ADD CONSTRAINT "player_cave_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cave_collect_record" ADD CONSTRAINT "cave_collect_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
