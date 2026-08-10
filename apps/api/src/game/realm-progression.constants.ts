import type {
  CultivationRoute,
  RealmProgressionResponse,
  RealmUnlockFeatureState,
} from "@nextday/shared";

export const realmProgressionConfigVersion = "realm_article_v2";
export const maximumRealm = 9;
export const stagesPerRealm = 3;

/** 兼容旧调用方；新的等级判断必须使用当前境界的 stage.levelCount。 */
export const levelsPerRealm = 3;

export interface RealmStageConfig {
  stageId: number;
  qiName: string;
  bodyName: string;
  levelCount: number;
}

export interface RealmProgressionConfig {
  realmId: number;
  qiName: string;
  bodyName: string;
  targetDays: number;
  standardDailyCultivation: number;
  realmBudget: number;
  breakthroughCultivation: number;
  powerBonusPercent: number;
  stages: RealmStageConfig[];
  levelRequirements: number[];
  unlocks: Array<Omit<RealmUnlockFeatureState, "unlocked">>;
}

type RealmUnlockDefinition = Omit<RealmUnlockFeatureState, "required_realm" | "unlocked">;
type StageNames = readonly [string, string, string];

const qiStageNames: StageNames[] = [
  ["感应", "通脉", "周天"],
  ["凝液", "稳固", "圆满"],
  ["虚丹", "实丹", "金丹"],
  ["破丹", "凝婴", "元婴"],
  ["神游", "化念", "融道"],
  ["窥虚", "融虚", "炼虚"],
  ["神肉相融", "不分彼此", "圆满无漏"],
  ["法力圆满", "道法自然", "渡劫"],
  ["伪仙", "真仙", "仙君"],
];

const bodyStageNames: StageNames[] = [
  ["淬皮", "锻骨", "换血"],
  ["凝血", "固脉", "圆满"],
  ["虚血", "实血", "血丹"],
  ["破丹", "凝胎", "武胎"],
  ["通神", "化念", "融道"],
  ["窥虚", "融虚", "破虚"],
  ["神肉相融", "不分彼此", "圆满无漏"],
  ["精元圆满", "道法自然", "渡劫"],
  ["伪魔", "真魔", "魔君"],
];

const realmSchedules = [
  { targetDays: 20, standardDailyCultivation: 100 },
  { targetDays: 35, standardDailyCultivation: 260 },
  { targetDays: 50, standardDailyCultivation: 720 },
  { targetDays: 55, standardDailyCultivation: 1_850 },
  { targetDays: 55, standardDailyCultivation: 4_600 },
  { targetDays: 55, standardDailyCultivation: 10_500 },
  { targetDays: 45, standardDailyCultivation: 23_000 },
  { targetDays: 35, standardDailyCultivation: 48_000 },
  { targetDays: 10, standardDailyCultivation: 92_000 },
] as const;

export const realmProgressionConfigs: RealmProgressionConfig[] = [
  realm(1, "练气", "锻体", 0, [
    unlock("province_explore", "州域游历", "前往已开启州域探索，收集修行材料。"),
    unlock("basic_production", "丹器试炼", "尝试材料搭配，发现自己的丹方与器方。"),
  ]),
  realm(2, "筑基", "筑身", 8, [
    unlock("formula_publication", "单方传阅", "可将成功单方公开给其他修士参阅。"),
    unlock("tower_support", "九塔支援", "可向州域封印塔提交镇封、破封或补给行动。"),
  ]),
  realm(3, "金丹", "血丹", 18, [
    unlock("advanced_production", "高阶丹器", "可尝试更复杂的材料组合与词条倾向。"),
    unlock("sect_practice", "宗门修行", "参与宗门任务、仓库与同道协作。"),
  ]),
  realm(4, "元婴", "武胎", 30, [
    unlock("province_events", "州域异闻", "解锁更深州域探索与章节异闻。"),
  ]),
  realm(5, "化神", "神躯", 44, [unlock("inner_world", "内天地", "开辟内天地，派遣生灵支援州域。")]),
  realm(6, "炼虚", "破虚", 60, [
    unlock("distant_travel", "远州游历", "可深入高阶州域与圣遗秘境。"),
  ]),
  realm(7, "合体", "天躯", 78, [
    unlock("faction_path", "仙魔抉择", "选择阵营路线，改变后续章节叙事。"),
  ]),
  realm(8, "大乘", "极境", 98, [unlock("tower_core", "九塔核心", "参与高阶封印事件与终局前置。")]),
  realm(9, "真仙", "真魔", 120, [unlock("era_finale", "纪元终局", "参与纪元终局路线与史册留名")]),
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

export function getRealmStageConfig(
  realmId: number,
  stageId: number,
  route: CultivationRoute,
): RealmStageConfig {
  const config = getRealmConfig(realmId);
  const stage = config.stages[stageId - 1] ?? config.stages[0];
  if (!stage) throw new Error("境界小境界配置为空");
  return {
    ...stage,
    qiName: route === "qi" ? stage.qiName : stage.bodyName,
    bodyName: route === "qi" ? stage.qiName : stage.bodyName,
  };
}

export function getStageLevelCount(realmId: number): number {
  return getRealmConfig(realmId).stages[0]?.levelCount ?? 3;
}

export function getTotalLevelCount(realmId: number): number {
  return getRealmConfig(realmId).stages.reduce((total, stage) => total + stage.levelCount, 0);
}

export function getLevelRequirement(realmId: number, stageId: number, level: number): bigint {
  const config = getRealmConfig(realmId);
  const stage = config.stages[stageId - 1];
  if (!stage || level < 1 || level > stage.levelCount) {
    throw new Error("小境界等级超出范围");
  }
  const index =
    config.stages.slice(0, stageId - 1).reduce((total, current) => total + current.levelCount, 0) +
    level -
    1;
  return BigInt(config.levelRequirements[index] ?? 0);
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

export function getRealmProgression(route: CultivationRoute): RealmProgressionResponse {
  return {
    route,
    maximum_realm: maximumRealm,
    stages_per_realm: stagesPerRealm,
    realms: realmProgressionConfigs.map((config) => ({
      realm_id: config.realmId,
      qi_name: config.qiName,
      body_name: config.bodyName,
      target_days: config.targetDays,
      standard_daily_cultivation: config.standardDailyCultivation,
      realm_budget: String(config.realmBudget),
      min_level: 1,
      max_level: getStageLevelCount(config.realmId),
      stages: config.stages.map((stage) => ({
        stage_id: stage.stageId,
        qi_name: route === "qi" ? stage.qiName : stage.bodyName,
        body_name: stage.bodyName,
        level_count: stage.levelCount,
        levels: Array.from({ length: stage.levelCount }, (_, index) => ({
          level: index + 1,
          cultivation_required: getLevelRequirement(
            config.realmId,
            stage.stageId,
            index + 1,
          ).toString(),
        })),
      })),
      breakthrough_cultivation: String(config.breakthroughCultivation),
      power_bonus_percent: config.powerBonusPercent,
      unlocks: config.unlocks,
    })),
    config_version: realmProgressionConfigVersion,
  };
}

function realm(
  realmId: number,
  qiName: string,
  bodyName: string,
  powerBonusPercent: number,
  unlocks: RealmUnlockDefinition[],
): RealmProgressionConfig {
  const schedule = realmSchedules[realmId - 1];
  if (!schedule) throw new Error(`缺少第 ${realmId} 境节奏配置`);
  // 真仙/真魔的小境界按设定扩展到 12 级，其余境界从 3 级递增到 10 级。
  const levelCountPerStage = realmId === maximumRealm ? 12 : realmId + 2;
  const realmBudget = schedule.targetDays * schedule.standardDailyCultivation;
  const breakthroughCultivation = realmId === maximumRealm ? 0 : Math.round(realmBudget * 0.15);
  const stages = createStages(realmId, levelCountPerStage);

  return {
    realmId,
    qiName,
    bodyName,
    targetDays: schedule.targetDays,
    standardDailyCultivation: schedule.standardDailyCultivation,
    realmBudget,
    breakthroughCultivation,
    powerBonusPercent,
    stages,
    levelRequirements: distributeLevelRequirements(
      realmBudget - breakthroughCultivation,
      stages.reduce((total, stage) => total + stage.levelCount, 0),
    ),
    unlocks: unlocks.map((feature) => ({ ...feature, required_realm: realmId })),
  };
}

function createStages(realmId: number, levelCount: number): RealmStageConfig[] {
  const qiNames = qiStageNames[realmId - 1];
  const bodyNames = bodyStageNames[realmId - 1];
  if (!qiNames || !bodyNames) throw new Error(`缺少第 ${realmId} 境小境界名称`);
  return qiNames.map((qiName, index) => ({
    stageId: index + 1,
    qiName,
    bodyName: bodyNames[index],
    levelCount,
  }));
}

function distributeLevelRequirements(total: number, levelCount: number): number[] {
  if (levelCount <= 0) return [];
  const weights = Array.from(
    { length: levelCount },
    (_, index) => 1 + (0.8 * index) / Math.max(1, levelCount - 1),
  );
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = weights.map((weight) => (total * weight) / weightTotal);
  const result = raw.map((value) => Math.floor(value));
  let remainder = total - result.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; remainder > 0; index += 1) {
    const target = order[index % order.length];
    if (!target) break;
    result[target.index] += 1;
    remainder -= 1;
  }
  return result;
}

function unlock(featureId: string, label: string, description: string): RealmUnlockDefinition {
  return { feature_id: featureId, label, description };
}
