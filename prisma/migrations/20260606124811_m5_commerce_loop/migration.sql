-- CreateTable
CREATE TABLE "purchase_order" (
    "order_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "product_id" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "fishpi_point_cost" BIGINT NOT NULL,
    "paid_jade_amount" BIGINT NOT NULL DEFAULT 0,
    "bound_jade_amount" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "monthly_card_state" (
    "monthly_card_state_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "card_type" TEXT NOT NULL,
    "active_until" TIMESTAMP(3) NOT NULL,
    "remaining_days" INTEGER NOT NULL,
    "last_claim_date" TEXT,
    "source_order_id" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_card_state_pkey" PRIMARY KEY ("monthly_card_state_id")
);

-- CreateTable
CREATE TABLE "monthly_card_draw_grant" (
    "grant_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "card_type" TEXT NOT NULL,
    "pool_type" TEXT NOT NULL,
    "grant_date" TEXT NOT NULL,
    "draw_count" INTEGER NOT NULL,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "source_order_id" TEXT NOT NULL,
    "gacha_config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_card_draw_grant_pkey" PRIMARY KEY ("grant_id")
);

-- CreateTable
CREATE TABLE "player_vip_state" (
    "player_id" TEXT NOT NULL,
    "vip_level" INTEGER NOT NULL DEFAULT 0,
    "active_until" TIMESTAMP(3),
    "source_type" TEXT NOT NULL DEFAULT 'mock_fishpi',
    "config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_vip_state_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "gacha_record" (
    "gacha_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "pool_type" TEXT NOT NULL,
    "cost_type" TEXT NOT NULL,
    "cost_amount" BIGINT NOT NULL DEFAULT 0,
    "grant_id" TEXT,
    "result_type" TEXT NOT NULL,
    "result_id" TEXT NOT NULL,
    "result_name" TEXT NOT NULL,
    "duplicate" BOOLEAN NOT NULL DEFAULT false,
    "pity_before" INTEGER NOT NULL DEFAULT 0,
    "pity_after" INTEGER NOT NULL DEFAULT 0,
    "conversion_snapshot" JSONB,
    "result_snapshot" JSONB NOT NULL,
    "gacha_config_version" TEXT NOT NULL,
    "reward_config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gacha_record_pkey" PRIMARY KEY ("gacha_id")
);

-- CreateTable
CREATE TABLE "gacha_pity_state" (
    "gacha_pity_state_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "pool_type" TEXT NOT NULL,
    "pity_count" INTEGER NOT NULL DEFAULT 0,
    "total_draws" INTEGER NOT NULL DEFAULT 0,
    "guarantee_at" INTEGER NOT NULL,
    "last_gacha_id" TEXT,
    "gacha_config_version" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gacha_pity_state_pkey" PRIMARY KEY ("gacha_pity_state_id")
);

-- CreateTable
CREATE TABLE "ancient_treasure_state" (
    "ancient_treasure_state_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "treasure_id" TEXT NOT NULL,
    "owned" BOOLEAN NOT NULL DEFAULT false,
    "star_level" INTEGER NOT NULL DEFAULT 0,
    "fragment_count" INTEGER NOT NULL DEFAULT 0,
    "soul_count" INTEGER NOT NULL DEFAULT 0,
    "catalog_inherited" BOOLEAN NOT NULL DEFAULT false,
    "source_gacha_id" TEXT,
    "treasure_config_version" TEXT NOT NULL,
    "acquired_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ancient_treasure_state_pkey" PRIMARY KEY ("ancient_treasure_state_id")
);

-- CreateTable
CREATE TABLE "convenience_strategy" (
    "strategy_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "strategy_name" TEXT NOT NULL,
    "strategy_type" TEXT NOT NULL,
    "tier_at_create" TEXT NOT NULL,
    "config_snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "convenience_strategy_pkey" PRIMARY KEY ("strategy_id")
);

-- CreateTable
CREATE TABLE "automation_queue" (
    "queue_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "queue_type" TEXT NOT NULL,
    "entitlement_tier" TEXT NOT NULL,
    "requested_actions" JSONB NOT NULL,
    "accepted_actions" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_queue_pkey" PRIMARY KEY ("queue_id")
);

-- CreateTable
CREATE TABLE "player_appearance" (
    "player_appearance_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "appearance_id" TEXT NOT NULL,
    "appearance_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "inherited" BOOLEAN NOT NULL DEFAULT false,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "expire_at" TIMESTAMP(3),
    "config_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_appearance_pkey" PRIMARY KEY ("player_appearance_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_idempotency_key_key" ON "purchase_order"("idempotency_key");

-- CreateIndex
CREATE INDEX "purchase_order_player_id_idx" ON "purchase_order"("player_id");

-- CreateIndex
CREATE INDEX "purchase_order_era_id_idx" ON "purchase_order"("era_id");

-- CreateIndex
CREATE INDEX "purchase_order_product_id_idx" ON "purchase_order"("product_id");

-- CreateIndex
CREATE INDEX "purchase_order_product_type_idx" ON "purchase_order"("product_type");

-- CreateIndex
CREATE INDEX "purchase_order_status_idx" ON "purchase_order"("status");

-- CreateIndex
CREATE INDEX "purchase_order_created_at_idx" ON "purchase_order"("created_at");

-- CreateIndex
CREATE INDEX "monthly_card_state_player_id_idx" ON "monthly_card_state"("player_id");

-- CreateIndex
CREATE INDEX "monthly_card_state_card_type_idx" ON "monthly_card_state"("card_type");

-- CreateIndex
CREATE INDEX "monthly_card_state_active_until_idx" ON "monthly_card_state"("active_until");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_card_state_player_id_card_type_key" ON "monthly_card_state"("player_id", "card_type");

-- CreateIndex
CREATE INDEX "monthly_card_draw_grant_player_id_idx" ON "monthly_card_draw_grant"("player_id");

-- CreateIndex
CREATE INDEX "monthly_card_draw_grant_pool_type_idx" ON "monthly_card_draw_grant"("pool_type");

-- CreateIndex
CREATE INDEX "monthly_card_draw_grant_grant_date_idx" ON "monthly_card_draw_grant"("grant_date");

-- CreateIndex
CREATE INDEX "monthly_card_draw_grant_expires_at_idx" ON "monthly_card_draw_grant"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_card_draw_grant_player_id_card_type_pool_type_grant_key" ON "monthly_card_draw_grant"("player_id", "card_type", "pool_type", "grant_date");

-- CreateIndex
CREATE INDEX "player_vip_state_vip_level_idx" ON "player_vip_state"("vip_level");

-- CreateIndex
CREATE INDEX "player_vip_state_active_until_idx" ON "player_vip_state"("active_until");

-- CreateIndex
CREATE UNIQUE INDEX "gacha_record_idempotency_key_key" ON "gacha_record"("idempotency_key");

-- CreateIndex
CREATE INDEX "gacha_record_player_id_idx" ON "gacha_record"("player_id");

-- CreateIndex
CREATE INDEX "gacha_record_era_id_idx" ON "gacha_record"("era_id");

-- CreateIndex
CREATE INDEX "gacha_record_pool_type_idx" ON "gacha_record"("pool_type");

-- CreateIndex
CREATE INDEX "gacha_record_cost_type_idx" ON "gacha_record"("cost_type");

-- CreateIndex
CREATE INDEX "gacha_record_grant_id_idx" ON "gacha_record"("grant_id");

-- CreateIndex
CREATE INDEX "gacha_record_result_id_idx" ON "gacha_record"("result_id");

-- CreateIndex
CREATE INDEX "gacha_record_created_at_idx" ON "gacha_record"("created_at");

-- CreateIndex
CREATE INDEX "gacha_pity_state_player_id_idx" ON "gacha_pity_state"("player_id");

-- CreateIndex
CREATE INDEX "gacha_pity_state_era_id_pool_type_idx" ON "gacha_pity_state"("era_id", "pool_type");

-- CreateIndex
CREATE INDEX "gacha_pity_state_last_gacha_id_idx" ON "gacha_pity_state"("last_gacha_id");

-- CreateIndex
CREATE UNIQUE INDEX "gacha_pity_state_player_id_era_id_pool_type_key" ON "gacha_pity_state"("player_id", "era_id", "pool_type");

-- CreateIndex
CREATE INDEX "ancient_treasure_state_player_id_idx" ON "ancient_treasure_state"("player_id");

-- CreateIndex
CREATE INDEX "ancient_treasure_state_era_id_idx" ON "ancient_treasure_state"("era_id");

-- CreateIndex
CREATE INDEX "ancient_treasure_state_treasure_id_idx" ON "ancient_treasure_state"("treasure_id");

-- CreateIndex
CREATE INDEX "ancient_treasure_state_source_gacha_id_idx" ON "ancient_treasure_state"("source_gacha_id");

-- CreateIndex
CREATE UNIQUE INDEX "ancient_treasure_state_player_id_era_id_treasure_id_key" ON "ancient_treasure_state"("player_id", "era_id", "treasure_id");

-- CreateIndex
CREATE UNIQUE INDEX "convenience_strategy_idempotency_key_key" ON "convenience_strategy"("idempotency_key");

-- CreateIndex
CREATE INDEX "convenience_strategy_player_id_idx" ON "convenience_strategy"("player_id");

-- CreateIndex
CREATE INDEX "convenience_strategy_strategy_type_idx" ON "convenience_strategy"("strategy_type");

-- CreateIndex
CREATE INDEX "convenience_strategy_tier_at_create_idx" ON "convenience_strategy"("tier_at_create");

-- CreateIndex
CREATE INDEX "convenience_strategy_status_idx" ON "convenience_strategy"("status");

-- CreateIndex
CREATE UNIQUE INDEX "automation_queue_idempotency_key_key" ON "automation_queue"("idempotency_key");

-- CreateIndex
CREATE INDEX "automation_queue_player_id_idx" ON "automation_queue"("player_id");

-- CreateIndex
CREATE INDEX "automation_queue_queue_type_idx" ON "automation_queue"("queue_type");

-- CreateIndex
CREATE INDEX "automation_queue_entitlement_tier_idx" ON "automation_queue"("entitlement_tier");

-- CreateIndex
CREATE INDEX "automation_queue_status_idx" ON "automation_queue"("status");

-- CreateIndex
CREATE INDEX "player_appearance_player_id_idx" ON "player_appearance"("player_id");

-- CreateIndex
CREATE INDEX "player_appearance_appearance_type_idx" ON "player_appearance"("appearance_type");

-- CreateIndex
CREATE INDEX "player_appearance_source_type_idx" ON "player_appearance"("source_type");

-- CreateIndex
CREATE INDEX "player_appearance_equipped_idx" ON "player_appearance"("equipped");

-- CreateIndex
CREATE INDEX "player_appearance_expire_at_idx" ON "player_appearance"("expire_at");

-- CreateIndex
CREATE UNIQUE INDEX "player_appearance_player_id_appearance_id_key" ON "player_appearance"("player_id", "appearance_id");

-- AddForeignKey
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_card_state" ADD CONSTRAINT "monthly_card_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_card_draw_grant" ADD CONSTRAINT "monthly_card_draw_grant_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_vip_state" ADD CONSTRAINT "player_vip_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_record" ADD CONSTRAINT "gacha_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_record" ADD CONSTRAINT "gacha_record_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "monthly_card_draw_grant"("grant_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gacha_pity_state" ADD CONSTRAINT "gacha_pity_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancient_treasure_state" ADD CONSTRAINT "ancient_treasure_state_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "convenience_strategy" ADD CONSTRAINT "convenience_strategy_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_queue" ADD CONSTRAINT "automation_queue_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_appearance" ADD CONSTRAINT "player_appearance_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
