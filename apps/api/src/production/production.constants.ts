import type {
  AlchemyRecipeSummary,
  CultivationRoute,
  EquipmentRarity,
  ForgeRecipeSummary,
  ItemCategory,
  MaterialSourceState,
  PillQuality,
  ProductionBalanceWarningState,
  RewardBundle,
  SkillLoadoutResponse,
  SkillSummary,
} from "@nextday/shared";

export const productionConfigVersion = "m3_production_v1";
export const productionRewardConfigVersion = "reward_m3_v1";
export const materialChainConfigVersion = "material_chain_p3_v1";

export interface ItemMeta {
  itemId: string;
  name: string;
  category: ItemCategory;
  tradeable: boolean;
}

export const itemCatalog: ItemMeta[] = [
  { itemId: "spirit_stone", name: "灵石", category: "currency", tradeable: false },
  { itemId: "low_herb", name: "凝露草", category: "material", tradeable: false },
  { itemId: "raw_iron", name: "玄铁砂", category: "equipment_material", tradeable: false },
  { itemId: "pill_dust", name: "丹尘", category: "material", tradeable: false },
  { itemId: "artifact_soul", name: "器魂", category: "equipment_material", tradeable: false },
  { itemId: "inscription_rune", name: "铭纹砂", category: "equipment_material", tradeable: false },
  { itemId: "tower_sigil", name: "镇塔符", category: "tower_material", tradeable: false },
  { itemId: "demon_crystal", name: "九渊残晶", category: "tower_material", tradeable: false },
  { itemId: "sect_token", name: "宗门令", category: "sect_material", tradeable: false },
  { itemId: "array_sand", name: "阵砂", category: "sect_material", tradeable: true },
  { itemId: "battle_mark", name: "战备符", category: "battle_material", tradeable: false },
  { itemId: "spirit_wood", name: "灵木", category: "inner_world_material", tradeable: false },
  { itemId: "inner_seed", name: "洞天种子", category: "inner_world_material", tradeable: false },
  { itemId: "law_dust", name: "法则尘", category: "inner_world_material", tradeable: false },
  {
    itemId: "earth_vein_stone",
    name: "地脉石",
    category: "inner_world_material",
    tradeable: false,
  },
  { itemId: "taichu_stone", name: "太初石", category: "inner_world_material", tradeable: false },
  { itemId: "ancient_page", name: "九大古宝残页", category: "treasure_page", tradeable: false },
  { itemId: "pill_juling_1", name: "聚灵丹", category: "pill", tradeable: false },
  { itemId: "pill_feixue_1", name: "沸血丹", category: "pill", tradeable: false },
  { itemId: "pill_pojing_1", name: "破境丹", category: "pill", tradeable: false },
];

export interface MaterialSourceConfig extends MaterialSourceState {
  item_id: string;
  item_name: string;
  average_per_run?: number;
}

export const materialSourceConfigs: MaterialSourceConfig[] = [
  {
    item_id: "low_herb",
    item_name: "凝露草",
    source_type: "explore",
    source_id: "province_ji",
    province_id: "ji",
    province_name: "冀州",
    name: "冀州山野探索",
    action_label: "去冀州探索",
    average_per_run: 0.5,
    note: "冀州探索会稳定产出低阶灵草，适合补第一炉丹。",
  },
  {
    item_id: "low_herb",
    item_name: "凝露草",
    source_type: "cave",
    source_id: "alchemy_room",
    name: "洞府丹炉",
    action_label: "收取洞府",
    average_per_run: 1,
    note: "丹炉每隔一段时间会积累灵草，适合离线后补缺口。",
  },
  {
    item_id: "raw_iron",
    item_name: "玄铁砂",
    source_type: "explore",
    source_id: "province_ji",
    province_id: "ji",
    province_name: "冀州",
    name: "玄铁塔影探索",
    action_label: "去冀州探索",
    average_per_run: 0.35,
    note: "冀州怪物和玄铁塔影会掉落玄铁砂，是第一件法宝的主要来源。",
  },
  {
    item_id: "raw_iron",
    item_name: "玄铁砂",
    source_type: "cave",
    source_id: "refinery_room",
    name: "洞府炼器室",
    action_label: "收取洞府",
    average_per_run: 1,
    note: "炼器室能补少量玄铁砂，适合和探索一起凑齐配方。",
  },
  {
    item_id: "spirit_stone",
    item_name: "灵石",
    source_type: "cave",
    source_id: "spirit_field",
    name: "洞府灵田",
    action_label: "收取洞府",
    average_per_run: 120,
    note: "灵田是灵石的稳定来源，炼丹炼器前优先查看可收取收益。",
  },
  {
    item_id: "spirit_stone",
    item_name: "灵石",
    source_type: "task",
    source_id: "daily_task",
    name: "今日任务",
    action_label: "领取任务",
    average_per_run: 80,
    note: "今日任务会补充少量灵石，适合解决低阶生产缺口。",
  },
  {
    item_id: "pill_dust",
    item_name: "丹尘",
    source_type: "system",
    source_id: "alchemy_failure",
    name: "炼丹失败返还",
    action_label: "炼丹后查看",
    average_per_run: 1,
    note: "丹尘来自炼丹失败返还，不应作为新手强制目标。",
  },
  {
    item_id: "artifact_soul",
    item_name: "器魂",
    source_type: "decompose",
    source_id: "equipment_decompose",
    name: "法宝分解",
    action_label: "分解闲置法宝",
    average_per_run: 1,
    note: "器魂来自分解闲置法宝，前期优先保留第一件可用法宝。",
  },
  {
    item_id: "inscription_rune",
    item_name: "铭纹砂",
    source_type: "event",
    source_id: "craft_trial",
    name: "丹器加试",
    action_label: "参加活动",
    average_per_run: 1,
    note: "铭纹砂主要来自活动和后续生产玩法，前期不作为必备材料。",
  },
];

export interface MaterialBalanceProfile {
  item_id: string;
  item_name: string;
  daily_supply: number;
  daily_demand: number;
  stockpile_threshold: number;
  graduation_threshold?: number;
  suggestion: string;
}

export const materialBalanceProfiles: MaterialBalanceProfile[] = [
  {
    item_id: "low_herb",
    item_name: "凝露草",
    daily_supply: 9,
    daily_demand: 6,
    stockpile_threshold: 18,
    graduation_threshold: 22,
    suggestion: "若 7 天囤积过多，可把部分凝露草消耗转到破境丹或活动任务。",
  },
  {
    item_id: "raw_iron",
    item_name: "玄铁砂",
    daily_supply: 5,
    daily_demand: 7,
    stockpile_threshold: 14,
    suggestion: "玄铁砂偏紧时，优先提高冀州探索和洞府炼器室提示权重。",
  },
  {
    item_id: "spirit_stone",
    item_name: "灵石",
    daily_supply: 420,
    daily_demand: 310,
    stockpile_threshold: 800,
    suggestion: "灵石应保持轻微富余，避免新手被基础生产卡住。",
  },
];

export interface PillQualityConfig {
  quality: PillQuality;
  name: string;
  multiplier: number;
  weight: number;
}

export const pillQualityConfigs: PillQualityConfig[] = [
  { quality: "low", name: "下品", multiplier: 0.8, weight: 3500 },
  { quality: "middle", name: "中品", multiplier: 1, weight: 3500 },
  { quality: "high", name: "上品", multiplier: 1.2, weight: 2000 },
  { quality: "best", name: "极品", multiplier: 1.5, weight: 800 },
  { quality: "flawless", name: "无瑕", multiplier: 2, weight: 200 },
];

export interface AlchemyRecipeConfig extends AlchemyRecipeSummary {
  failure_returns: RewardBundle;
}

export const alchemyRecipes: AlchemyRecipeConfig[] = [
  {
    recipe_id: "recipe_juling_1",
    name: "聚灵丹方",
    route: "qi",
    pill_item_id: "pill_juling_1",
    pill_rank: 1,
    pill_type: "cultivation",
    base_effect: 100,
    success_rate: 9200,
    materials: [{ item_id: "low_herb", name: "凝露草", count: 2 }],
    spirit_stone_cost: "50",
    failure_returns: {
      items: [{ item_id: "pill_dust", name: "丹尘", count: 1, bind_type: "bound" }],
    },
  },
  {
    recipe_id: "recipe_feixue_1",
    name: "沸血丹方",
    route: "body",
    pill_item_id: "pill_feixue_1",
    pill_rank: 1,
    pill_type: "cultivation",
    base_effect: 100,
    success_rate: 9200,
    materials: [{ item_id: "low_herb", name: "凝露草", count: 2 }],
    spirit_stone_cost: "50",
    failure_returns: {
      items: [{ item_id: "pill_dust", name: "丹尘", count: 1, bind_type: "bound" }],
    },
  },
  {
    recipe_id: "recipe_pojing_1",
    name: "破境丹方",
    route: "all",
    pill_item_id: "pill_pojing_1",
    pill_rank: 1,
    pill_type: "breakthrough",
    base_effect: 500,
    success_rate: 7000,
    materials: [{ item_id: "low_herb", name: "凝露草", count: 5 }],
    spirit_stone_cost: "120",
    failure_returns: {
      items: [{ item_id: "pill_dust", name: "丹尘", count: 2, bind_type: "bound" }],
    },
  },
];

export interface ForgeRecipeConfig extends ForgeRecipeSummary {
  affix_seed: string;
}

export const forgeRecipes: ForgeRecipeConfig[] = [
  {
    recipe_id: "forge_xuantie_sword_1",
    name: "玄铁剑胚",
    route: "qi",
    equipment_id: "eq_xuantie_sword_1",
    equipment_type: "weapon",
    rarity: "ordinary",
    materials: [{ item_id: "raw_iron", name: "玄铁砂", count: 3 }],
    spirit_stone_cost: "80",
    affix_seed: "qi_weapon",
  },
  {
    recipe_id: "forge_jinshi_bracer_1",
    name: "金石护臂",
    route: "body",
    equipment_id: "eq_jinshi_bracer_1",
    equipment_type: "armor",
    rarity: "ordinary",
    materials: [{ item_id: "raw_iron", name: "玄铁砂", count: 3 }],
    spirit_stone_cost: "80",
    affix_seed: "body_armor",
  },
  {
    recipe_id: "forge_lingwen_core_1",
    name: "灵纹古器胚",
    route: "all",
    equipment_id: "eq_lingwen_core_1",
    equipment_type: "talisman",
    rarity: "ancient_craft",
    materials: [{ item_id: "raw_iron", name: "玄铁砂", count: 6 }],
    spirit_stone_cost: "180",
    affix_seed: "ancient_craft",
  },
];

export interface AffixConfig {
  affixKey: string;
  name: string;
  minValue: number;
  maxValue: number;
}

export const mainAffixes: AffixConfig[] = [
  { affixKey: "attack", name: "攻击", minValue: 24, maxValue: 36 },
  { affixKey: "life", name: "生命", minValue: 120, maxValue: 180 },
  { affixKey: "defense", name: "防御", minValue: 12, maxValue: 24 },
];

export const subAffixes: AffixConfig[] = [
  { affixKey: "speed", name: "速度", minValue: 4, maxValue: 10 },
  { affixKey: "crit", name: "暴击", minValue: 3, maxValue: 8 },
  { affixKey: "anti_crit", name: "抗暴", minValue: 3, maxValue: 8 },
  { affixKey: "alchemy_bonus", name: "丹火", minValue: 2, maxValue: 6 },
  { affixKey: "forge_bonus", name: "器感", minValue: 2, maxValue: 6 },
];

export const hiddenAffixes: AffixConfig[] = [
  { affixKey: "hidden_spirit", name: "灵息暗纹", minValue: 8, maxValue: 14 },
  { affixKey: "hidden_body", name: "金骨暗纹", minValue: 8, maxValue: 14 },
];

export const equipmentRarityLabels: Record<EquipmentRarity, string> = {
  ordinary: "凡品",
  earth: "地品",
  heaven: "天品",
  immortal: "仙品",
  ancient_craft: "古器胚",
};

export const skillConfigs: SkillSummary[] = [
  {
    skill_id: "skill_yuhuo",
    name: "御火诀",
    route: "qi",
    skill_type: "active",
    cooldown_rounds: 2,
    priority_hint: 30,
    description: "练气基础攻击术，自动战斗中作为主输出技能。",
  },
  {
    skill_id: "skill_lingdun",
    name: "灵盾术",
    route: "qi",
    skill_type: "active",
    cooldown_rounds: 3,
    priority_hint: 10,
    description: "生命偏低时优先释放的防御技能。",
  },
  {
    skill_id: "skill_xiaozhoutian",
    name: "小周天剑气",
    route: "qi",
    skill_type: "active",
    cooldown_rounds: 4,
    priority_hint: 40,
    description: "练气路线关键技，适合手动或高优先级释放。",
  },
  {
    skill_id: "skill_lieshi",
    name: "裂石拳",
    route: "body",
    skill_type: "active",
    cooldown_rounds: 2,
    priority_hint: 30,
    description: "炼体基础攻击技，自动战斗中作为主输出技能。",
  },
  {
    skill_id: "skill_jinshen",
    name: "金身诀",
    route: "body",
    skill_type: "active",
    cooldown_rounds: 3,
    priority_hint: 10,
    description: "炼体防御技能，生命偏低时优先释放。",
  },
  {
    skill_id: "skill_xuefei",
    name: "血沸",
    route: "body",
    skill_type: "active",
    cooldown_rounds: 4,
    priority_hint: 40,
    description: "炼体路线关键技，提升爆发上限。",
  },
  {
    skill_id: "skill_benming_faguang",
    name: "本命法光",
    route: "all",
    skill_type: "treasure",
    cooldown_rounds: 5,
    priority_hint: 20,
    description: "默认本命法宝技能，自动战斗会按优先级触发。",
  },
];

export function getItemMeta(itemId: string): ItemMeta {
  return (
    itemCatalog.find((item) => item.itemId === itemId) ?? {
      itemId,
      name: itemId,
      category: "unknown",
      tradeable: false,
    }
  );
}

export function getQualityConfig(quality: PillQuality): PillQualityConfig {
  return pillQualityConfigs.find((item) => item.quality === quality) ?? pillQualityConfigs[1];
}

export function getSkillName(skillId: string): string {
  return skillConfigs.find((skill) => skill.skill_id === skillId)?.name ?? skillId;
}

export function getAvailableSkills(route: CultivationRoute): SkillSummary[] {
  return skillConfigs.filter((skill) => skill.route === route || skill.route === "all");
}

export function getDefaultSkillLoadout(route: CultivationRoute): SkillLoadoutResponse {
  const activeSkillIds =
    route === "body"
      ? ["skill_jinshen", "skill_lieshi", "skill_xuefei"]
      : ["skill_lingdun", "skill_yuhuo", "skill_xiaozhoutian"];

  return {
    active_skill_ids: activeSkillIds,
    treasure_skill_id: "skill_benming_faguang",
    auto_priority: ["skill_benming_faguang", ...activeSkillIds],
    available_skills: getAvailableSkills(route),
  };
}

export function buildMaterialSourceHints(itemId: string, missing: number): MaterialSourceState[] {
  return materialSourceConfigs
    .filter((source) => source.item_id === itemId)
    .map(
      ({ average_per_run: averagePerRun, item_id: _itemId, item_name: _itemName, ...source }) => ({
        ...source,
        estimated_runs:
          missing > 0 && averagePerRun && averagePerRun > 0
            ? Math.max(1, Math.ceil(missing / averagePerRun))
            : undefined,
      }),
    )
    .slice(0, 3);
}

export function buildProductionBalanceWarnings(
  periods: Array<1 | 7 | 30> = [1, 7, 30],
): ProductionBalanceWarningState[] {
  const warnings: ProductionBalanceWarningState[] = [];

  for (const profile of materialBalanceProfiles) {
    for (const periodDays of periods) {
      const supply = profile.daily_supply * periodDays;
      const demand = profile.daily_demand * periodDays;
      const net = supply - demand;

      if (net < 0) {
        warnings.push({
          item_id: profile.item_id,
          name: profile.item_name,
          period_days: periodDays,
          risk_type: "shortage",
          severity: periodDays >= 7 ? "warning" : "info",
          message: `${periodDays} 天预估缺口 ${Math.abs(net)} 个，可能卡住生产节奏。`,
          suggestion: profile.suggestion,
        });
        continue;
      }

      if (net >= profile.stockpile_threshold) {
        warnings.push({
          item_id: profile.item_id,
          name: profile.item_name,
          period_days: periodDays,
          risk_type: "stockpile",
          severity: periodDays >= 30 ? "warning" : "info",
          message: `${periodDays} 天预估富余 ${net} 个，可能形成低阶材料囤积。`,
          suggestion: profile.suggestion,
        });
      }

      if (profile.graduation_threshold && supply >= profile.graduation_threshold) {
        warnings.push({
          item_id: profile.item_id,
          name: profile.item_name,
          period_days: periodDays,
          risk_type: "fast_graduation",
          severity: periodDays === 1 ? "info" : "warning",
          message: `${periodDays} 天可获得约 ${supply} 个，需观察是否让新手过快跳过低阶目标。`,
          suggestion: profile.suggestion,
        });
      }
    }
  }

  return warnings;
}
