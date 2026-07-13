CREATE TABLE "siege_record" (
    "siege_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "target_city_id" TEXT NOT NULL,
    "target_tile_id" TEXT NOT NULL,
    "march_id" TEXT NOT NULL,
    "attacker_player_id" TEXT NOT NULL,
    "defender_player_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attacker_power" INTEGER NOT NULL,
    "defender_power" INTEGER NOT NULL,
    "wall_damage" INTEGER NOT NULL DEFAULT 0,
    "plunder_snapshot" JSONB NOT NULL,
    "city_state_before" JSONB NOT NULL,
    "city_state_after" JSONB NOT NULL,
    "reward_rate_percent" INTEGER NOT NULL DEFAULT 100,
    "protection_until" TIMESTAMP(3),
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "siege_record_pkey" PRIMARY KEY ("siege_id")
);

CREATE UNIQUE INDEX "siege_record_idempotency_key_key" ON "siege_record"("idempotency_key");
CREATE INDEX "siege_record_target_city_id_created_at_idx" ON "siege_record"("target_city_id", "created_at");
CREATE INDEX "siege_record_attacker_player_id_target_city_id_created_at_idx" ON "siege_record"("attacker_player_id", "target_city_id", "created_at");
CREATE INDEX "siege_record_defender_player_id_created_at_idx" ON "siege_record"("defender_player_id", "created_at");
CREATE INDEX "siege_record_status_idx" ON "siege_record"("status");
