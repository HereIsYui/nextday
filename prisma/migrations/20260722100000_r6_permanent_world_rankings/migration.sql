CREATE TABLE "world_cycle_settlement" (
    "settlement_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "cycle_type" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'settled',
    "ranking_snapshot" JSONB NOT NULL,
    "config_version" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "world_cycle_settlement_pkey" PRIMARY KEY ("settlement_id")
);

CREATE TABLE "world_cycle_reward" (
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
    CONSTRAINT "world_cycle_reward_pkey" PRIMARY KEY ("reward_id")
);

CREATE TABLE "world_chronicle_event" (
    "event_id" TEXT NOT NULL,
    "era_id" TEXT NOT NULL DEFAULT 'era_mvp_001',
    "province_id" TEXT,
    "sect_id" TEXT,
    "player_id" TEXT,
    "event_type" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "snapshot" JSONB,
    "visibility_rule" TEXT NOT NULL DEFAULT 'server',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "world_chronicle_event_pkey" PRIMARY KEY ("event_id")
);

CREATE UNIQUE INDEX "world_cycle_settlement_era_id_cycle_type_period_key_key"
ON "world_cycle_settlement"("era_id", "cycle_type", "period_key");
CREATE INDEX "world_cycle_settlement_cycle_type_ended_at_idx"
ON "world_cycle_settlement"("cycle_type", "ended_at");
CREATE INDEX "world_cycle_settlement_era_id_settled_at_idx"
ON "world_cycle_settlement"("era_id", "settled_at");
CREATE UNIQUE INDEX "world_cycle_reward_claim_key_key" ON "world_cycle_reward"("claim_key");
CREATE UNIQUE INDEX "world_cycle_reward_settlement_id_player_id_key"
ON "world_cycle_reward"("settlement_id", "player_id");
CREATE INDEX "world_cycle_reward_player_id_status_idx" ON "world_cycle_reward"("player_id", "status");
CREATE INDEX "world_cycle_reward_rank_no_idx" ON "world_cycle_reward"("rank_no");
CREATE UNIQUE INDEX "world_chronicle_event_era_id_source_type_source_id_key"
ON "world_chronicle_event"("era_id", "source_type", "source_id");
CREATE INDEX "world_chronicle_event_era_id_occurred_at_idx"
ON "world_chronicle_event"("era_id", "occurred_at");
CREATE INDEX "world_chronicle_event_province_id_occurred_at_idx"
ON "world_chronicle_event"("province_id", "occurred_at");
CREATE INDEX "world_chronicle_event_sect_id_occurred_at_idx"
ON "world_chronicle_event"("sect_id", "occurred_at");
CREATE INDEX "world_chronicle_event_player_id_occurred_at_idx"
ON "world_chronicle_event"("player_id", "occurred_at");
CREATE INDEX "world_chronicle_event_event_type_idx" ON "world_chronicle_event"("event_type");

ALTER TABLE "world_cycle_reward" ADD CONSTRAINT "world_cycle_reward_settlement_id_fkey"
FOREIGN KEY ("settlement_id") REFERENCES "world_cycle_settlement"("settlement_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "world_cycle_reward" ADD CONSTRAINT "world_cycle_reward_player_id_fkey"
FOREIGN KEY ("player_id") REFERENCES "player"("player_id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "world_cycle_settlement" (
    "settlement_id", "era_id", "cycle_type", "period_key", "status", "ranking_snapshot",
    "config_version", "started_at", "ended_at", "settled_at", "created_at"
)
SELECT
    "settlement_id", "era_id", 'legacy', "season_id", 'archived', "final_snapshot",
    "config_version", "created_at", "settled_at", "settled_at", "created_at"
FROM "war_season_settlement"
ON CONFLICT ("era_id", "cycle_type", "period_key") DO NOTHING;

INSERT INTO "world_cycle_reward" (
    "reward_id", "settlement_id", "player_id", "rank_no", "merit", "reward_snapshot",
    "status", "claim_key", "created_at", "claimed_at"
)
SELECT
    "reward_id", "settlement_id", "player_id", "rank_no", "merit", "reward_snapshot",
    "status", "claim_key", "created_at", "claimed_at"
FROM "war_season_reward"
ON CONFLICT ("settlement_id", "player_id") DO NOTHING;

INSERT INTO "world_chronicle_event" (
    "event_id", "era_id", "event_type", "source_type", "source_id", "title", "summary",
    "highlights", "snapshot", "visibility_rule", "occurred_at", "created_at"
)
SELECT
    'legacy_settlement_' || "settlement_id", "era_id", 'legacy_settlement',
    'war_season_settlement', "settlement_id", '历史世界快照',
    '历史版本的结算快照已归入九州大事记，不再触发世界重置。',
    jsonb_build_array('历史结算数据已保留为只读记录。'), "final_snapshot", 'server',
    "settled_at", "created_at"
FROM "war_season_settlement"
ON CONFLICT ("era_id", "source_type", "source_id") DO NOTHING;

INSERT INTO "world_chronicle_event" (
    "event_id", "era_id", "event_type", "source_type", "source_id", "title", "summary",
    "highlights", "snapshot", "visibility_rule", "occurred_at", "created_at"
)
SELECT
    'legacy_chronicle_' || "chronicle_id", "era_id", 'legacy_chronicle',
    'era_chronicle_record', "chronicle_id",
    COALESCE("public_summary" ->> 'title', '九州旧录'),
    COALESCE("public_summary" ->> 'summary', '历史记录已归入九州大事记。'),
    COALESCE("public_summary" -> 'highlights', '[]'::jsonb), "public_summary", "visibility_rule",
    "created_at", "created_at"
FROM "era_chronicle_record"
ON CONFLICT ("era_id", "source_type", "source_id") DO NOTHING;

-- 历史赛季中尚未领取的普通资源直接补入主城，并留下迁移审计记录。
WITH legacy_rewards AS (
    SELECT
        reward."player_id",
        SUM(COALESCE((reward."reward_snapshot" ->> 'spirit_stone')::numeric, 0)) AS spirit_stone,
        SUM(COALESCE((reward."reward_snapshot" ->> 'grain')::numeric, 0)) AS grain,
        SUM(COALESCE((reward."reward_snapshot" ->> 'ore')::numeric, 0)) AS ore,
        SUM(COALESCE((reward."reward_snapshot" ->> 'wood')::numeric, 0)) AS wood,
        SUM(COALESCE((reward."reward_snapshot" ->> 'herb')::numeric, 0)) AS herb,
        ARRAY_AGG(reward."reward_id") AS reward_ids
    FROM "war_season_reward" reward
    WHERE reward."status" = 'claimable'
    GROUP BY reward."player_id"
), credited_cities AS (
    UPDATE "player_city" city
    SET "resource_snapshot" = city."resource_snapshot" || jsonb_build_object(
        'spirit_stone', (COALESCE((city."resource_snapshot" ->> 'spirit_stone')::numeric, 0) + reward.spirit_stone)::text,
        'grain', (COALESCE((city."resource_snapshot" ->> 'grain')::numeric, 0) + reward.grain)::text,
        'ore', (COALESCE((city."resource_snapshot" ->> 'ore')::numeric, 0) + reward.ore)::text,
        'wood', (COALESCE((city."resource_snapshot" ->> 'wood')::numeric, 0) + reward.wood)::text,
        'herb', (COALESCE((city."resource_snapshot" ->> 'herb')::numeric, 0) + reward.herb)::text
    )
    FROM legacy_rewards reward
    WHERE city."player_id" = reward."player_id" AND city."city_type" = 'main'
    RETURNING
        city."city_id",
        city."player_id" AS "credited_player_id",
        reward.spirit_stone,
        reward.grain,
        reward.ore,
        reward.wood,
        reward.herb,
        reward.reward_ids
)
INSERT INTO "audit_log" (
    "audit_log_id", "account_id", "player_id", "action", "target_type", "target_id",
    "after_snapshot", "reason", "config_version", "created_at"
)
SELECT
    'audit_legacy_reward_' || credited."credited_player_id",
    player."account_id",
    credited."credited_player_id",
    'legacy_world_reward_credit',
    'player_city',
    credited."city_id",
    jsonb_build_object(
        'reward_ids', credited.reward_ids,
        'spirit_stone', credited.spirit_stone,
        'grain', credited.grain,
        'ore', credited.ore,
        'wood', credited.wood,
        'herb', credited.herb
    ),
    '历史赛季未领取的普通资源已一次性补入主城。',
    'world_cycle_r6_001',
    CURRENT_TIMESTAMP
FROM credited_cities credited
JOIN "player" player ON player."player_id" = credited."credited_player_id";

UPDATE "world_cycle_reward" reward
SET
    "status" = 'claimed',
    "claim_key" = 'legacy_credit_' || reward."reward_id",
    "claimed_at" = CURRENT_TIMESTAMP
FROM "world_cycle_settlement" settlement, "player_city" city
WHERE reward."settlement_id" = settlement."settlement_id"
  AND city."player_id" = reward."player_id"
  AND city."city_type" = 'main'
  AND settlement."cycle_type" = 'legacy'
  AND reward."status" = 'claimable';
