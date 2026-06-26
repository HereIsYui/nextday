CREATE TABLE "player_skill_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "skill_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "cost_snapshot" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "learned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_skill_record_pkey" PRIMARY KEY ("record_id")
);

CREATE UNIQUE INDEX "player_skill_record_player_id_skill_id_key" ON "player_skill_record"("player_id", "skill_id");
CREATE INDEX "player_skill_record_player_id_idx" ON "player_skill_record"("player_id");
CREATE INDEX "player_skill_record_era_id_idx" ON "player_skill_record"("era_id");
CREATE INDEX "player_skill_record_skill_id_idx" ON "player_skill_record"("skill_id");
CREATE INDEX "player_skill_record_learned_at_idx" ON "player_skill_record"("learned_at");

ALTER TABLE "player_skill_record"
ADD CONSTRAINT "player_skill_record_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id")
ON DELETE RESTRICT ON UPDATE CASCADE;
