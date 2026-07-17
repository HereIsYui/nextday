CREATE TABLE "war_season_settlement" (
    "settlement_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "season_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'settled',
    "final_snapshot" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "settled_by" TEXT NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "war_season_settlement_pkey" PRIMARY KEY ("settlement_id")
);

CREATE TABLE "war_season_reward" (
    "reward_id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "rank_no" INTEGER NOT NULL,
    "merit" INTEGER NOT NULL,
    "reward_snapshot" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'claimable',
    "claim_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    CONSTRAINT "war_season_reward_pkey" PRIMARY KEY ("reward_id")
);

CREATE UNIQUE INDEX "war_season_settlement_season_id_key" ON "war_season_settlement"("season_id");
CREATE UNIQUE INDEX "war_season_settlement_idempotency_key_key" ON "war_season_settlement"("idempotency_key");
CREATE INDEX "war_season_settlement_era_id_status_idx" ON "war_season_settlement"("era_id", "status");
CREATE INDEX "war_season_settlement_settled_at_idx" ON "war_season_settlement"("settled_at");
CREATE UNIQUE INDEX "war_season_reward_claim_key_key" ON "war_season_reward"("claim_key");
CREATE UNIQUE INDEX "war_season_reward_settlement_id_player_id_key" ON "war_season_reward"("settlement_id", "player_id");
CREATE INDEX "war_season_reward_player_id_status_idx" ON "war_season_reward"("player_id", "status");
CREATE INDEX "war_season_reward_rank_no_idx" ON "war_season_reward"("rank_no");

ALTER TABLE "war_season_reward" ADD CONSTRAINT "war_season_reward_settlement_id_fkey"
FOREIGN KEY ("settlement_id") REFERENCES "war_season_settlement"("settlement_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "war_season_reward" ADD CONSTRAINT "war_season_reward_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;
