-- AlterTable
ALTER TABLE "player_item" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "alchemy_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "recipe_id" TEXT NOT NULL,
    "pill_item_id" TEXT,
    "quality" TEXT,
    "success" BOOLEAN NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "material_snapshot" JSONB NOT NULL,
    "failure_return_snapshot" JSONB,
    "result_snapshot" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alchemy_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "pill_use_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "pill_item_id" TEXT NOT NULL,
    "pill_rank" INTEGER NOT NULL,
    "pill_type" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "same_tier_use_count" INTEGER NOT NULL,
    "effective_rate" INTEGER NOT NULL,
    "effect_value" INTEGER NOT NULL,
    "before_cultivation" BIGINT NOT NULL,
    "after_cultivation" BIGINT NOT NULL,
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pill_use_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "equipment_instance" (
    "equipment_instance_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "equipment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "equipment_type" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "star_level" INTEGER NOT NULL DEFAULT 0,
    "bind_type" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "equipped_slot" TEXT,
    "durability" INTEGER NOT NULL DEFAULT 100,
    "max_durability" INTEGER NOT NULL DEFAULT 100,
    "source_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_instance_pkey" PRIMARY KEY ("equipment_instance_id")
);

-- CreateTable
CREATE TABLE "equipment_affix" (
    "affix_id" TEXT NOT NULL,
    "equipment_instance_id" TEXT NOT NULL,
    "affix_type" TEXT NOT NULL,
    "affix_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_affix_pkey" PRIMARY KEY ("affix_id")
);

-- CreateTable
CREATE TABLE "equipment_operation_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "equipment_instance_id" TEXT,
    "operation_type" TEXT NOT NULL,
    "material_snapshot" JSONB NOT NULL,
    "result_snapshot" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_operation_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "player_skill_loadout" (
    "player_id" TEXT NOT NULL,
    "active_skill_ids" JSONB NOT NULL,
    "treasure_skill_id" TEXT NOT NULL,
    "auto_priority" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_skill_loadout_pkey" PRIMARY KEY ("player_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alchemy_record_idempotency_key_key" ON "alchemy_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "alchemy_record_player_id_idx" ON "alchemy_record"("player_id");

-- CreateIndex
CREATE INDEX "alchemy_record_era_id_idx" ON "alchemy_record"("era_id");

-- CreateIndex
CREATE INDEX "alchemy_record_recipe_id_idx" ON "alchemy_record"("recipe_id");

-- CreateIndex
CREATE INDEX "alchemy_record_pill_item_id_idx" ON "alchemy_record"("pill_item_id");

-- CreateIndex
CREATE INDEX "alchemy_record_created_at_idx" ON "alchemy_record"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pill_use_record_idempotency_key_key" ON "pill_use_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "pill_use_record_player_id_idx" ON "pill_use_record"("player_id");

-- CreateIndex
CREATE INDEX "pill_use_record_era_id_idx" ON "pill_use_record"("era_id");

-- CreateIndex
CREATE INDEX "pill_use_record_pill_item_id_idx" ON "pill_use_record"("pill_item_id");

-- CreateIndex
CREATE INDEX "pill_use_record_pill_type_pill_rank_idx" ON "pill_use_record"("pill_type", "pill_rank");

-- CreateIndex
CREATE INDEX "pill_use_record_created_at_idx" ON "pill_use_record"("created_at");

-- CreateIndex
CREATE INDEX "equipment_instance_player_id_idx" ON "equipment_instance"("player_id");

-- CreateIndex
CREATE INDEX "equipment_instance_era_id_idx" ON "equipment_instance"("era_id");

-- CreateIndex
CREATE INDEX "equipment_instance_equipment_id_idx" ON "equipment_instance"("equipment_id");

-- CreateIndex
CREATE INDEX "equipment_instance_equipment_type_idx" ON "equipment_instance"("equipment_type");

-- CreateIndex
CREATE INDEX "equipment_instance_rarity_idx" ON "equipment_instance"("rarity");

-- CreateIndex
CREATE INDEX "equipment_instance_status_idx" ON "equipment_instance"("status");

-- CreateIndex
CREATE INDEX "equipment_affix_equipment_instance_id_idx" ON "equipment_affix"("equipment_instance_id");

-- CreateIndex
CREATE INDEX "equipment_affix_affix_type_idx" ON "equipment_affix"("affix_type");

-- CreateIndex
CREATE INDEX "equipment_affix_affix_key_idx" ON "equipment_affix"("affix_key");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_operation_record_idempotency_key_key" ON "equipment_operation_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "equipment_operation_record_player_id_idx" ON "equipment_operation_record"("player_id");

-- CreateIndex
CREATE INDEX "equipment_operation_record_era_id_idx" ON "equipment_operation_record"("era_id");

-- CreateIndex
CREATE INDEX "equipment_operation_record_equipment_instance_id_idx" ON "equipment_operation_record"("equipment_instance_id");

-- CreateIndex
CREATE INDEX "equipment_operation_record_operation_type_idx" ON "equipment_operation_record"("operation_type");

-- CreateIndex
CREATE INDEX "equipment_operation_record_created_at_idx" ON "equipment_operation_record"("created_at");

-- AddForeignKey
ALTER TABLE "alchemy_record" ADD CONSTRAINT "alchemy_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pill_use_record" ADD CONSTRAINT "pill_use_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_instance" ADD CONSTRAINT "equipment_instance_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_affix" ADD CONSTRAINT "equipment_affix_equipment_instance_id_fkey" FOREIGN KEY ("equipment_instance_id") REFERENCES "equipment_instance"("equipment_instance_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_operation_record" ADD CONSTRAINT "equipment_operation_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_operation_record" ADD CONSTRAINT "equipment_operation_record_equipment_instance_id_fkey" FOREIGN KEY ("equipment_instance_id") REFERENCES "equipment_instance"("equipment_instance_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_skill_loadout" ADD CONSTRAINT "player_skill_loadout_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
