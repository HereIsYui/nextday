import type { InnerWorldSupportType, RewardBundle } from "@nextday/shared";

export const innerWorldConfigVersion = "inner_world_p1_v1";
export const innerWorldRewardConfigVersion = "reward_inner_world_p1_v1";
export const innerWorldUnlockRealm = 5;
export const innerWorldUnlockChapter = 4;
export const innerWorldDefaultAssignmentMinutes = 60;
export const innerWorldDailySupportLimit = 3;

export interface InnerWorldLevelConfig {
  level: number;
  assignmentLimit: number;
  creatureCapacity: number;
  nextLawExpRequired: number;
  upgradeCost: RewardBundle;
}

export const innerWorldLevelConfigs: InnerWorldLevelConfig[] = [
  {
    level: 1,
    assignmentLimit: 1,
    creatureCapacity: 3,
    nextLawExpRequired: 30,
    upgradeCost: {
      spirit_stone: "120",
      items: [{ item_id: "inner_seed", name: "洞天种子", count: 1, bind_type: "bound" }],
    },
  },
  {
    level: 2,
    assignmentLimit: 2,
    creatureCapacity: 4,
    nextLawExpRequired: 80,
    upgradeCost: {
      spirit_stone: "260",
      items: [{ item_id: "inner_seed", name: "洞天种子", count: 2, bind_type: "bound" }],
    },
  },
  {
    level: 3,
    assignmentLimit: 3,
    creatureCapacity: 5,
    nextLawExpRequired: 160,
    upgradeCost: {
      spirit_stone: "520",
      items: [{ item_id: "law_dust", name: "法则尘", count: 3, bind_type: "bound" }],
    },
  },
];

export interface InnerWorldCreatureConfig {
  creatureType: string;
  name: string;
  affinityProvinceId: string | null;
  bonusSummary: Record<string, unknown>;
}

export const innerWorldCreatureConfigs: InnerWorldCreatureConfig[] = [
  {
    creatureType: "wood_spirit",
    name: "青木灵童",
    affinityProvinceId: "jing",
    bonusSummary: { dispatch_bonus_rate: 8, focus: "灵植与内天地种子" },
  },
  {
    creatureType: "mountain_keeper",
    name: "镇岳山灵",
    affinityProvinceId: "liang",
    bonusSummary: { dispatch_bonus_rate: 6, focus: "地脉石与炼体矿材" },
  },
  {
    creatureType: "star_attendant",
    name: "天衡星侍",
    affinityProvinceId: "yu",
    bonusSummary: { dispatch_bonus_rate: 6, focus: "阵眼核心与法则经验" },
  },
];

export interface InnerWorldProvinceRewardConfig {
  provinceId: string;
  reward: RewardBundle;
  lawExpGain: number;
}

export const innerWorldProvinceRewards: InnerWorldProvinceRewardConfig[] = [
  {
    provinceId: "ji",
    reward: { items: [{ item_id: "low_herb", name: "凝露草", count: 2, bind_type: "bound" }] },
    lawExpGain: 18,
  },
  {
    provinceId: "yan",
    reward: { items: [{ item_id: "array_sand", name: "阵砂", count: 1, bind_type: "bound" }] },
    lawExpGain: 20,
  },
  {
    provinceId: "qing",
    reward: { items: [{ item_id: "low_herb", name: "凝露草", count: 3, bind_type: "bound" }] },
    lawExpGain: 22,
  },
  {
    provinceId: "xu",
    reward: { items: [{ item_id: "battle_mark", name: "战备符", count: 1, bind_type: "bound" }] },
    lawExpGain: 22,
  },
  {
    provinceId: "yang",
    reward: { items: [{ item_id: "spirit_wood", name: "灵木", count: 2, bind_type: "bound" }] },
    lawExpGain: 26,
  },
  {
    provinceId: "jing",
    reward: { items: [{ item_id: "inner_seed", name: "洞天种子", count: 1, bind_type: "bound" }] },
    lawExpGain: 28,
  },
  {
    provinceId: "yu",
    reward: { items: [{ item_id: "law_dust", name: "法则尘", count: 2, bind_type: "bound" }] },
    lawExpGain: 32,
  },
  {
    provinceId: "liang",
    reward: {
      items: [{ item_id: "earth_vein_stone", name: "地脉石", count: 2, bind_type: "bound" }],
    },
    lawExpGain: 34,
  },
  {
    provinceId: "yong",
    reward: { items: [{ item_id: "taichu_stone", name: "太初石", count: 1, bind_type: "bound" }] },
    lawExpGain: 38,
  },
];

export const innerWorldCreatureUpgradeCost: RewardBundle = {
  spirit_stone: "80",
  items: [{ item_id: "law_dust", name: "法则尘", count: 1, bind_type: "bound" }],
};

export const innerWorldSupportConfigs: Record<
  InnerWorldSupportType,
  { label: string; lawExpCost: number; reward: RewardBundle; contribution: number }
> = {
  spirit_vein: {
    label: "灵脉支援",
    lawExpCost: 10,
    reward: { items: [{ item_id: "low_herb", name: "凝露草", count: 2, bind_type: "bound" }] },
    contribution: 12,
  },
  tower_supply: {
    label: "九塔补给",
    lawExpCost: 12,
    reward: { items: [{ item_id: "tower_sigil", name: "镇塔符", count: 1, bind_type: "bound" }] },
    contribution: 16,
  },
  secret_realm: {
    label: "秘境支援",
    lawExpCost: 14,
    reward: { items: [{ item_id: "inner_seed", name: "洞天种子", count: 1, bind_type: "bound" }] },
    contribution: 18,
  },
};

export function getInnerWorldLevelConfig(level: number): InnerWorldLevelConfig {
  return (
    innerWorldLevelConfigs.find((config) => config.level === level) ??
    innerWorldLevelConfigs[innerWorldLevelConfigs.length - 1]
  );
}

export function getInnerWorldProvinceReward(provinceId: string): InnerWorldProvinceRewardConfig {
  return (
    innerWorldProvinceRewards.find((config) => config.provinceId === provinceId) ??
    innerWorldProvinceRewards[0]
  );
}
