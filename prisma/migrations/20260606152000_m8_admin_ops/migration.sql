-- M8 运营后台：邮件公告、配置发布审计与风控解除
ALTER TABLE "behavior_risk_record"
  ADD COLUMN "resolution_status" TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN "resolution_reason" TEXT,
  ADD COLUMN "resolved_by" TEXT,
  ADD COLUMN "resolved_at" TIMESTAMP(3);

CREATE TABLE "player_mail" (
  "mail_id" TEXT NOT NULL,
  "player_id" TEXT,
  "target_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "reward_snapshot" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "sent_by" TEXT NOT NULL,
  "reason" TEXT,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3),
  "read_at" TIMESTAMP(3),
  "claimed_at" TIMESTAMP(3),
  CONSTRAINT "player_mail_pkey" PRIMARY KEY ("mail_id")
);

CREATE TABLE "announcement" (
  "announcement_id" TEXT NOT NULL,
  "announcement_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "visible_scope" TEXT NOT NULL DEFAULT 'all',
  "related_config_version" TEXT,
  "status" TEXT NOT NULL DEFAULT 'published',
  "published_by" TEXT NOT NULL,
  "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcement_pkey" PRIMARY KEY ("announcement_id")
);

CREATE TABLE "gm_operation_log" (
  "operation_id" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target_type" TEXT NOT NULL,
  "target_id" TEXT,
  "before_snapshot" JSONB,
  "after_snapshot" JSONB,
  "reason" TEXT,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gm_operation_log_pkey" PRIMARY KEY ("operation_id")
);

CREATE INDEX "behavior_risk_record_resolution_status_idx" ON "behavior_risk_record"("resolution_status");

CREATE UNIQUE INDEX "player_mail_idempotency_key_key" ON "player_mail"("idempotency_key");
CREATE INDEX "player_mail_player_id_idx" ON "player_mail"("player_id");
CREATE INDEX "player_mail_target_type_idx" ON "player_mail"("target_type");
CREATE INDEX "player_mail_status_idx" ON "player_mail"("status");
CREATE INDEX "player_mail_created_at_idx" ON "player_mail"("created_at");

CREATE INDEX "announcement_announcement_type_idx" ON "announcement"("announcement_type");
CREATE INDEX "announcement_visible_scope_idx" ON "announcement"("visible_scope");
CREATE INDEX "announcement_status_idx" ON "announcement"("status");
CREATE INDEX "announcement_starts_at_idx" ON "announcement"("starts_at");

CREATE UNIQUE INDEX "gm_operation_log_idempotency_key_key" ON "gm_operation_log"("idempotency_key");
CREATE INDEX "gm_operation_log_operator_idx" ON "gm_operation_log"("operator");
CREATE INDEX "gm_operation_log_action_idx" ON "gm_operation_log"("action");
CREATE INDEX "gm_operation_log_target_type_target_id_idx" ON "gm_operation_log"("target_type", "target_id");
CREATE INDEX "gm_operation_log_created_at_idx" ON "gm_operation_log"("created_at");

ALTER TABLE "player_mail" ADD CONSTRAINT "player_mail_player_id_fkey"
  FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;
