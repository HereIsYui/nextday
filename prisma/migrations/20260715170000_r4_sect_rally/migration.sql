CREATE TABLE "sect_rally" (
    "rally_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "sect_id" TEXT NOT NULL,
    "target_tile_id" TEXT NOT NULL,
    "landmark_group_id" TEXT NOT NULL,
    "province_id" TEXT NOT NULL,
    "rally_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by_player_id" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "result_snapshot" JSONB NOT NULL DEFAULT '{}',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sect_rally_pkey" PRIMARY KEY ("rally_id")
);
CREATE TABLE "sect_rally_member" (
    "rally_member_id" TEXT NOT NULL,
    "rally_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "team_power" INTEGER NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sect_rally_member_pkey" PRIMARY KEY ("rally_member_id")
);
CREATE UNIQUE INDEX "sect_rally_idempotency_key_key" ON "sect_rally"("idempotency_key");
CREATE INDEX "sect_rally_sect_id_status_ends_at_idx" ON "sect_rally"("sect_id", "status", "ends_at");
CREATE INDEX "sect_rally_landmark_group_id_status_ends_at_idx" ON "sect_rally"("landmark_group_id", "status", "ends_at");
CREATE UNIQUE INDEX "sect_rally_member_rally_id_player_id_key" ON "sect_rally_member"("rally_id", "player_id");
CREATE INDEX "sect_rally_member_rally_id_idx" ON "sect_rally_member"("rally_id");
CREATE INDEX "sect_rally_member_player_id_idx" ON "sect_rally_member"("player_id");
