ALTER TABLE "explore_action_record"
ADD COLUMN "event_trigger_at" TIMESTAMP(3),
ADD COLUMN "event_context_snapshot" JSONB;

CREATE INDEX "explore_action_record_event_trigger_at_idx"
ON "explore_action_record"("event_trigger_at");

ALTER TABLE "explore_event_record"
ADD COLUMN "triggered_at" TIMESTAMP(3),
ADD COLUMN "auto_resolve_at" TIMESTAMP(3),
ADD COLUMN "resolution_mode" TEXT;

UPDATE "explore_event_record"
SET
  "triggered_at" = "created_at",
  "auto_resolve_at" = CURRENT_TIMESTAMP + INTERVAL '10 minutes'
WHERE "status" = 'pending';

CREATE INDEX "explore_event_record_status_auto_resolve_at_idx"
ON "explore_event_record"("status", "auto_resolve_at");
