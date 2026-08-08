ALTER TABLE "purchase_order"
ADD COLUMN "external_order_id" TEXT,
ADD COLUMN "provider_transaction_id" TEXT,
ADD COLUMN "entitlement_source" TEXT NOT NULL DEFAULT 'fishpi',
ADD COLUMN "verification_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN "verified_at" TIMESTAMP(3);

ALTER TABLE "player_vip_state"
ADD COLUMN "last_provider_transaction_id" TEXT;

CREATE UNIQUE INDEX "player_vip_state_last_provider_transaction_id_key"
ON "player_vip_state"("last_provider_transaction_id");

CREATE UNIQUE INDEX "purchase_order_provider_transaction_id_key"
ON "purchase_order"("provider_transaction_id");

CREATE TABLE "event_eligibility" (
    "eligibility_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "cycle_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'eligible',
    "granted_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_eligibility_pkey" PRIMARY KEY ("eligibility_id")
);

CREATE UNIQUE INDEX "event_eligibility_player_id_event_id_cycle_key_key"
ON "event_eligibility"("player_id", "event_id", "cycle_key");
CREATE INDEX "event_eligibility_event_id_cycle_key_status_idx"
ON "event_eligibility"("event_id", "cycle_key", "status");

ALTER TABLE "event_eligibility"
ADD CONSTRAINT "event_eligibility_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE CASCADE ON UPDATE CASCADE;
