import type { RealmUnlockFeatureState } from "@nextday/shared";

export const realmProgressionConfigVersion = "realm_r2_001";
export const maximumRealm = 9;
export const levelsPerRealm = 9;

export interface RealmProgressionConfig {
  realmId: number;
  qiName: string;
  bodyName: string;
  breakthroughCultivation: number;
  powerBonusPercent: number;
  unlocks: Array<Omit<RealmUnlockFeatureState, "unlocked">>;
}

type RealmUnlockDefinition = Omit<RealmUnlockFeatureState, "required_realm" | "unlocked">;

export const realmProgressionConfigs: RealmProgressionConfig[] = [
  realm(1, "练气", "锻体", 600, 0, [
    unlock("world_map", "九州地图", "建城、清野、购地与基础行军"),
    unlock("basic_army", "基础军队", "训练道兵、均衡阵与主城先锋"),
  ]),
  realm(2, "筑基", "筑身", 900, 8, [
    unlock("sub_city", "分城与药园", "建立首座分城并经营灵草"),
    unlock("defense_formation", "守御军阵", "守御都尉、守御阵与协防行军"),
  ]),
  realm(3, "金丹", "血丹", 1300, 18, [
    unlock("siege", "围城准备", "破阵阵、攻城器械与资源掠夺资格"),
    unlock("advanced_production", "丹器战略补给", "高阶炼丹、炼器与军队补给"),
  ]),
  realm(4, "元婴", "武胎", 1800, 30, [
    unlock("sect_rally", "宗门集结", "跨郡增援、协防与集结队伍"),
  ]),
  realm(5, "化神", "神躯", 2500, 44, [
    unlock("province_scout", "跨州侦察", "观察敌州城池与九塔态势"),
  ]),
  realm(6, "炼虚", "破虚", 3400, 60, [unlock("teleport_array", "传送阵", "远程增援与围城调度")]),
  realm(7, "合体", "天躯", 4500, 78, [
    unlock("province_governance", "州府治理", "州内治理、外交与高级宗门职位"),
  ]),
  realm(8, "大乘", "极境", 5800, 98, [unlock("war_command", "州战指挥", "州府与九塔核心指挥资格")]),
  realm(9, "真仙", "真魔", 0, 120, [
    unlock("era_finale", "纪元终局", "参与纪元终局路线与史册留名"),
  ]),
];

export function getRealmConfig(realmId: number): RealmProgressionConfig {
  const config = realmProgressionConfigs.find((realmConfig) => realmConfig.realmId === realmId);
  const fallback = realmProgressionConfigs[0];
  if (!fallback) throw new Error("境界配置为空");
  return config ?? fallback;
}

export function getRealmName(realmId: number, route: string): string {
  const config = getRealmConfig(realmId);
  return route === "body" ? config.bodyName : config.qiName;
}

export function getRealmUnlockStates(currentRealm: number): RealmUnlockFeatureState[] {
  return realmProgressionConfigs.flatMap((config) =>
    config.unlocks.map((feature) => ({
      ...feature,
      unlocked: currentRealm >= feature.required_realm,
    })),
  );
}

export function hasRealmFeature(currentRealm: number, featureId: string): boolean {
  return getRealmUnlockStates(currentRealm).some(
    (feature) => feature.feature_id === featureId && feature.unlocked,
  );
}

function realm(
  realmId: number,
  qiName: string,
  bodyName: string,
  breakthroughCultivation: number,
  powerBonusPercent: number,
  unlocks: RealmUnlockDefinition[],
): RealmProgressionConfig {
  return {
    realmId,
    qiName,
    bodyName,
    breakthroughCultivation,
    powerBonusPercent,
    unlocks: unlocks.map((feature) => ({ ...feature, required_realm: realmId })),
  };
}

function unlock(featureId: string, label: string, description: string): RealmUnlockDefinition {
  return { feature_id: featureId, label, description };
}
