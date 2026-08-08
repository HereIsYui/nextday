ALTER TABLE "event_instance"
ADD COLUMN "cycle_key" TEXT NOT NULL DEFAULT 'cycle_legacy';

DROP INDEX "event_instance_era_id_event_id_key";

CREATE UNIQUE INDEX "event_instance_era_id_event_id_cycle_key_key"
ON "event_instance"("era_id", "event_id", "cycle_key");

ALTER TABLE "event_instance"
ALTER COLUMN "cycle_key" DROP DEFAULT;
