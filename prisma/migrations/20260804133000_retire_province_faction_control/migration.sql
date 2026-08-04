-- 州域仅保留探索与九塔叙事，删除仙、魔、中立战略控制摘要。
ALTER TABLE "province_state" DROP COLUMN "faction_control";
