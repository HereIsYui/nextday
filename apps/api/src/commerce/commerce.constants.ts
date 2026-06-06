import type {
  AppearanceType,
  ConvenienceRuleState,
  EntitlementTier,
  GachaCostType,
  GachaPoolType,
  MonthlyCardProductState,
  MonthlyCardType,
  RewardBundle,
} from "@nextday/shared";

export const commerceConfigVersion = "commerce_m5_v1";
export const commerceRewardConfigVersion = "reward_m5_v1";
export const ancientTreasureConfigVersion = "ancient_treasure_m5_v1";

export const ancientTreasurePoolType: GachaPoolType = "ancient_treasure";
export const permanentPoolType: GachaPoolType = "permanent";
export const ancientPageDrawCost = 30;
export const permanentPoolJadeCost = 100n;

export const monthlyCardProducts: Record<MonthlyCardType, MonthlyCardProductState> = {
  small_monthly: {
    product_id: "small_monthly_card",
    card_type: "small_monthly",
    name: "小月卡",
    fishpi_point_cost: "1280",
    duration_days: 30,
    daily_paid_jade: "30",
    daily_bound_jade: "100",
    daily_ancient_draws: 1,
  },
  large_monthly: {
    product_id: "large_monthly_card",
    card_type: "large_monthly",
    name: "大月卡",
    fishpi_point_cost: "3280",
    duration_days: 30,
    daily_paid_jade: "60",
    daily_bound_jade: "200",
    daily_ancient_draws: 2,
  },
};

export const vipBoundJadeRewards: Record<number, number> = {
  0: 0,
  1: 30,
  2: 80,
  3: 150,
  4: 240,
};

export const tierOrder: EntitlementTier[] = [
  "free",
  "vip1",
  "vip2",
  "vip3",
  "small_monthly",
  "vip4",
  "large_monthly",
];

export const convenienceRules: Record<EntitlementTier, ConvenienceRuleState> = {
  free: {
    tier: "free",
    batch_sweep_limit: 5,
    strategy_slots: 1,
    preset_slots: 1,
    automation_queue: "none",
    reward_multiplier: 1,
  },
  vip1: {
    tier: "vip1",
    batch_sweep_limit: 6,
    strategy_slots: 1,
    preset_slots: 1,
    automation_queue: "none",
    reward_multiplier: 1,
  },
  vip2: {
    tier: "vip2",
    batch_sweep_limit: 8,
    strategy_slots: 2,
    preset_slots: 2,
    automation_queue: "none",
    reward_multiplier: 1,
  },
  vip3: {
    tier: "vip3",
    batch_sweep_limit: 10,
    strategy_slots: 3,
    preset_slots: 3,
    automation_queue: "single_play",
    reward_multiplier: 1,
  },
  small_monthly: {
    tier: "small_monthly",
    batch_sweep_limit: 10,
    strategy_slots: 3,
    preset_slots: 3,
    automation_queue: "single_play",
    reward_multiplier: 1,
  },
  vip4: {
    tier: "vip4",
    batch_sweep_limit: 15,
    strategy_slots: 4,
    preset_slots: 6,
    automation_queue: "simple_cross_play",
    reward_multiplier: 1,
  },
  large_monthly: {
    tier: "large_monthly",
    batch_sweep_limit: 20,
    strategy_slots: 5,
    preset_slots: 9,
    automation_queue: "core_daily",
    reward_multiplier: 1,
  },
};

export const gachaPoolConfigs: Record<
  GachaPoolType,
  {
    poolType: GachaPoolType;
    name: string;
    allowedCostTypes: GachaCostType[];
    reservedCostTypes: GachaCostType[];
    singleCost: bigint;
    guaranteeAt: number;
  }
> = {
  permanent: {
    poolType: "permanent",
    name: "常驻机缘池",
    allowedCostTypes: ["paid_jade", "bound_jade"],
    reservedCostTypes: [],
    singleCost: permanentPoolJadeCost,
    guaranteeAt: 40,
  },
  ancient_treasure: {
    poolType: "ancient_treasure",
    name: "九大古宝专属池",
    allowedCostTypes: ["monthly_grant", "ancient_page"],
    reservedCostTypes: ["reserved_paid_jade", "paid_jade"],
    singleCost: 0n,
    guaranteeAt: 60,
  },
};

export const permanentPoolRewards: Array<{ itemId: string; name: string; weight: number }> = [
  { itemId: "low_herb", name: "凝露草", weight: 30 },
  { itemId: "raw_iron", name: "玄铁砂", weight: 30 },
  { itemId: "pill_dust", name: "丹尘", weight: 18 },
  { itemId: "artifact_soul", name: "器魂", weight: 14 },
  { itemId: "inscription_rune", name: "铭纹砂", weight: 8 },
];

export const ancientTreasures = [
  {
    treasureId: "taiyi_danding",
    name: "太乙丹鼎",
    role: "炼丹",
    description: "每日可将 2 枚已炼成丹药提炼为无瑕品质。",
  },
  {
    treasureId: "qiankun_lianxing_lu",
    name: "乾坤炼星炉",
    role: "炼器",
    description: "每日 1 次淬炼额外保留 1 条副词条。",
  },
  {
    treasureId: "xuandu_juling_pan",
    name: "玄都聚灵盘",
    role: "修炼",
    description: "储存部分溢出离线收益，转为绑定修为包。",
  },
  {
    treasureId: "qingdi_changsheng_juan",
    name: "青帝长生卷",
    role: "洞府",
    description: "提升灵田、灵植、内天地派遣效率。",
  },
  {
    treasureId: "shanhe_sheji_tu",
    name: "山河社稷图",
    role: "九州",
    description: "每日标记 1 个九州奇遇点。",
  },
  {
    treasureId: "haotian_zhenmo_zhong",
    name: "昊天镇魔钟",
    role: "仙道",
    description: "降低个人魔染惩罚，战斗中触发净化护盾。",
  },
  {
    treasureId: "jiuyuan_shihun_fan",
    name: "九渊噬魂幡",
    role: "魔道",
    description: "积累噬魂值兑换绑定魔道材料。",
  },
  {
    treasureId: "zhenyue_xuanhuang_yin",
    name: "镇岳玄黄印",
    role: "炼体",
    description: "降低公共战斗耐久损耗，提升个人承伤评分。",
  },
  {
    treasureId: "tianji_xingpan",
    name: "天机星盘",
    role: "择日",
    description: "每日保存 1 个有利天象用于突破、炼丹或炼器。",
  },
] as const;

export const appearanceConfigs: Array<{
  appearanceId: string;
  name: string;
  appearanceType: AppearanceType;
  sourceType: string;
  statBonus: null;
}> = [
  {
    appearanceId: "title_style_qingtian",
    name: "青天道号",
    appearanceType: "title_style",
    sourceType: "activity",
    statBonus: null,
  },
  {
    appearanceId: "avatar_frame_jiuzhou",
    name: "九州名片框",
    appearanceType: "avatar_frame",
    sourceType: "monthly",
    statBonus: null,
  },
  {
    appearanceId: "battle_report_yunlu",
    name: "云箓战报",
    appearanceType: "battle_report",
    sourceType: "rank",
    statBonus: null,
  },
  {
    appearanceId: "era_archive_chuchen",
    name: "初尘纪元史册",
    appearanceType: "era_archive",
    sourceType: "era",
    statBonus: null,
  },
];

export function rewardBundleFromJade(input: {
  paidJade?: string;
  boundJade?: string;
}): RewardBundle {
  return {
    jade_paid: input.paidJade,
    jade_bound: input.boundJade,
  };
}
