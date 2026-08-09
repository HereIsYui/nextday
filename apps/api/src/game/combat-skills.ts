import type { CultivationRoute } from "@nextday/shared";
import { Prisma, type PlayerSkillLoadout } from "@prisma/client";
import { getDefaultSkillLoadout, getSkillName } from "../production/production.constants";

/**
 * 战斗中真正生效的技能快照。
 * 数值刻意保持为小幅修正，技能改变的是战斗过程和克制关系，不会替代境界成长。
 */
export interface CombatSkillSnapshot {
  activeSkillId: string;
  activeSkillName: string;
  treasureSkillId: string;
  treasureSkillName: string;
  damageMultiplier: number;
  defenseMultiplier: number;
  powerBonusPercent: number;
  traitBonusPercent: number;
  reason: string;
}

interface SkillEffect {
  damagePercent: number;
  defensePercent: number;
  counterTraits: string[];
}

const skillEffects: Record<string, SkillEffect> = {
  skill_yuhuo: { damagePercent: 6, defensePercent: 0, counterTraits: ["均衡", "强攻"] },
  skill_lingdun: { damagePercent: 0, defensePercent: 14, counterTraits: ["快攻", "毒蚀"] },
  skill_xiaozhoutian: { damagePercent: 12, defensePercent: 0, counterTraits: ["高防", "护盾"] },
  skill_pozhen_jian: { damagePercent: 10, defensePercent: 0, counterTraits: ["阵痕", "高防"] },
  skill_leihuo_yin: { damagePercent: 16, defensePercent: 0, counterTraits: ["护盾", "术法"] },
  skill_lieshi: { damagePercent: 6, defensePercent: 0, counterTraits: ["均衡", "强攻"] },
  skill_jinshen: { damagePercent: 0, defensePercent: 14, counterTraits: ["快攻", "毒蚀"] },
  skill_xuefei: { damagePercent: 12, defensePercent: 0, counterTraits: ["高防", "护盾"] },
  skill_tieshan_kao: { damagePercent: 10, defensePercent: 0, counterTraits: ["快攻", "强攻"] },
  skill_baxue_zhan: { damagePercent: 16, defensePercent: 0, counterTraits: ["高防", "护盾"] },
  skill_benming_faguang: { damagePercent: 8, defensePercent: 8, counterTraits: ["阵痕", "术法"] },
};

export function getCombatSkillSnapshot(input: {
  route: CultivationRoute | string;
  loadout?: Pick<PlayerSkillLoadout, "activeSkillIds" | "treasureSkillId" | "autoPriority"> | null;
  enemyTraits?: string[];
}): CombatSkillSnapshot {
  const fallback = getDefaultSkillLoadout(input.route === "body" ? "body" : "qi");
  const activeSkillIds = normalizeStringArray(input.loadout?.activeSkillIds, fallback.active_skill_ids);
  const treasureSkillId = input.loadout?.treasureSkillId || fallback.treasure_skill_id;
  const priority = normalizeStringArray(
    input.loadout?.autoPriority,
    [treasureSkillId, ...activeSkillIds],
  );
  const activeSkillId =
    priority.find((skillId) => activeSkillIds.includes(skillId)) ?? activeSkillIds[0] ?? fallback.active_skill_ids[0];
  const active = skillEffects[activeSkillId] ?? { damagePercent: 0, defensePercent: 0, counterTraits: [] };
  const treasure = skillEffects[treasureSkillId] ?? { damagePercent: 0, defensePercent: 0, counterTraits: [] };
  const traits = new Set(input.enemyTraits ?? []);
  const matchedTraits = [...new Set([...active.counterTraits, ...treasure.counterTraits])].filter((trait) =>
    traits.has(trait),
  );
  const traitBonusPercent = matchedTraits.length ? Math.min(12, matchedTraits.length * 6) : 0;
  const powerBonusPercent = active.damagePercent + treasure.damagePercent + traitBonusPercent;
  const defensePercent = Math.min(30, active.defensePercent + treasure.defensePercent);

  return {
    activeSkillId,
    activeSkillName: getSkillName(activeSkillId),
    treasureSkillId,
    treasureSkillName: getSkillName(treasureSkillId),
    damageMultiplier: 1 + powerBonusPercent / 100,
    defenseMultiplier: Math.max(0.7, 1 - defensePercent / 100),
    powerBonusPercent,
    traitBonusPercent,
    reason: matchedTraits.length
      ? `${getSkillName(activeSkillId)}针对${matchedTraits.join("、")}生效，战力修正 +${powerBonusPercent}%`
      : `${getSkillName(activeSkillId)}与${getSkillName(treasureSkillId)}生效，战力修正 +${powerBonusPercent}%`,
  };
}

export function calculateUnifiedCombatPower(input: {
  basePower: number;
  equipmentPower?: number;
  skillSnapshot?: CombatSkillSnapshot;
}): number {
  const equipmentPower = Math.max(0, Math.floor(input.equipmentPower ?? 0));
  const skillMultiplier = input.skillSnapshot?.damageMultiplier ?? 1;
  return Math.max(0, Math.round((input.basePower + equipmentPower) * skillMultiplier));
}

function normalizeStringArray(value: Prisma.JsonValue | undefined, fallback: string[]): string[] {
  const result = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  return result.length ? result : fallback;
}
