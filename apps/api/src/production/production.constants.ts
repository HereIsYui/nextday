import { createHash } from "node:crypto";
import type {
  CultivationRoute,
  EquipmentRarity,
  ItemCategory,
  MaterialSourceState,
  PillQuality,
  ProductionBalanceWarningState,
  ProductionCraftMaterialState,
  RewardBundle,
  SkillLoadoutResponse,
  SkillSummary,
} from "@nextday/shared";
import type {
  FormulaResultTemplate,
  ProductionFormulaKind,
  ProductionMaterialInput,
} from "./production.formula-types";

export const productionConfigVersion = "text_cultivation_production_v1";
export const productionRewardConfigVersion = "reward_text_cultivation_v1";
export const materialChainConfigVersion = "material_chain_text_cultivation_v1";
export const productionFormulaRuleVersion = "formula_discovery_v1";
export const skillLearningConfigVersion = "skill_learning_p3_v1";

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
  { itemId: "alch_moon_dew_herb", name: "月露草", category: "material", tradeable: false },
  { itemId: "alch_sunfire_petal", name: "赤阳花", category: "material", tradeable: false },
  { itemId: "alch_void_moss", name: "玄阴苔", category: "material", tradeable: false },
  { itemId: "alch_spirit_resin", name: "灵髓露", category: "material", tradeable: false },
  { itemId: "alch_break_marrow_root", name: "破脉根", category: "material", tradeable: false },
  { itemId: "forge_star_iron", name: "星纹铁", category: "equipment_material", tradeable: false },
  {
    itemId: "forge_spiritwood_core",
    name: "灵木芯",
    category: "equipment_material",
    tradeable: false,
  },
  {
    itemId: "forge_thunder_crystal",
    name: "雷纹晶",
    category: "equipment_material",
    tradeable: false,
  },
  { itemId: "forge_void_silk", name: "空冥丝", category: "equipment_material", tradeable: false },
  {
    itemId: "forge_artifact_marrow",
    name: "器心髓",
    category: "equipment_material",
    tradeable: false,
  },
  { itemId: "pill_nourishing_essence", name: "蕴灵丹", category: "pill", tradeable: false },
  { itemId: "pill_barrier_breaking", name: "破障丹", category: "pill", tradeable: false },
  { itemId: "pill_cloud_walking", name: "行云丹", category: "pill", tradeable: false },
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
  {
    item_id: "alch_moon_dew_herb",
    item_name: "月露草",
    source_type: "explore",
    source_id: "province_qing",
    province_id: "qing",
    province_name: "青州",
    name: "青州潮汐采药",
    action_label: "去青州探索",
    average_per_run: 0.35,
    note: "潮汐退去时才会显露的丹材，适合作为蕴灵类丹药的主材。",
  },
  {
    item_id: "alch_sunfire_petal",
    item_name: "赤阳花",
    source_type: "explore",
    source_id: "province_jing",
    province_id: "jing",
    province_name: "荆州",
    name: "荆州泽林采药",
    action_label: "去荆州探索",
    average_per_run: 0.28,
    note: "泽林火脉附近的阳性花材，可与破脉根试配突破辅助丹。",
  },
  {
    item_id: "alch_void_moss",
    item_name: "玄阴苔",
    source_type: "event",
    source_id: "tower_chaosheng",
    province_id: "qing",
    province_name: "青州",
    name: "潮生塔余波",
    action_label: "参与九塔行动",
    average_per_run: 0.2,
    note: "九塔事件中的阴性丹材，适合摸索与探索增益相关的丹药。",
  },
  {
    item_id: "alch_spirit_resin",
    item_name: "灵髓露",
    source_type: "cave",
    source_id: "alchemy_room",
    name: "洞府丹炉凝露",
    action_label: "收取洞府",
    average_per_run: 0.45,
    note: "洞府丹炉凝成的中和辅材，可用于稳定多种丹材药性。",
  },
  {
    item_id: "alch_break_marrow_root",
    item_name: "破脉根",
    source_type: "event",
    source_id: "tower_zhenyue",
    province_id: "liang",
    province_name: "梁州",
    name: "镇岳塔地脉试炼",
    action_label: "参与九塔行动",
    average_per_run: 0.18,
    note: "地脉裂隙中的根材，炼制时可定向形成突破辅助效果。",
  },
  {
    item_id: "forge_star_iron",
    item_name: "星纹铁",
    source_type: "explore",
    source_id: "province_xu",
    province_id: "xu",
    province_name: "徐州",
    name: "徐州古战场采矿",
    action_label: "去徐州探索",
    average_per_run: 0.3,
    note: "古战场夜空坠落的主材，决定法宝的骨架与基础类型。",
  },
  {
    item_id: "forge_spiritwood_core",
    item_name: "灵木芯",
    source_type: "cave",
    source_id: "refinery_room",
    name: "洞府炼器室温养",
    action_label: "收取洞府",
    average_per_run: 0.35,
    note: "温养后的灵木核心，更容易导向兵刃与攻势词条。",
  },
  {
    item_id: "forge_thunder_crystal",
    item_name: "雷纹晶",
    source_type: "event",
    source_id: "tower_geyang",
    province_id: "xu",
    province_name: "徐州",
    name: "戈阳塔雷痕",
    action_label: "参与九塔行动",
    average_per_run: 0.2,
    note: "塔影雷痕中析出的晶体，适合试出防具和防护词条。",
  },
  {
    item_id: "forge_void_silk",
    item_name: "空冥丝",
    source_type: "explore",
    source_id: "province_yang",
    province_id: "yang",
    province_name: "扬州",
    name: "扬州商路遗迹",
    action_label: "去扬州探索",
    average_per_run: 0.2,
    note: "可牵引灵力流向的细丝，能定向形成符器与灵巧词条。",
  },
  {
    item_id: "forge_artifact_marrow",
    item_name: "器心髓",
    source_type: "event",
    source_id: "tower_rift_event",
    name: "九塔裂隙奇遇",
    action_label: "处理奇遇",
    average_per_run: 0.15,
    note: "稀有器材，只在九塔裂隙相关奇遇中产出，能提高定向炼器品阶。",
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
  {
    item_id: "alch_moon_dew_herb",
    item_name: "月露草",
    daily_supply: 3,
    daily_demand: 2,
    stockpile_threshold: 10,
    suggestion: "月露草适合与灵髓露尝试，先保存成功组合再扩大投入。",
  },
  {
    item_id: "forge_star_iron",
    item_name: "星纹铁",
    daily_supply: 2,
    daily_demand: 2,
    stockpile_threshold: 8,
    suggestion: "星纹铁是炼器骨架，优先保留给已发现的组合，避免盲目堆叠。",
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

export type ProductionCraftMaterial = ProductionCraftMaterialState;

/**
 * 仅这些专用材料允许投入丹炉或器炉。普通背包材料不会被生产接口消耗。
 * 组合规则不从此列表导出，避免客户端通过配置枚举默认药方。
 */
export const productionCraftMaterials: ProductionCraftMaterial[] = [
  {
    item_id: "alch_moon_dew_herb",
    name: "月露草",
    kind: "alchemy",
    source_hint: "青州探索",
  },
  {
    item_id: "alch_sunfire_petal",
    name: "赤阳花",
    kind: "alchemy",
    source_hint: "荆州探索",
  },
  {
    item_id: "alch_void_moss",
    name: "玄阴苔",
    kind: "alchemy",
    source_hint: "潮生塔事件",
  },
  {
    item_id: "alch_spirit_resin",
    name: "灵髓露",
    kind: "alchemy",
    source_hint: "洞府丹炉",
  },
  {
    item_id: "alch_break_marrow_root",
    name: "破脉根",
    kind: "alchemy",
    source_hint: "镇岳塔事件",
  },
  {
    item_id: "forge_star_iron",
    name: "星纹铁",
    kind: "forge",
    source_hint: "徐州探索",
  },
  {
    item_id: "forge_spiritwood_core",
    name: "灵木芯",
    kind: "forge",
    source_hint: "洞府炼器室",
  },
  {
    item_id: "forge_thunder_crystal",
    name: "雷纹晶",
    kind: "forge",
    source_hint: "戈阳塔事件",
  },
  {
    item_id: "forge_void_silk",
    name: "空冥丝",
    kind: "forge",
    source_hint: "扬州探索",
  },
  {
    item_id: "forge_artifact_marrow",
    name: "器心髓",
    kind: "forge",
    source_hint: "九塔裂隙奇遇",
  },
];

type CombinationRule = {
  signature: string;
  template: FormulaResultTemplate;
};

/**
 * 服务端隐藏的组合表。客户端只会收到可投炉材料和自己已经保存的单方，
 * 不会通过配置接口取得本表。
 */
const alchemyCombinationRules: CombinationRule[] = [
  {
    signature: "alch_moon_dew_herb:2|alch_spirit_resin:1",
    template: {
      kind: "alchemy",
      name: "蕴灵丹",
      success_rate: 8800,
      spirit_stone_cost: "60",
      alchemy: {
        pill_item_id: "pill_nourishing_essence",
        pill_rank: 1,
        pill_type: "cultivation",
        effect_kind: "cultivation",
        effect_min: 110,
        effect_max: 150,
      },
    },
  },
  {
    signature: "alch_break_marrow_root:1|alch_spirit_resin:1|alch_sunfire_petal:1",
    template: {
      kind: "alchemy",
      name: "破障丹",
      success_rate: 7600,
      spirit_stone_cost: "110",
      alchemy: {
        pill_item_id: "pill_barrier_breaking",
        pill_rank: 1,
        pill_type: "breakthrough",
        effect_kind: "breakthrough_support",
        effect_min: 220,
        effect_max: 300,
      },
    },
  },
  {
    signature: "alch_moon_dew_herb:1|alch_spirit_resin:1|alch_void_moss:1",
    template: {
      kind: "alchemy",
      name: "行云丹",
      success_rate: 8200,
      spirit_stone_cost: "80",
      alchemy: {
        pill_item_id: "pill_cloud_walking",
        pill_rank: 1,
        pill_type: "explore",
        effect_kind: "explore_boost",
        effect_min: 12,
        effect_max: 20,
      },
    },
  },
];

const forgeCombinationRules: CombinationRule[] = [
  {
    signature: "forge_spiritwood_core:1|forge_star_iron:3",
    template: {
      kind: "forge",
      name: "星木长锋",
      success_rate: 9000,
      spirit_stone_cost: "100",
      forge: {
        equipment_id: "equipment_starwood_blade",
        equipment_type: "weapon",
        rarity: "ordinary",
        affix_profile: "weapon",
      },
    },
  },
  {
    signature: "forge_star_iron:2|forge_void_silk:1",
    template: {
      kind: "forge",
      name: "空冥引符",
      success_rate: 8400,
      spirit_stone_cost: "120",
      forge: {
        equipment_id: "equipment_voidweave_talisman",
        equipment_type: "talisman",
        rarity: "earth",
        affix_profile: "talisman",
      },
    },
  },
  {
    signature: "forge_artifact_marrow:1|forge_star_iron:2|forge_thunder_crystal:2",
    template: {
      kind: "forge",
      name: "镇雷玄甲",
      success_rate: 7000,
      spirit_stone_cost: "220",
      forge: {
        equipment_id: "equipment_thunderward_armor",
        equipment_type: "armor",
        rarity: "heaven",
        affix_profile: "armor",
      },
    },
  },
];

export function getProductionCraftMaterials(
  kind?: ProductionFormulaKind,
): ProductionCraftMaterial[] {
  return productionCraftMaterials.filter((material) => !kind || material.kind === kind);
}

export function isProductionCraftMaterial(itemId: string, kind: ProductionFormulaKind): boolean {
  return productionCraftMaterials.some(
    (material) => material.item_id === itemId && material.kind === kind,
  );
}

export function normalizeProductionMaterials(
  materials: ProductionMaterialInput[],
): ProductionMaterialInput[] {
  const counts = new Map<string, number>();
  for (const material of materials) {
    const itemId = material.item_id.trim();
    const current = counts.get(itemId) ?? 0;
    counts.set(itemId, current + material.count);
  }

  return Array.from(counts.entries())
    .map(([item_id, count]) => ({ item_id, count }))
    .sort((left, right) => left.item_id.localeCompare(right.item_id));
}

export function materialCompositionSignature(materials: ProductionMaterialInput[]): string {
  return normalizeProductionMaterials(materials)
    .map((material) => `${material.item_id}:${material.count}`)
    .join("|");
}

export function getMaterialCompositionHash(
  kind: ProductionFormulaKind,
  materials: ProductionMaterialInput[],
): string {
  const signature = `${productionFormulaRuleVersion}:${kind}:${materialCompositionSignature(materials)}`;
  return createHash("sha256").update(signature).digest("hex").slice(0, 24);
}

export function resolveAlchemyCombination(
  materials: ProductionMaterialInput[],
): FormulaResultTemplate | null {
  return cloneCombinationTemplate(alchemyCombinationRules, materials, "alchemy");
}

export function resolveForgeCombination(
  materials: ProductionMaterialInput[],
): FormulaResultTemplate | null {
  return cloneCombinationTemplate(forgeCombinationRules, materials, "forge");
}

function cloneCombinationTemplate(
  rules: CombinationRule[],
  materials: ProductionMaterialInput[],
  kind: ProductionFormulaKind,
): FormulaResultTemplate | null {
  const signature = materialCompositionSignature(materials);
  const rule = rules.find(
    (candidate) => candidate.signature === signature && candidate.template.kind === kind,
  );
  if (!rule) {
    return null;
  }

  return {
    ...rule.template,
    alchemy: rule.template.alchemy ? { ...rule.template.alchemy } : undefined,
    forge: rule.template.forge ? { ...rule.template.forge } : undefined,
  };
}

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
    skill_id: "skill_pozhen_jian",
    name: "破阵剑诀",
    route: "qi",
    skill_type: "active",
    cooldown_rounds: 3,
    priority_hint: 45,
    description: "针对阵痕和高防敌人的进阶剑诀，适合探索塔影类敌人。",
  },
  {
    skill_id: "skill_leihuo_yin",
    name: "雷火引",
    route: "qi",
    skill_type: "active",
    cooldown_rounds: 5,
    priority_hint: 55,
    description: "练气中期爆发术，适合对付护盾和术法敌人。",
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
    skill_id: "skill_tieshan_kao",
    name: "铁山靠",
    route: "body",
    skill_type: "active",
    cooldown_rounds: 3,
    priority_hint: 45,
    description: "针对快攻和强攻敌人的进阶体术，适合承伤偏高时加入预设。",
  },
  {
    skill_id: "skill_baxue_zhan",
    name: "霸血斩",
    route: "body",
    skill_type: "active",
    cooldown_rounds: 5,
    priority_hint: 55,
    description: "炼体中期爆发技，适合打破高防敌人的持久战。",
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

export interface SkillLearningConfig {
  skillId: string;
  defaultLearned?: boolean;
  minRealmId: number;
  minLevel: number;
  cost: RewardBundle;
  presetHint: string;
  counterTraits: string[];
}

export const skillLearningConfigs: SkillLearningConfig[] = [
  {
    skillId: "skill_yuhuo",
    defaultLearned: true,
    minRealmId: 1,
    minLevel: 1,
    cost: {},
    presetHint: "基础输出技能，适合放在自动顺序中段。",
    counterTraits: ["均衡", "强攻"],
  },
  {
    skillId: "skill_lingdun",
    defaultLearned: true,
    minRealmId: 1,
    minLevel: 1,
    cost: {},
    presetHint: "承伤偏高时优先级上调。",
    counterTraits: ["快攻", "毒蚀"],
  },
  {
    skillId: "skill_xiaozhoutian",
    defaultLearned: true,
    minRealmId: 1,
    minLevel: 1,
    cost: {},
    presetHint: "关键爆发技能，遇到高防敌人时可前置。",
    counterTraits: ["高防", "护盾"],
  },
  {
    skillId: "skill_pozhen_jian",
    minRealmId: 1,
    minLevel: 1,
    cost: {
      spirit_stone: "120",
      items: [{ item_id: "raw_iron", name: "玄铁砂", count: 2, bind_type: "bound" }],
    },
    presetHint: "近期战报出现阵痕或高防敌人时推荐学习。",
    counterTraits: ["阵痕", "高防"],
  },
  {
    skillId: "skill_leihuo_yin",
    minRealmId: 1,
    minLevel: 5,
    cost: {
      spirit_stone: "260",
      items: [
        { item_id: "low_herb", name: "凝露草", count: 3, bind_type: "bound" },
        { item_id: "raw_iron", name: "玄铁砂", count: 2, bind_type: "bound" },
      ],
    },
    presetHint: "练气中期再学习，适合对付护盾和术法敌人。",
    counterTraits: ["护盾", "术法"],
  },
  {
    skillId: "skill_lieshi",
    defaultLearned: true,
    minRealmId: 1,
    minLevel: 1,
    cost: {},
    presetHint: "基础输出技能，适合放在自动顺序中段。",
    counterTraits: ["均衡", "强攻"],
  },
  {
    skillId: "skill_jinshen",
    defaultLearned: true,
    minRealmId: 1,
    minLevel: 1,
    cost: {},
    presetHint: "承伤偏高时优先级上调。",
    counterTraits: ["快攻", "毒蚀"],
  },
  {
    skillId: "skill_xuefei",
    defaultLearned: true,
    minRealmId: 1,
    minLevel: 1,
    cost: {},
    presetHint: "爆发技能，遇到高防敌人时可前置。",
    counterTraits: ["高防", "护盾"],
  },
  {
    skillId: "skill_tieshan_kao",
    minRealmId: 1,
    minLevel: 1,
    cost: {
      spirit_stone: "120",
      items: [{ item_id: "raw_iron", name: "玄铁砂", count: 2, bind_type: "bound" }],
    },
    presetHint: "近期战报承伤偏高或敌人快攻时推荐学习。",
    counterTraits: ["快攻", "强攻"],
  },
  {
    skillId: "skill_baxue_zhan",
    minRealmId: 1,
    minLevel: 5,
    cost: {
      spirit_stone: "260",
      items: [
        { item_id: "low_herb", name: "凝露草", count: 3, bind_type: "bound" },
        { item_id: "raw_iron", name: "玄铁砂", count: 2, bind_type: "bound" },
      ],
    },
    presetHint: "炼体中期再学习，适合打破高防敌人的持久战。",
    counterTraits: ["高防", "护盾"],
  },
  {
    skillId: "skill_benming_faguang",
    defaultLearned: true,
    minRealmId: 1,
    minLevel: 1,
    cost: {},
    presetHint: "本命技能默认纳入自动释放顺序。",
    counterTraits: ["阵痕", "术法"],
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

export function getSkillLearningConfig(skillId: string): SkillLearningConfig | undefined {
  return skillLearningConfigs.find((config) => config.skillId === skillId);
}

export function getDefaultLearnedSkillIds(route: CultivationRoute): string[] {
  const availableSkillIds = new Set(getAvailableSkills(route).map((skill) => skill.skill_id));
  return skillLearningConfigs
    .filter((config) => config.defaultLearned && availableSkillIds.has(config.skillId))
    .map((config) => config.skillId);
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
    available_skills: getAvailableSkills(route).map((skill) => {
      const learningConfig = getSkillLearningConfig(skill.skill_id);
      return {
        ...skill,
        counter_traits: learningConfig?.counterTraits ?? [],
        learnable: false,
        learned: learningConfig?.defaultLearned === true,
        preset_hint: learningConfig?.presetHint,
        unlock_reasons: learningConfig?.defaultLearned ? [] : ["需要先在成长页学习"],
      };
    }),
    preset_suggestions: [],
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
