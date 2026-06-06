-- CreateTable
CREATE TABLE "tower_state" (
    "tower_state_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT NOT NULL,
    "tower_id" TEXT NOT NULL,
    "tower_name" TEXT NOT NULL,
    "integrity" INTEGER NOT NULL DEFAULT 1000,
    "seal_progress" INTEGER NOT NULL DEFAULT 0,
    "break_progress" INTEGER NOT NULL DEFAULT 0,
    "supply_progress" INTEGER NOT NULL DEFAULT 0,
    "rift_pressure" INTEGER NOT NULL DEFAULT 0,
    "corruption" INTEGER NOT NULL DEFAULT 0,
    "phase" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tower_state_pkey" PRIMARY KEY ("tower_state_id")
);

-- CreateTable
CREATE TABLE "tower_action_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "sect_id" TEXT,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "tower_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "contribution" INTEGER NOT NULL,
    "action_point_cost" INTEGER NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "settlement_status" TEXT NOT NULL DEFAULT 'settled',
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tower_action_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "world_boss_state" (
    "boss_state_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "boss_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phase" INTEGER NOT NULL DEFAULT 1,
    "total_hp" INTEGER NOT NULL,
    "remaining_hp" INTEGER NOT NULL,
    "defeated_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_boss_state_pkey" PRIMARY KEY ("boss_state_id")
);

-- CreateTable
CREATE TABLE "world_boss_challenge_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "sect_id" TEXT,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "boss_id" TEXT NOT NULL,
    "damage_done" INTEGER NOT NULL,
    "contribution" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "battle_log" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "world_boss_challenge_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "sect" (
    "sect_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "alignment" TEXT NOT NULL DEFAULT 'neutral',
    "level" INTEGER NOT NULL DEFAULT 1,
    "funds" BIGINT NOT NULL DEFAULT 0,
    "build_exp" INTEGER NOT NULL DEFAULT 0,
    "member_limit" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "created_by_player_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sect_pkey" PRIMARY KEY ("sect_id")
);

-- CreateTable
CREATE TABLE "sect_member" (
    "sect_member_id" TEXT NOT NULL,
    "sect_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'disciple',
    "contribution_daily" INTEGER NOT NULL DEFAULT 0,
    "contribution_weekly" INTEGER NOT NULL DEFAULT 0,
    "contribution_total" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cooldown_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sect_member_pkey" PRIMARY KEY ("sect_member_id")
);

-- CreateTable
CREATE TABLE "sect_task_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "sect_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "contribution" INTEGER NOT NULL,
    "fund_gain" BIGINT NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sect_task_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "sect_warehouse_item" (
    "warehouse_item_id" TEXT NOT NULL,
    "sect_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "count" BIGINT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sect_warehouse_item_pkey" PRIMARY KEY ("warehouse_item_id")
);

-- CreateTable
CREATE TABLE "sect_warehouse_log" (
    "log_id" TEXT NOT NULL,
    "sect_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "count" BIGINT NOT NULL,
    "before_count" BIGINT NOT NULL,
    "after_count" BIGINT NOT NULL,
    "reason" TEXT,
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sect_warehouse_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "resource_point_state" (
    "resource_point_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_sect_id" TEXT,
    "owner_player_id" TEXT,
    "control_score" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_point_state_pkey" PRIMARY KEY ("resource_point_id")
);

-- CreateTable
CREATE TABLE "pvp_battle_record" (
    "record_id" TEXT NOT NULL,
    "attacker_player_id" TEXT NOT NULL,
    "defender_player_id" TEXT NOT NULL,
    "attacker_sect_id" TEXT,
    "defender_sect_id" TEXT,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "scene_type" TEXT NOT NULL DEFAULT 'resource_point',
    "resource_point_id" TEXT,
    "result" TEXT NOT NULL,
    "score_delta" INTEGER NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "battle_log" JSONB NOT NULL,
    "risk_status" TEXT NOT NULL DEFAULT 'normal',
    "settlement_status" TEXT NOT NULL DEFAULT 'settled',
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pvp_battle_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "rank_snapshot" (
    "rank_snapshot_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "rank_type" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_snapshot_pkey" PRIMARY KEY ("rank_snapshot_id")
);

-- CreateTable
CREATE TABLE "rank_entry" (
    "rank_entry_id" TEXT NOT NULL,
    "rank_snapshot_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "score" BIGINT NOT NULL,
    "rank_no" INTEGER NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rank_entry_pkey" PRIMARY KEY ("rank_entry_id")
);

-- CreateIndex
CREATE INDEX "tower_state_era_id_idx" ON "tower_state"("era_id");

-- CreateIndex
CREATE INDEX "tower_state_province_id_idx" ON "tower_state"("province_id");

-- CreateIndex
CREATE UNIQUE INDEX "tower_state_era_id_tower_id_key" ON "tower_state"("era_id", "tower_id");

-- CreateIndex
CREATE UNIQUE INDEX "tower_action_record_idempotency_key_key" ON "tower_action_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "tower_action_record_player_id_idx" ON "tower_action_record"("player_id");

-- CreateIndex
CREATE INDEX "tower_action_record_sect_id_idx" ON "tower_action_record"("sect_id");

-- CreateIndex
CREATE INDEX "tower_action_record_era_id_tower_id_idx" ON "tower_action_record"("era_id", "tower_id");

-- CreateIndex
CREATE INDEX "tower_action_record_action_type_idx" ON "tower_action_record"("action_type");

-- CreateIndex
CREATE INDEX "tower_action_record_created_at_idx" ON "tower_action_record"("created_at");

-- CreateIndex
CREATE INDEX "world_boss_state_era_id_idx" ON "world_boss_state"("era_id");

-- CreateIndex
CREATE UNIQUE INDEX "world_boss_state_era_id_boss_id_key" ON "world_boss_state"("era_id", "boss_id");

-- CreateIndex
CREATE UNIQUE INDEX "world_boss_challenge_record_idempotency_key_key" ON "world_boss_challenge_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "world_boss_challenge_record_player_id_idx" ON "world_boss_challenge_record"("player_id");

-- CreateIndex
CREATE INDEX "world_boss_challenge_record_sect_id_idx" ON "world_boss_challenge_record"("sect_id");

-- CreateIndex
CREATE INDEX "world_boss_challenge_record_era_id_boss_id_idx" ON "world_boss_challenge_record"("era_id", "boss_id");

-- CreateIndex
CREATE INDEX "world_boss_challenge_record_created_at_idx" ON "world_boss_challenge_record"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sect_name_key" ON "sect"("name");

-- CreateIndex
CREATE INDEX "sect_alignment_idx" ON "sect"("alignment");

-- CreateIndex
CREATE INDEX "sect_level_idx" ON "sect"("level");

-- CreateIndex
CREATE INDEX "sect_status_idx" ON "sect"("status");

-- CreateIndex
CREATE UNIQUE INDEX "sect_member_player_id_key" ON "sect_member"("player_id");

-- CreateIndex
CREATE INDEX "sect_member_sect_id_idx" ON "sect_member"("sect_id");

-- CreateIndex
CREATE INDEX "sect_member_role_idx" ON "sect_member"("role");

-- CreateIndex
CREATE INDEX "sect_member_contribution_weekly_idx" ON "sect_member"("contribution_weekly");

-- CreateIndex
CREATE UNIQUE INDEX "sect_task_record_idempotency_key_key" ON "sect_task_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "sect_task_record_player_id_idx" ON "sect_task_record"("player_id");

-- CreateIndex
CREATE INDEX "sect_task_record_sect_id_idx" ON "sect_task_record"("sect_id");

-- CreateIndex
CREATE INDEX "sect_task_record_task_id_idx" ON "sect_task_record"("task_id");

-- CreateIndex
CREATE INDEX "sect_task_record_created_at_idx" ON "sect_task_record"("created_at");

-- CreateIndex
CREATE INDEX "sect_warehouse_item_sect_id_idx" ON "sect_warehouse_item"("sect_id");

-- CreateIndex
CREATE INDEX "sect_warehouse_item_item_id_idx" ON "sect_warehouse_item"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sect_warehouse_item_sect_id_item_id_key" ON "sect_warehouse_item"("sect_id", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sect_warehouse_log_idempotency_key_key" ON "sect_warehouse_log"("idempotency_key");

-- CreateIndex
CREATE INDEX "sect_warehouse_log_sect_id_idx" ON "sect_warehouse_log"("sect_id");

-- CreateIndex
CREATE INDEX "sect_warehouse_log_player_id_idx" ON "sect_warehouse_log"("player_id");

-- CreateIndex
CREATE INDEX "sect_warehouse_log_item_id_idx" ON "sect_warehouse_log"("item_id");

-- CreateIndex
CREATE INDEX "sect_warehouse_log_operation_type_idx" ON "sect_warehouse_log"("operation_type");

-- CreateIndex
CREATE INDEX "sect_warehouse_log_created_at_idx" ON "sect_warehouse_log"("created_at");

-- CreateIndex
CREATE INDEX "resource_point_state_era_id_idx" ON "resource_point_state"("era_id");

-- CreateIndex
CREATE INDEX "resource_point_state_owner_sect_id_idx" ON "resource_point_state"("owner_sect_id");

-- CreateIndex
CREATE INDEX "resource_point_state_owner_player_id_idx" ON "resource_point_state"("owner_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "resource_point_state_era_id_province_id_key" ON "resource_point_state"("era_id", "province_id");

-- CreateIndex
CREATE UNIQUE INDEX "pvp_battle_record_idempotency_key_key" ON "pvp_battle_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "pvp_battle_record_attacker_player_id_idx" ON "pvp_battle_record"("attacker_player_id");

-- CreateIndex
CREATE INDEX "pvp_battle_record_defender_player_id_idx" ON "pvp_battle_record"("defender_player_id");

-- CreateIndex
CREATE INDEX "pvp_battle_record_attacker_sect_id_idx" ON "pvp_battle_record"("attacker_sect_id");

-- CreateIndex
CREATE INDEX "pvp_battle_record_defender_sect_id_idx" ON "pvp_battle_record"("defender_sect_id");

-- CreateIndex
CREATE INDEX "pvp_battle_record_era_id_idx" ON "pvp_battle_record"("era_id");

-- CreateIndex
CREATE INDEX "pvp_battle_record_scene_type_idx" ON "pvp_battle_record"("scene_type");

-- CreateIndex
CREATE INDEX "pvp_battle_record_resource_point_id_idx" ON "pvp_battle_record"("resource_point_id");

-- CreateIndex
CREATE INDEX "pvp_battle_record_created_at_idx" ON "pvp_battle_record"("created_at");

-- CreateIndex
CREATE INDEX "rank_snapshot_era_id_idx" ON "rank_snapshot"("era_id");

-- CreateIndex
CREATE INDEX "rank_snapshot_rank_type_idx" ON "rank_snapshot"("rank_type");

-- CreateIndex
CREATE UNIQUE INDEX "rank_snapshot_era_id_rank_type_period_key_key" ON "rank_snapshot"("era_id", "rank_type", "period_key");

-- CreateIndex
CREATE INDEX "rank_entry_rank_snapshot_id_idx" ON "rank_entry"("rank_snapshot_id");

-- CreateIndex
CREATE INDEX "rank_entry_target_type_target_id_idx" ON "rank_entry"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "rank_entry_rank_no_idx" ON "rank_entry"("rank_no");

-- AddForeignKey
ALTER TABLE "tower_action_record" ADD CONSTRAINT "tower_action_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tower_action_record" ADD CONSTRAINT "tower_action_record_era_id_tower_id_fkey" FOREIGN KEY ("era_id", "tower_id") REFERENCES "tower_state"("era_id", "tower_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tower_action_record" ADD CONSTRAINT "tower_action_record_sect_id_fkey" FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_boss_challenge_record" ADD CONSTRAINT "world_boss_challenge_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_boss_challenge_record" ADD CONSTRAINT "world_boss_challenge_record_era_id_boss_id_fkey" FOREIGN KEY ("era_id", "boss_id") REFERENCES "world_boss_state"("era_id", "boss_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_boss_challenge_record" ADD CONSTRAINT "world_boss_challenge_record_sect_id_fkey" FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sect_member" ADD CONSTRAINT "sect_member_sect_id_fkey" FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sect_member" ADD CONSTRAINT "sect_member_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sect_task_record" ADD CONSTRAINT "sect_task_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sect_task_record" ADD CONSTRAINT "sect_task_record_sect_id_fkey" FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sect_warehouse_item" ADD CONSTRAINT "sect_warehouse_item_sect_id_fkey" FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sect_warehouse_log" ADD CONSTRAINT "sect_warehouse_log_sect_id_fkey" FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_battle_record" ADD CONSTRAINT "pvp_battle_record_attacker_player_id_fkey" FOREIGN KEY ("attacker_player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_battle_record" ADD CONSTRAINT "pvp_battle_record_defender_player_id_fkey" FOREIGN KEY ("defender_player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pvp_battle_record" ADD CONSTRAINT "pvp_battle_record_resource_point_id_fkey" FOREIGN KEY ("resource_point_id") REFERENCES "resource_point_state"("resource_point_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rank_entry" ADD CONSTRAINT "rank_entry_rank_snapshot_id_fkey" FOREIGN KEY ("rank_snapshot_id") REFERENCES "rank_snapshot"("rank_snapshot_id") ON DELETE CASCADE ON UPDATE CASCADE;
