CREATE TABLE "strategic_control_record" (
    "control_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "landmark_group_id" TEXT NOT NULL,
    "tile_id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "control_type" TEXT NOT NULL,
    "controller_type" TEXT NOT NULL,
    "controller_id" TEXT NOT NULL,
    "controller_name" TEXT NOT NULL,
    "attacker_power" INTEGER NOT NULL,
    "defender_power" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "source_march_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategic_control_record_pkey" PRIMARY KEY ("control_id")
);
CREATE UNIQUE INDEX "strategic_control_record_idempotency_key_key" ON "strategic_control_record"("idempotency_key");
CREATE INDEX "strategic_control_record_era_id_landmark_group_id_status_expires_at_idx" ON "strategic_control_record"("era_id", "landmark_group_id", "status", "expires_at");
CREATE INDEX "strategic_control_record_province_id_control_type_status_idx" ON "strategic_control_record"("province_id", "control_type", "status");
CREATE INDEX "strategic_control_record_controller_id_status_expires_at_idx" ON "strategic_control_record"("controller_id", "status", "expires_at");
