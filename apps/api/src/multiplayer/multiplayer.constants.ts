import type {
  RankTitleRewardState,
  RankType,
  RewardBundle,
  SectAlignment,
  TowerActionType,
} from "@nextday/shared";

export const multiplayerConfigVersion = "m4_multiplayer_v1";
export const multiplayerRewardConfigVersion = "reward_m4_v1";
export const rankConfigVersion = "rank_p1_v1";
export const rankRewardConfigVersion = "reward_rank_p1_v1";
export const rankRulesetVersion = "ruleset_p1_rank_v1";
export const rankRewardBoundary =
  "排行奖励只发放荣誉、展示外观、纪元史册和少量绑定材料，不发唯一战力道具，不提高全服贡献倍率";
export const rankAntiBrushRule =
  "排行计算排除延迟结算贡献，标记近期高风险玩家，生产榜、纪元榜和阵营榜不采用客户端提交分数";
export const eraBlessingCapPercent = 1;

export interface TowerConfig {
  towerId: string;
  provinceId: string;
  towerName: string;
  mechanism: string;
  bossName: string;
  materialName: string;
  stateEffect: string;
}

export const towerConfigs: TowerConfig[] = [
  {
    towerId: "tower_xuantie",
    provinceId: "ji",
    towerName: "玄铁塔",
    mechanism: "教学型镇封，裂隙压力低",
    bossName: "玄铁塔灵",
    materialName: "玄铁残片",
    stateEffect: "决定新手州魔潮强度和基础灵脉收益",
  },
  {
    towerId: "tower_lifa",
    provinceId: "yan",
    towerName: "礼法塔",
    mechanism: "宗门协作贡献加权",
    bossName: "礼法司命",
    materialName: "礼器残片",
    stateEffect: "影响宗门任务、仓库额度和宗门建设效率",
  },
  {
    towerId: "tower_chaosheng",
    provinceId: "qing",
    towerName: "潮生塔",
    mechanism: "潮汐周期改变丹药材料产出",
    bossName: "潮生龙影",
    materialName: "丹火材料",
    stateEffect: "影响丹火材料、海妖事件和水脉收益",
  },
  {
    towerId: "tower_geyang",
    provinceId: "xu",
    towerName: "戈阳塔",
    mechanism: "PVP 驻守和战备贡献加权",
    bossName: "戈阳战魂",
    materialName: "战备符",
    stateEffect: "影响资源点争夺、战备材料和阵营战线",
  },
  {
    towerId: "tower_liuguang",
    provinceId: "yang",
    towerName: "琉光塔",
    mechanism: "商路稳定度与交易税联动",
    bossName: "琉光商灵",
    materialName: "商票",
    stateEffect: "影响交易行税率、商票产出和灵田收益",
  },
  {
    towerId: "tower_wanmu",
    provinceId: "jing",
    towerName: "万木塔",
    mechanism: "秘境层数与灵植生长联动",
    bossName: "万木妖母",
    materialName: "内天地种子",
    stateEffect: "影响灵草、妖藤和内天地种子产出",
  },
  {
    towerId: "tower_tianheng",
    provinceId: "yu",
    towerName: "天衡塔",
    mechanism: "阵营差距越大，弱势补偿越强",
    bossName: "天衡执印",
    materialName: "阵眼核心",
    stateEffect: "影响阵营平衡、九州中枢和主线分支",
  },
  {
    towerId: "tower_zhenyue",
    provinceId: "liang",
    towerName: "镇岳塔",
    mechanism: "承伤、炼体、地脉修复加权",
    bossName: "镇岳山君",
    materialName: "地脉石",
    stateEffect: "影响矿材、炼体材料和防御法宝产出",
  },
  {
    towerId: "tower_taichu",
    provinceId: "yong",
    towerName: "太初塔",
    mechanism: "终局封印材料与魔王前置联动",
    bossName: "太初魔影",
    materialName: "太初石",
    stateEffect: "影响最终魔王形态、终局材料和圣遗事件",
  },
];

export interface TowerActionConfig {
  actionType: TowerActionType;
  contribution: number;
  actionPointCost: number;
  reward: RewardBundle;
}

export const towerActionConfigs: Record<TowerActionType, TowerActionConfig> = {
  seal: {
    actionType: "seal",
    contribution: 24,
    actionPointCost: 2,
    reward: {
      spirit_stone: "30",
      items: [{ item_id: "tower_sigil", name: "镇塔符", count: 1, bind_type: "bound" }],
    },
  },
  break: {
    actionType: "break",
    contribution: 24,
    actionPointCost: 2,
    reward: {
      spirit_stone: "30",
      items: [{ item_id: "demon_crystal", name: "九渊残晶", count: 1, bind_type: "bound" }],
    },
  },
  supply: {
    actionType: "supply",
    contribution: 18,
    actionPointCost: 1,
    reward: {
      spirit_stone: "20",
      items: [{ item_id: "array_sand", name: "阵砂", count: 1, bind_type: "bound" }],
    },
  },
  guard: {
    actionType: "guard",
    contribution: 20,
    actionPointCost: 2,
    reward: {
      spirit_stone: "24",
      items: [{ item_id: "battle_mark", name: "战备符", count: 1, bind_type: "bound" }],
    },
  },
};

export const maxTowerActionBatch = 5;

export const bossConfig = {
  bossId: "boss_liezhen_zhuhai",
  name: "礼冢诸怀",
  totalHp: 5000,
  actionPointCost: 3,
  reward: {
    spirit_stone: "80",
    items: [{ item_id: "artifact_soul", name: "器魂", count: 1, bind_type: "bound" }],
  },
};

export const sectCreateCost = 300n;
export const sectTaskConfigs = [
  {
    taskId: "sect_patrol",
    name: "灵脉巡护",
    contribution: 40,
    fundGain: 80n,
    reward: { spirit_stone: "60" },
  },
  {
    taskId: "sect_tower_supply",
    name: "九塔补给",
    contribution: 50,
    fundGain: 100n,
    reward: {
      spirit_stone: "70",
      items: [{ item_id: "tower_sigil", name: "镇塔符", count: 1, bind_type: "bound" }],
    },
  },
];

export const validSectAlignments: SectAlignment[] = ["immortal", "demon", "neutral"];
export const sectWarehouseWhitelist = new Set([
  "low_herb",
  "raw_iron",
  "pill_dust",
  "artifact_soul",
  "array_sand",
  "battle_mark",
]);

export const resourcePointConfigs = [
  { resourcePointId: "resource_ji_mine", provinceId: "ji", name: "冀州玄铁脉" },
  { resourcePointId: "resource_yan_array", provinceId: "yan", name: "兖州礼阵台" },
  { resourcePointId: "resource_qing_tide", provinceId: "qing", name: "青州潮汐渡" },
  { resourcePointId: "resource_xu_front", provinceId: "xu", name: "徐州戈阳关" },
  { resourcePointId: "resource_yang_trade", provinceId: "yang", name: "扬州琉光商路" },
  { resourcePointId: "resource_jing_grove", provinceId: "jing", name: "荆州万木药泽" },
  { resourcePointId: "resource_yu_eye", provinceId: "yu", name: "豫州天衡阵眼" },
  { resourcePointId: "resource_liang_vein", provinceId: "liang", name: "梁州镇岳地脉" },
  { resourcePointId: "resource_yong_relic", provinceId: "yong", name: "雍州太初遗迹" },
];

export const pvpActionPointCost = 2;
export const rankRewardPreview: Record<RankType, RewardBundle> = {
  personal: {
    spirit_stone: "300",
    items: [{ item_id: "tower_sigil", name: "镇塔符", count: 2, bind_type: "bound" }],
  },
  sect: {
    spirit_stone: "500",
    items: [{ item_id: "array_sand", name: "阵砂", count: 3, bind_type: "bound" }],
  },
  pvp_week: {
    spirit_stone: "300",
    items: [{ item_id: "battle_mark", name: "战备符", count: 2, bind_type: "bound" }],
  },
  tower_week: {
    spirit_stone: "300",
    items: [{ item_id: "tower_sigil", name: "镇塔符", count: 2, bind_type: "bound" }],
  },
  production: {
    spirit_stone: "260",
    items: [{ item_id: "pill_dust", name: "丹尘", count: 3, bind_type: "bound" }],
  },
  era: {
    spirit_stone: "360",
    items: [{ item_id: "era_medal", name: "纪元铭牌", count: 1, bind_type: "bound" }],
  },
  inner_world: {
    spirit_stone: "260",
    items: [{ item_id: "inner_seed", name: "内天地种子", count: 2, bind_type: "bound" }],
  },
  faction: {
    spirit_stone: "320",
    items: [{ item_id: "faction_seal", name: "阵营印信", count: 1, bind_type: "bound" }],
  },
};

export const supportedRankTypes: RankType[] = [
  "personal",
  "sect",
  "pvp_week",
  "tower_week",
  "production",
  "era",
  "inner_world",
  "faction",
];

export const rankTitleRewards: RankTitleRewardState[] = [
  {
    title_id: "title_era_jiuzhou_ming",
    name: "九州纪名",
    appearance_id: "title_era_jiuzhou_ming",
    rank_type: "era",
    min_rank: 3,
    inherited: true,
    blessing_percent: 1,
    source_type: "era_rank",
  },
  {
    title_id: "title_production_danqi_shuangjue",
    name: "丹器双绝",
    appearance_id: "title_production_danqi_shuangjue",
    rank_type: "production",
    min_rank: 3,
    inherited: true,
    blessing_percent: 1,
    source_type: "era_rank",
  },
  {
    title_id: "title_inner_world_zaohua",
    name: "造化洞主",
    appearance_id: "title_inner_world_zaohua",
    rank_type: "inner_world",
    min_rank: 3,
    inherited: true,
    blessing_percent: 1,
    source_type: "era_rank",
  },
  {
    title_id: "title_faction_tianheng",
    name: "天衡执名",
    appearance_id: "title_faction_tianheng",
    rank_type: "faction",
    min_rank: 1,
    inherited: true,
    blessing_percent: 1,
    source_type: "era_rank",
  },
];

export function getCurrentWeekKey(date = new Date()): string {
  const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOffset = Math.floor((date.getTime() - firstDay.getTime()) / (24 * 60 * 60 * 1000));
  const week = Math.floor((dayOffset + firstDay.getUTCDay()) / 7) + 1;
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
