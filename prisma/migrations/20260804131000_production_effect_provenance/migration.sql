-- 为一次性丹药效果保留服丹记录溯源，便于审计与问题追踪。
ALTER TABLE "player_production_effect"
ADD COLUMN "source_pill_use_record_id" TEXT;

CREATE INDEX "player_production_effect_source_pill_use_record_id_idx"
ON "player_production_effect"("source_pill_use_record_id");
