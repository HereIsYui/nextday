import type { ConfigEnvelope } from "@nextday/shared";
import {
  ancientPageDrawCost,
  ancientTreasures,
  appearanceConfigs,
  convenienceRules,
  gachaPoolConfigs,
  monthlyCardProducts,
  permanentPoolRewards,
  vipBoundJadeRewards,
} from "../commerce/commerce.constants";
import {
  bossConfig,
  rankRewardPreview,
  resourcePointConfigs,
  sectTaskConfigs,
  towerActionConfigs,
  towerConfigs,
} from "../multiplayer/multiplayer.constants";
import {
  alchemyRecipes,
  forgeRecipes,
  itemCatalog,
  pillQualityConfigs,
  skillConfigs,
} from "../production/production.constants";
import { riskConfig, riskConfigVersion, riskRulesetVersion } from "../risk/risk.constants";

export const defaultConfigEnvelopes: Record<string, ConfigEnvelope> = {
  realm: {
    config_type: "realm",
    config_version: "realm_m1_v1",
    ruleset_version: "ruleset_m1_v1",
    reward_config_version: "reward_m1_v1",
    payload: {
      realms: [
        { realm_id: 1, name: "练气", min_level: 1, max_level: 9 },
        { realm_id: 2, name: "筑基", min_level: 10, max_level: 18 },
      ],
    },
  },
  item: {
    config_type: "item",
    config_version: "item_m1_v1",
    ruleset_version: "ruleset_m1_v1",
    reward_config_version: "reward_m1_v1",
    payload: {
      items: [
        { item_id: "spirit_stone", name: "灵石", bind_type: "bound" },
        { item_id: "low_herb", name: "凝露草", bind_type: "bound" },
      ],
    },
  },
  reward: {
    config_type: "reward",
    config_version: "reward_m1_v1",
    ruleset_version: "ruleset_m1_v1",
    reward_config_version: "reward_m1_v1",
    payload: {
      rewards: [{ reward_id: "newbie_login", items: [{ item_id: "spirit_stone", count: 100 }] }],
    },
  },
  action: {
    config_type: "action",
    config_version: "action_m2_v1",
    ruleset_version: "ruleset_m2_v1",
    reward_config_version: "reward_m2_v1",
    payload: {
      action_points: { restore_per_hour: 12, storage_cap: 180, initial_points: 60 },
      batch_limits: { free: 5, vip3: 10, large_monthly: 20 },
    },
  },
  world: {
    config_type: "world",
    config_version: "world_m2_v1",
    ruleset_version: "ruleset_m2_v1",
    reward_config_version: "reward_m2_v1",
    payload: {
      provinces: [
        { province_id: "ji", name: "冀州", tower_name: "玄铁塔", chapter_required: 1 },
        { province_id: "yan", name: "兖州", tower_name: "礼法塔", chapter_required: 2 },
        { province_id: "qing", name: "青州", tower_name: "潮生塔", chapter_required: 3 },
        { province_id: "xu", name: "徐州", tower_name: "戈阳塔", chapter_required: 3 },
      ],
    },
  },
  task: {
    config_type: "task",
    config_version: "task_m2_v1",
    ruleset_version: "ruleset_m2_v1",
    reward_config_version: "reward_m2_v1",
    payload: {
      tasks: [
        { task_id: "novice_create_role", type: "novice", target: 1 },
        { task_id: "novice_claim_cultivation", type: "novice", target: 1 },
        { task_id: "novice_explore_ji", type: "novice", target: 1 },
        { task_id: "daily_explore", type: "daily", target: 3 },
        { task_id: "daily_cave_collect", type: "daily", target: 1 },
        { task_id: "weekly_explore_10", type: "weekly", target: 10 },
      ],
    },
  },
  battle: {
    config_type: "battle",
    config_version: "battle_m2_v1",
    ruleset_version: "ruleset_m2_v1",
    reward_config_version: "reward_m2_v1",
    payload: {
      mode: "auto_explore",
      max_rounds: 3,
      enemies: [
        { enemy_id: "gudiao", name: "蛊雕", province_id: "ji" },
        { enemy_id: "zheng", name: "狰", province_id: "yan" },
        { enemy_id: "xuangui", name: "旋龟", province_id: "qing" },
        { enemy_id: "kui", name: "夔", province_id: "xu" },
      ],
    },
  },
  cave: {
    config_type: "cave",
    config_version: "cave_m2_v1",
    ruleset_version: "ruleset_m2_v1",
    reward_config_version: "reward_m2_v1",
    payload: {
      max_collect_minutes: 480,
      facilities: [
        { facility_id: "spirit_field", name: "灵田", output: "spirit_stone" },
        { facility_id: "spirit_array", name: "聚灵阵", output: "cultivation_support" },
        { facility_id: "alchemy_room", name: "丹炉", output: "low_herb" },
        { facility_id: "refinery_room", name: "炼器室", output: "raw_iron" },
      ],
    },
  },
  pill: {
    config_type: "pill",
    config_version: "pill_m3_v1",
    ruleset_version: "ruleset_m3_v1",
    reward_config_version: "reward_m3_v1",
    payload: {
      recipes: alchemyRecipes.map(({ failure_returns: _failureReturns, ...recipe }) => recipe),
      qualities: pillQualityConfigs,
      diminishing: [
        { range: "1-3", effective_rate: 100 },
        { range: "4-10", effective_rate: 50 },
        { range: "11+", effective_rate: 10 },
      ],
    },
  },
  forge: {
    config_type: "forge",
    config_version: "forge_m3_v1",
    ruleset_version: "ruleset_m3_v1",
    reward_config_version: "reward_m3_v1",
    payload: {
      recipes: forgeRecipes,
      forbidden_outputs: ["九大古宝", "ancient_treasure"],
      operations: ["forge", "refine", "inscribe", "decompose"],
    },
  },
  skill: {
    config_type: "skill",
    config_version: "skill_m3_v1",
    ruleset_version: "ruleset_m3_v1",
    reward_config_version: "reward_m3_v1",
    payload: {
      max_active_skills: 3,
      max_treasure_skills: 1,
      skills: skillConfigs,
    },
  },
  bag: {
    config_type: "bag",
    config_version: "bag_m3_v1",
    ruleset_version: "ruleset_m3_v1",
    reward_config_version: "reward_m3_v1",
    payload: {
      item_catalog: itemCatalog,
      trade_rules: {
        paid_items_tradeable: false,
        bound_items_tradeable: false,
        locked_items_consumable: false,
        expired_items_consumable: false,
      },
    },
  },
  tower: {
    config_type: "tower",
    config_version: "tower_m4_v1",
    ruleset_version: "ruleset_m4_v1",
    reward_config_version: "reward_m4_v1",
    payload: {
      towers: towerConfigs,
      actions: towerActionConfigs,
      async_rule: "24 小时可提交行动，日结和周结不要求在线",
    },
  },
  boss: {
    config_type: "boss",
    config_version: "boss_m4_v1",
    ruleset_version: "ruleset_m4_v1",
    reward_config_version: "reward_m4_v1",
    payload: {
      boss: bossConfig,
      mode: "mirror_challenge_with_phase_hp_pool",
    },
  },
  sect: {
    config_type: "sect",
    config_version: "sect_m4_v1",
    ruleset_version: "ruleset_m4_v1",
    reward_config_version: "reward_m4_v1",
    payload: {
      tasks: sectTaskConfigs.map((task) => ({
        ...task,
        fundGain: task.fundGain.toString(),
      })),
      roles: ["leader", "elder", "deacon", "disciple"],
      warehouse_rule: "仅未绑定白名单材料可流通，付费与限定产物禁止入库",
    },
  },
  pvp: {
    config_type: "pvp",
    config_version: "pvp_m4_v1",
    ruleset_version: "ruleset_m4_v1",
    reward_config_version: "reward_m4_v1",
    payload: {
      resource_points: resourcePointConfigs,
      mode: "async_attack_defense_mirror",
      loss_rule: "失败不掉级、不爆付费道具、不摧毁核心法宝",
    },
  },
  rank: {
    config_type: "rank",
    config_version: "rank_m4_v1",
    ruleset_version: "ruleset_m4_v1",
    reward_config_version: "reward_m4_v1",
    payload: {
      rank_types: ["personal", "sect", "pvp_week", "tower_week"],
      reward_preview: rankRewardPreview,
      reward_boundary: "排行奖励不发唯一战力道具",
    },
  },
  gacha: {
    config_type: "gacha",
    config_version: "gacha_m5_v1",
    ruleset_version: "ruleset_m5_v1",
    reward_config_version: "reward_m5_v1",
    payload: {
      pools: {
        permanent: {
          ...gachaPoolConfigs.permanent,
          singleCost: gachaPoolConfigs.permanent.singleCost.toString(),
          results: permanentPoolRewards,
        },
        ancient_treasure: {
          ...gachaPoolConfigs.ancient_treasure,
          singleCost: gachaPoolConfigs.ancient_treasure.singleCost.toString(),
          results: ancientTreasures.map((treasure) => ({
            treasure_id: treasure.treasureId,
            name: treasure.name,
            role: treasure.role,
          })),
          ancient_page_draw_cost: ancientPageDrawCost,
          paid_jade_entry: "reserved_unopened",
        },
      },
    },
  },
  monthly_card: {
    config_type: "monthly_card",
    config_version: "monthly_card_m5_v1",
    ruleset_version: "ruleset_m5_v1",
    reward_config_version: "reward_m5_v1",
    payload: {
      products: monthlyCardProducts,
      daily_grant_rule: "小月卡每日 1 次九大古宝赠抽，大月卡每日 2 次，当日有效",
    },
  },
  vip: {
    config_type: "vip",
    config_version: "vip_m5_v1",
    ruleset_version: "ruleset_m5_v1",
    reward_config_version: "reward_m5_v1",
    payload: {
      bound_jade_rewards: vipBoundJadeRewards,
      boundary: "VIP3 等同小月卡便利，VIP4 高于小月卡但不高于大月卡；VIP 不提供九大古宝赠抽",
    },
  },
  convenience: {
    config_type: "convenience",
    config_version: "convenience_m5_v1",
    ruleset_version: "ruleset_m5_v1",
    reward_config_version: "reward_m5_v1",
    payload: {
      rules: convenienceRules,
      reward_rule: "便利只减少操作，不提高奖励倍率、贡献倍率或战斗强度",
    },
  },
  appearance: {
    config_type: "appearance",
    config_version: "appearance_m5_v1",
    ruleset_version: "ruleset_m5_v1",
    reward_config_version: "reward_m5_v1",
    payload: {
      appearances: appearanceConfigs,
      stat_bonus_rule: "展示外观 statBonus 固定为空，不参与战力、贡献和奖励结算",
    },
  },
  risk: {
    config_type: "risk",
    config_version: riskConfigVersion,
    ruleset_version: riskRulesetVersion,
    reward_config_version: "reward_m6_v1",
    payload: {
      behavior_risk: riskConfig,
      boundary:
        "允许脚本点击，只做记录、评分、限频、收益延迟和后台审核；不得突破行动令、权益档位、奖励公式和贡献衰减",
    },
  },
};
