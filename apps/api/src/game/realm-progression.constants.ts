import type { RealmUnlockFeatureState } from "@nextday/shared";

export const realmProgressionConfigVersion = "realm_text_v1";
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
    unlock("province_explore", "州域游历", "前往已开启州域探索，收集修行材料。"),
    unlock("basic_production", "丹器试炼", "尝试材料搭配，发现自己的丹方与器方。"),
  ]),
  realm(2, "筑基", "筑身", 900, 8, [
    unlock("formula_publication", "单方传阅", "可将成功单方公开给其他修士参阅。"),
    unlock("tower_support", "九塔支援", "可向州域封印塔提交镇封、破封或补给行动。"),
  ]),
  realm(3, "金丹", "血丹", 1300, 18, [
    unlock("advanced_production", "高阶丹器", "可尝试更复杂的材料组合与词条倾向。"),
    unlock("sect_practice", "宗门修行", "参与宗门任务、仓库与同道协作。"),
  ]),
  realm(4, "元婴", "武胎", 1800, 30, [
    unlock("province_events", "州域异闻", "解锁更深州域探索与章节异闻。"),
  ]),
  realm(5, "化神", "神躯", 2500, 44, [
    unlock("inner_world", "内天地", "开辟内天地，派遣生灵支援州域。"),
  ]),
  realm(6, "炼虚", "破虚", 3400, 60, [
    unlock("distant_travel", "远州游历", "可深入高阶州域与圣遗秘境。"),
  ]),
  realm(7, "合体", "天躯", 4500, 78, [
    unlock("faction_path", "仙魔抉择", "选择阵营路线，改变后续章节叙事。"),
  ]),
  realm(8, "大乘", "极境", 5800, 98, [
    unlock("tower_core", "九塔核心", "参与高阶封印事件与终局前置。"),
  ]),
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
