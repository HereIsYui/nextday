CREATE TABLE "appearance_ownership_record" (
    "ownership_record_id" TEXT NOT NULL,
    "owner_type" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "player_id" TEXT,
    "sect_id" TEXT,
    "appearance_id" TEXT NOT NULL,
    "appearance_type" TEXT NOT NULL,
    "display_slot" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_record_id" TEXT,
    "inherited" BOOLEAN NOT NULL DEFAULT false,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "limited" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3),
    "preview_payload" JSONB NOT NULL,
    "permission_snapshot" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "ruleset_version" TEXT NOT NULL,
    "reward_boundary_version" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appearance_ownership_record_pkey" PRIMARY KEY ("ownership_record_id")
);

CREATE UNIQUE INDEX "appearance_ownership_record_owner_type_owner_id_appearance_id_key" ON "appearance_ownership_record"("owner_type", "owner_id", "appearance_id");
CREATE UNIQUE INDEX "appearance_ownership_record_idempotency_key_key" ON "appearance_ownership_record"("idempotency_key");
CREATE INDEX "appearance_ownership_record_owner_type_owner_id_idx" ON "appearance_ownership_record"("owner_type", "owner_id");
CREATE INDEX "appearance_ownership_record_player_id_idx" ON "appearance_ownership_record"("player_id");
CREATE INDEX "appearance_ownership_record_sect_id_idx" ON "appearance_ownership_record"("sect_id");
CREATE INDEX "appearance_ownership_record_appearance_type_idx" ON "appearance_ownership_record"("appearance_type");
CREATE INDEX "appearance_ownership_record_display_slot_idx" ON "appearance_ownership_record"("display_slot");
CREATE INDEX "appearance_ownership_record_source_type_idx" ON "appearance_ownership_record"("source_type");
CREATE INDEX "appearance_ownership_record_equipped_idx" ON "appearance_ownership_record"("equipped");
CREATE INDEX "appearance_ownership_record_expires_at_idx" ON "appearance_ownership_record"("expires_at");

ALTER TABLE "appearance_ownership_record" ADD CONSTRAINT "appearance_ownership_record_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appearance_ownership_record" ADD CONSTRAINT "appearance_ownership_record_sect_id_fkey" FOREIGN KEY ("sect_id") REFERENCES "sect"("sect_id") ON DELETE SET NULL ON UPDATE CASCADE;
