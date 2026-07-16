CREATE TABLE "war_merit_record" (
    "record_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "sect_id" TEXT,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "merit" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "detail_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "war_merit_record_pkey" PRIMARY KEY ("record_id")
);

CREATE UNIQUE INDEX "war_merit_record_player_id_source_type_source_id_key"
ON "war_merit_record"("player_id", "source_type", "source_id");
CREATE INDEX "war_merit_record_player_id_era_id_created_at_idx"
ON "war_merit_record"("player_id", "era_id", "created_at");
CREATE INDEX "war_merit_record_sect_id_era_id_created_at_idx"
ON "war_merit_record"("sect_id", "era_id", "created_at");
CREATE INDEX "war_merit_record_province_id_era_id_created_at_idx"
ON "war_merit_record"("province_id", "era_id", "created_at");
CREATE INDEX "war_merit_record_source_type_created_at_idx"
ON "war_merit_record"("source_type", "created_at");

ALTER TABLE "war_merit_record"
ADD CONSTRAINT "war_merit_record_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "war_merit_record"
ADD CONSTRAINT "war_merit_record_sect_id_fkey"
FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE SET NULL ON UPDATE CASCADE;
