-- 此迁移不可逆：文字修行版本不再保留资源点战略控制与玩家攻击链路。
-- 已发放的灵石、材料和装备保持在玩家钱包与背包中，不回收历史收益。

-- 清理依赖旧攻击记录的可重放、叙事、风控与延迟结算数据。
DELETE FROM "delayed_settlement_record"
WHERE "source_type" = 'pvp_attack';

DELETE FROM "behavior_risk_record"
WHERE "risk_domain" = 'pvp'
   OR "source_record_id" IN (SELECT "record_id" FROM "pvp_battle_record");

DELETE FROM "player_journal_entry"
WHERE "source_type" = '资源点争夺';

DELETE FROM "behavior_log"
WHERE "path" = '/api/multiplayer/pvp/attack'
   OR "path" = '/api/multiplayer/resource-points';

DELETE FROM "idempotency_record"
WHERE "endpoint" = 'POST /api/multiplayer/pvp/attack';

-- pvp_week 只由旧攻击积分生成，删除其快照及明细，避免历史榜单继续暴露。
DELETE FROM "rank_entry"
WHERE "rank_snapshot_id" IN (
  SELECT "rank_snapshot_id"
  FROM "rank_snapshot"
  WHERE "rank_type" = 'pvp_week'
);

DELETE FROM "rank_snapshot"
WHERE "rank_type" = 'pvp_week';

DELETE FROM "config_version"
WHERE "config_type" = 'pvp';

-- 攻击记录依赖资源点，必须先删除攻击表再删除资源点战略状态表。
DROP TABLE "pvp_battle_record";
DROP TABLE "resource_point_state";
