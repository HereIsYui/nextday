-- CreateTable
CREATE TABLE "account" (
    "account_id" TEXT NOT NULL,
    "account_type" TEXT NOT NULL,
    "device_id" TEXT,
    "fishpi_user_id" TEXT,
    "username" TEXT,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "account_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "player" (
    "player_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "alignment" TEXT NOT NULL DEFAULT 'undecided',
    "current_realm" INTEGER NOT NULL DEFAULT 1,
    "current_stage" INTEGER NOT NULL DEFAULT 1,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "sect_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "player_progress" (
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "cultivation_value" BIGINT NOT NULL DEFAULT 0,
    "breakthrough_fail_count" INTEGER NOT NULL DEFAULT 0,
    "calamity_value" INTEGER NOT NULL DEFAULT 0,
    "chapter_id" INTEGER NOT NULL DEFAULT 1,
    "catchup_bonus_rate" INTEGER NOT NULL DEFAULT 0,
    "newbie_protection_until" TIMESTAMP(3),
    "daily_active_score" INTEGER NOT NULL DEFAULT 0,
    "weekly_active_score" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_progress_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "player_wallet" (
    "player_id" TEXT NOT NULL,
    "spirit_stone" BIGINT NOT NULL DEFAULT 0,
    "immortal_stone" BIGINT NOT NULL DEFAULT 0,
    "jade_paid" BIGINT NOT NULL DEFAULT 0,
    "jade_bound" BIGINT NOT NULL DEFAULT 0,
    "era_point" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_wallet_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "player_item" (
    "item_instance_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "count" BIGINT NOT NULL,
    "bind_type" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "source_type" TEXT NOT NULL,
    "expire_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "player_item_pkey" PRIMARY KEY ("item_instance_id")
);

-- CreateTable
CREATE TABLE "config_version" (
    "config_id" TEXT NOT NULL,
    "config_type" TEXT NOT NULL,
    "config_version" TEXT NOT NULL,
    "ruleset_version" TEXT,
    "reward_config_version" TEXT,
    "payload" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "config_version_pkey" PRIMARY KEY ("config_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "audit_log_id" TEXT NOT NULL,
    "account_id" TEXT,
    "player_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB,
    "reason" TEXT,
    "idempotency_key" TEXT,
    "config_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("audit_log_id")
);

-- CreateTable
CREATE TABLE "wallet_log" (
    "log_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "currency_type" TEXT NOT NULL,
    "change_amount" BIGINT NOT NULL,
    "before_amount" BIGINT NOT NULL,
    "after_amount" BIGINT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "login_log" (
    "login_log_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "player_id" TEXT,
    "login_type" TEXT NOT NULL,
    "device_id" TEXT,
    "client_version" TEXT,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_log_pkey" PRIMARY KEY ("login_log_id")
);

-- CreateTable
CREATE TABLE "behavior_log" (
    "behavior_log_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "account_id" TEXT,
    "player_id" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "idempotency_key" TEXT,
    "client_version" TEXT,
    "ip_hash" TEXT,
    "user_agent_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavior_log_pkey" PRIMARY KEY ("behavior_log_id")
);

-- CreateTable
CREATE TABLE "idempotency_record" (
    "idempotency_key" TEXT NOT NULL,
    "account_id" TEXT,
    "endpoint" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_data" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL DEFAULT 200,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_record_pkey" PRIMARY KEY ("idempotency_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_device_id_key" ON "account"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_fishpi_user_id_key" ON "account"("fishpi_user_id");

-- CreateIndex
CREATE INDEX "account_account_type_idx" ON "account"("account_type");

-- CreateIndex
CREATE INDEX "account_status_idx" ON "account"("status");

-- CreateIndex
CREATE UNIQUE INDEX "player_account_id_key" ON "player"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_name_key" ON "player"("name");

-- CreateIndex
CREATE INDEX "player_account_id_idx" ON "player"("account_id");

-- CreateIndex
CREATE INDEX "player_sect_id_idx" ON "player"("sect_id");

-- CreateIndex
CREATE INDEX "player_current_realm_current_stage_current_level_idx" ON "player"("current_realm", "current_stage", "current_level");

-- CreateIndex
CREATE INDEX "player_status_idx" ON "player"("status");

-- CreateIndex
CREATE INDEX "player_progress_era_id_idx" ON "player_progress"("era_id");

-- CreateIndex
CREATE INDEX "player_progress_chapter_id_idx" ON "player_progress"("chapter_id");

-- CreateIndex
CREATE INDEX "player_item_player_id_idx" ON "player_item"("player_id");

-- CreateIndex
CREATE INDEX "player_item_item_id_idx" ON "player_item"("item_id");

-- CreateIndex
CREATE INDEX "player_item_bind_type_idx" ON "player_item"("bind_type");

-- CreateIndex
CREATE INDEX "player_item_source_type_idx" ON "player_item"("source_type");

-- CreateIndex
CREATE INDEX "player_item_expire_at_idx" ON "player_item"("expire_at");

-- CreateIndex
CREATE INDEX "config_version_config_type_active_idx" ON "config_version"("config_type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "config_version_config_type_config_version_key" ON "config_version"("config_type", "config_version");

-- CreateIndex
CREATE INDEX "audit_log_account_id_idx" ON "audit_log"("account_id");

-- CreateIndex
CREATE INDEX "audit_log_player_id_idx" ON "audit_log"("player_id");

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "audit_log_target_type_target_id_idx" ON "audit_log"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_log_idempotency_key_key" ON "wallet_log"("idempotency_key");

-- CreateIndex
CREATE INDEX "wallet_log_player_id_idx" ON "wallet_log"("player_id");

-- CreateIndex
CREATE INDEX "wallet_log_currency_type_idx" ON "wallet_log"("currency_type");

-- CreateIndex
CREATE INDEX "wallet_log_source_type_idx" ON "wallet_log"("source_type");

-- CreateIndex
CREATE INDEX "wallet_log_source_id_idx" ON "wallet_log"("source_id");

-- CreateIndex
CREATE INDEX "wallet_log_created_at_idx" ON "wallet_log"("created_at");

-- CreateIndex
CREATE INDEX "login_log_account_id_idx" ON "login_log"("account_id");

-- CreateIndex
CREATE INDEX "login_log_player_id_idx" ON "login_log"("player_id");

-- CreateIndex
CREATE INDEX "login_log_login_type_idx" ON "login_log"("login_type");

-- CreateIndex
CREATE INDEX "login_log_created_at_idx" ON "login_log"("created_at");

-- CreateIndex
CREATE INDEX "behavior_log_request_id_idx" ON "behavior_log"("request_id");

-- CreateIndex
CREATE INDEX "behavior_log_account_id_idx" ON "behavior_log"("account_id");

-- CreateIndex
CREATE INDEX "behavior_log_player_id_idx" ON "behavior_log"("player_id");

-- CreateIndex
CREATE INDEX "behavior_log_method_path_idx" ON "behavior_log"("method", "path");

-- CreateIndex
CREATE INDEX "behavior_log_status_code_idx" ON "behavior_log"("status_code");

-- CreateIndex
CREATE INDEX "behavior_log_created_at_idx" ON "behavior_log"("created_at");

-- CreateIndex
CREATE INDEX "idempotency_record_account_id_idx" ON "idempotency_record"("account_id");

-- CreateIndex
CREATE INDEX "idempotency_record_endpoint_idx" ON "idempotency_record"("endpoint");

-- CreateIndex
CREATE INDEX "idempotency_record_expires_at_idx" ON "idempotency_record"("expires_at");

-- AddForeignKey
ALTER TABLE "player" ADD CONSTRAINT "player_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_progress" ADD CONSTRAINT "player_progress_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_wallet" ADD CONSTRAINT "player_wallet_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_item" ADD CONSTRAINT "player_item_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_log" ADD CONSTRAINT "wallet_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_log" ADD CONSTRAINT "login_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_log" ADD CONSTRAINT "login_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_log" ADD CONSTRAINT "behavior_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behavior_log" ADD CONSTRAINT "behavior_log_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_record" ADD CONSTRAINT "idempotency_record_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;
