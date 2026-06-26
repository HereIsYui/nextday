import type { ConfigEnvelope } from "@nextday/shared";
import {
  appearancePlusConfigVersion,
  appearancePlusConfigs,
  appearancePlusRewardBoundaryVersion,
  appearancePlusRulesetVersion,
  appearancePlusSlots,
} from "../appearance-plus/appearance-plus.constants";
import {
  collectionBlessingCapPercent,
  collectionConfigVersion,
  collectionDisplaySlots,
  collectionRewardBoundaryVersion,
  collectionRulesetVersion,
  eraCollectionConfigs,
} from "../collection/collection.constants";
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
  eventAsyncRule,
  eventConfigVersion,
  eventRewardBoundary,
  eventRewardConfigVersion,
  eventRulesetVersion,
  eventTemplateConfigs,
} from "../events/events.constants";
import {
  factionConfigVersion,
  factionRewardConfigVersion,
  factionRouteConfigs,
  factionTransferBaseCost,
  factionTransferCooldownDays,
  factionTransferReputationClearRate,
  factionUnlockChapter,
  factionUnlockRealm,
} from "../factions/factions.constants";
import { toFactionRouteConfigState } from "../factions/factions.mappers";
import { exploreEnemyPools, exploreLootPools, provinceConfigs } from "../game/game.constants";
import {
  innerWorldConfigVersion,
  innerWorldCreatureConfigs,
  innerWorldCreatureUpgradeCost,
  innerWorldDailySupportLimit,
  innerWorldDefaultAssignmentMinutes,
  innerWorldLevelConfigs,
  innerWorldProvinceRewards,
  innerWorldRewardConfigVersion,
  innerWorldSupportConfigs,
  innerWorldUnlockChapter,
  innerWorldUnlockRealm,
} from "../inner-world/inner-world.constants";
import {
  bossConfig,
  eraBlessingCapPercent,
  rankAntiBrushRule,
  rankConfigVersion,
  rankRewardBoundary,
  rankRewardConfigVersion,
  rankRewardPreview,
  rankRulesetVersion,
  rankTitleRewards,
  resourcePointConfigs,
  sectTaskConfigs,
  supportedRankTypes,
  towerActionConfigs,
  towerConfigs,
} from "../multiplayer/multiplayer.constants";
import {
  alchemyRecipes,
  buildProductionBalanceWarnings,
  forgeRecipes,
  itemCatalog,
  materialBalanceProfiles,
  materialChainConfigVersion,
  materialSourceConfigs,
  pillQualityConfigs,
  skillConfigs,
} from "../production/production.constants";
import { riskConfig, riskConfigVersion, riskRulesetVersion } from "../risk/risk.constants";
import {
  diplomacyBoundary,
  diplomacyConfigVersion,
  diplomacyRules,
  hireBoundary,
  hireConfigVersion,
  hireRules,
  mentorConfigVersion,
  mentorRule,
  socialRewardConfigVersion,
  socialRiskRulesetVersion,
  socialRulesetVersion,
} from "../social/social.constants";
import {
  sensitiveStoryTerms,
  storyConfigVersion,
  storyRulesetVersion,
  storyScrollConfigs,
} from "../story/story.constants";
import {
  transferConfigVersion,
  transferRiskRulesetVersion,
  transferRule,
  transferRulesetVersion,
  transferSettlementConfigVersion,
} from "../transfer/transfer.constants";

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
    config_version: "world_p1_v1",
    ruleset_version: "ruleset_m2_v1",
    reward_config_version: "reward_m2_v1",
    payload: {
      provinces: provinceConfigs.map((province) => ({
        province_id: province.provinceId,
        name: province.name,
        theme: province.theme,
        tower_name: province.towerName,
        chapter_required: province.chapterRequired,
        resources: province.resources,
        low_level_entry: province.lowLevelEntry,
        long_term_goal: province.longTermGoal,
      })),
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
    config_version: "battle_p1_v1",
    ruleset_version: "ruleset_m2_v1",
    reward_config_version: "reward_m2_v1",
    payload: {
      mode: "auto_explore",
      max_rounds: 3,
      enemies: provinceConfigs.map((province) => ({
        enemy_id: province.enemyId,
        name: province.enemyName,
        province_id: province.provinceId,
        power: province.enemyPower,
      })),
    },
  },
  explore_loot_pool: {
    config_type: "explore_loot_pool",
    config_version: "explore_loot_pool_p3_v1",
    ruleset_version: "ruleset_p3_exploration_v1",
    reward_config_version: "reward_p3_exploration_v1",
    payload: {
      budget_rule: "胜利仍只掉落 1 个普通材料，不提高探索总收益预算。",
      forbidden_rewards: ["paid_jade", "ancient_treasure", "limited_artifact", "unique_power_item"],
      pools: Object.entries(exploreLootPools).map(([provinceId, pool]) => ({
        province_id: provinceId,
        materials: pool.map((item) => ({
          item_id: item.itemId,
          name: item.name,
          source_hint: item.sourceHint,
          usage_hint: item.usageHint,
        })),
      })),
    },
  },
  enemy_trait: {
    config_type: "enemy_trait",
    config_version: "enemy_trait_p3_v1",
    ruleset_version: "ruleset_p3_exploration_v1",
    reward_config_version: "reward_p3_exploration_v1",
    payload: {
      effect_scope: "怪物特性只影响服务端战斗表现、战报解释和技能推荐提示。",
      enemies: Object.entries(exploreEnemyPools).flatMap(([provinceId, pool]) =>
        pool.map((enemy) => ({
          enemy_id: enemy.enemyId,
          province_id: provinceId,
          name: enemy.enemyName,
          skill_name: enemy.skillName,
          traits: enemy.traits,
          flavor: enemy.flavor,
        })),
      ),
    },
  },
  explore_event_link_rule: {
    config_type: "explore_event_link_rule",
    config_version: "explore_event_link_rule_p3_v1",
    ruleset_version: "ruleset_p3_exploration_v1",
    reward_config_version: "reward_p1_7_v1",
    payload: {
      rule: "探索领取后按最近战斗特性和掉落材料为奇遇事件加权，不改变奇遇奖励边界。",
      links: [
        { event_type: "herb_trace", boosted_by: ["low_herb", "pill_dust", "毒蚀"] },
        {
          event_type: "ruin_echo",
          boosted_by: ["raw_iron", "artifact_soul", "inscription_rune", "高防"],
        },
        { event_type: "tower_rift", boosted_by: ["tower_sigil", "array_sand", "阵痕"] },
        { event_type: "wandering_caravan", boosted_by: ["spirit_wood", "battle_mark", "灵敏"] },
      ],
      forbidden_rewards: ["paid_jade", "ancient_treasure", "limited_artifact", "unique_power_item"],
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
  material_chain: {
    config_type: "material_chain",
    config_version: materialChainConfigVersion,
    ruleset_version: "ruleset_p3_v1",
    reward_config_version: "reward_p3_v1",
    payload: {
      sources: materialSourceConfigs,
      balance_profiles: materialBalanceProfiles,
      warnings: buildProductionBalanceWarnings(),
      forbidden_outputs: [
        "paid_jade",
        "ancient_treasure",
        "limited_equipment",
        "unique_power_item",
      ],
    },
  },
  tower: {
    config_type: "tower",
    config_version: "tower_p1_v1",
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
    config_version: rankConfigVersion,
    ruleset_version: rankRulesetVersion,
    reward_config_version: rankRewardConfigVersion,
    payload: {
      rank_types: supportedRankTypes,
      reward_preview: rankRewardPreview,
      title_rewards: rankTitleRewards,
      reward_boundary: rankRewardBoundary,
      anti_brush_rule: rankAntiBrushRule,
    },
  },
  era_rank: {
    config_type: "era_rank",
    config_version: rankConfigVersion,
    ruleset_version: rankRulesetVersion,
    reward_config_version: rankRewardConfigVersion,
    payload: {
      era_id: "era_mvp_001",
      rank_types: ["production", "era", "inner_world", "faction"],
      snapshot_rule: "读取排行榜时生成最新快照，真实赛季结算可复用 rank_snapshot / rank_entry",
      title_rewards: rankTitleRewards,
      era_blessing: {
        cap_percent: eraBlessingCapPercent,
        rule: "多个跨纪元称号只继承展示，纪元祝福有效值不超过 1%，不叠加滚雪球。",
      },
      anti_brush_rule: rankAntiBrushRule,
      reward_boundary: rankRewardBoundary,
    },
  },
  event: {
    config_type: "event",
    config_version: eventConfigVersion,
    ruleset_version: eventRulesetVersion,
    reward_config_version: eventRewardConfigVersion,
    payload: {
      async_rule: eventAsyncRule,
      reward_boundary: eventRewardBoundary,
      events: eventTemplateConfigs.map((event) => ({
        event_id: event.eventId,
        event_type: event.eventType,
        name: event.name,
        target_progress: event.targetProgress,
        action_point_cost: event.actionPointCost,
        contribution_per_action: event.contributionPerAction,
        rank_score_per_action: event.rankScorePerAction,
        reward_preview: event.reward,
      })),
    },
  },
  activity_template: {
    config_type: "activity_template",
    config_version: eventConfigVersion,
    ruleset_version: eventRulesetVersion,
    reward_config_version: eventRewardConfigVersion,
    payload: {
      templates: eventTemplateConfigs.map((event) => ({
        template_id: event.eventId,
        activity_type: event.eventType,
        name: event.name,
        async_enabled: true,
        schedule_rule: "活动期内全天可提交行动",
        settlement_rule: "基础进度奖励可补偿，排行冲刺奖励不补发",
        reward_boundary: eventRewardBoundary,
        announcement_template: {
          title: event.announcementTitle,
          content: event.announcementContent,
        },
      })),
    },
  },
  merge_dry_run: {
    config_type: "merge_dry_run",
    config_version: "merge_dry_run_p1_v1",
    ruleset_version: "ruleset_p1_merge_v1",
    reward_config_version: "reward_p1_merge_v1",
    payload: {
      mode: "dry_run_only",
      merge_conditions: [
        "目标服同纪元",
        "排行先冻结",
        "订单和保底先校验",
        "宗门同名冲突生成改名建议",
      ],
      rank_freeze_rule: "dry-run 只读取 rank_snapshot / rank_entry，不锁定真实排行。",
      inheritance_rule:
        "付费仙玉、月卡剩余天数、抽卡保底、展示外观只生成检查报告，不在 dry-run 中迁移。",
      execution_rule: "真实合服执行入口预留但默认不可用，必须人工确认并单独发布。",
    },
  },
  story_presentation: {
    config_type: "story_presentation",
    config_version: storyConfigVersion,
    ruleset_version: storyRulesetVersion,
    reward_config_version: "reward_p2_story_none_v1",
    payload: {
      scrolls: storyScrollConfigs.map((scroll) => ({
        scroll_id: scroll.scrollId,
        title: scroll.title,
        subtitle: scroll.subtitle,
        chapter_id: scroll.chapterId,
        unlock_condition: scroll.unlockCondition,
        source_types: scroll.sourceTypes,
        battle_types: scroll.battleTypes,
        fragment_count: scroll.fragments.length,
        fallback_text: scroll.fallbackText,
      })),
      sensitive_filter_terms: sensitiveStoryTerms,
      reward_mutation_allowed: false,
      websocket_settlement_allowed: false,
    },
  },
  era_collection: {
    config_type: "era_collection",
    config_version: collectionConfigVersion,
    ruleset_version: collectionRulesetVersion,
    reward_config_version: collectionRewardBoundaryVersion,
    payload: {
      collections: eraCollectionConfigs.map((collection) => ({
        collection_id: collection.collectionId,
        name: collection.name,
        collection_type: collection.collectionType,
        rarity: collection.rarity,
        source_type: collection.sourceType,
        source_hint: collection.sourceHint,
        display_positions: collection.displayPositions,
        inherit_rule: collection.inheritRule,
        duplicate_convert: collection.duplicateConvert,
        blessing_percent: Math.min(collection.blessingPercent, collectionBlessingCapPercent),
        unlock_hint: collection.unlockHint,
        stat_bonus: null,
      })),
      display_slots: collectionDisplaySlots.map((slot) => ({
        slot_id: slot.slotId,
        name: slot.name,
        allowed_types: slot.allowedTypes,
      })),
      inheritance_boundary:
        "多纪元收藏只继承展示、回看、图鉴和纪念物；不继承攻击、防御、掉落、贡献或排行倍率。",
      blessing_cap_percent: collectionBlessingCapPercent,
      duplicate_rule: "重复收藏只转收藏材料或展示等级，不产生战力。",
      reward_mutation_allowed: false,
      stat_bonus_allowed: false,
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
  appearance_plus: {
    config_type: "appearance_plus",
    config_version: appearancePlusConfigVersion,
    ruleset_version: appearancePlusRulesetVersion,
    reward_config_version: appearancePlusRewardBoundaryVersion,
    payload: {
      appearances: appearancePlusConfigs.map((appearance) => ({
        appearance_id: appearance.appearanceId,
        name: appearance.name,
        appearance_type: appearance.appearanceType,
        display_slot: appearance.displaySlot,
        source_type: appearance.sourceType,
        source_hint: appearance.sourceHint,
        owner_scope: appearance.ownerScope,
        required_role: appearance.requiredRole ?? null,
        display_positions: appearance.preview.displayPositions,
        preview_sample: appearance.preview.sampleText,
        stat_bonus: null,
      })),
      display_slots: appearancePlusSlots.map((slot) => ({
        slot_id: slot.slotId,
        name: slot.name,
        allowed_types: slot.allowedTypes,
      })),
      boundary: {
        stat_bonus_allowed: false,
        reward_mutation_allowed: false,
        contribution_multiplier_allowed: false,
        drop_rate_allowed: false,
      },
      inheritance_rule: "深度外观只继承展示状态，不继承战力、掉落、贡献或排行倍率。",
      sect_decoration_rule: "宗门驻地装饰只影响宗门展示，不改变宗门产出或仓库规则。",
    },
  },
  mentor_rule: {
    config_type: "mentor_rule",
    config_version: mentorConfigVersion,
    ruleset_version: socialRulesetVersion,
    reward_config_version: socialRewardConfigVersion,
    payload: {
      rule: mentorRule,
      risk_ruleset_version: socialRiskRulesetVersion,
      boundary:
        "导师关系只提供指导、少量绑定材料和荣誉记录，不发付费仙玉、九大古宝或唯一战力道具。",
    },
  },
  sect_diplomacy: {
    config_type: "sect_diplomacy",
    config_version: diplomacyConfigVersion,
    ruleset_version: socialRulesetVersion,
    reward_config_version: socialRewardConfigVersion,
    payload: {
      diplomacy_rules: diplomacyRules,
      boundary: diplomacyBoundary,
      settlement_rule:
        "宗门外交只改变协作关系和公告展示，不绕过 PVP 匹配、新手保护、九塔行动令和贡献衰减。",
    },
  },
  sect_hire: {
    config_type: "sect_hire",
    config_version: hireConfigVersion,
    ruleset_version: socialRulesetVersion,
    reward_config_version: socialRewardConfigVersion,
    payload: {
      hire_rules: hireRules,
      boundary: hireBoundary,
      risk_ruleset_version: socialRiskRulesetVersion,
      forbidden_assets: ["付费仙玉", "绑定道具转移", "限定产物", "九大古宝本体", "唯一战力道具"],
      contribution_multiplier_allowed: false,
      rank_score_allowed: false,
    },
  },
  transfer_rule: {
    config_type: "transfer_rule",
    config_version: transferConfigVersion,
    ruleset_version: transferRulesetVersion,
    reward_config_version: transferSettlementConfigVersion,
    payload: {
      rule: transferRule,
      risk_ruleset_version: transferRiskRulesetVersion,
      boundary:
        "P2 转服只开放 dry-run、申请、人工审核和执行预留；默认不开放自由转服，不迁移真实资产。",
    },
  },
  inner_world: {
    config_type: "inner_world",
    config_version: innerWorldConfigVersion,
    ruleset_version: "ruleset_p1_inner_world_v1",
    reward_config_version: innerWorldRewardConfigVersion,
    payload: {
      unlock: {
        realm_required: innerWorldUnlockRealm,
        chapter_required: innerWorldUnlockChapter,
        hint: "化神 / 神躯或第四章后开启内天地",
      },
      assignment_rule: {
        default_minutes: innerWorldDefaultAssignmentMinutes,
        async_claim: true,
        daily_core_time_boundary: "内天地只提供异步派驻和一键收取，不增加固定在线压力",
      },
      levels: innerWorldLevelConfigs,
      creatures: innerWorldCreatureConfigs,
      province_rewards: innerWorldProvinceRewards,
      creature_upgrade_cost: innerWorldCreatureUpgradeCost,
      support_rule: {
        daily_limit: innerWorldDailySupportLimit,
        supports: innerWorldSupportConfigs,
      },
      output_boundary:
        "内天地不产出付费货币、九大古宝本体、限定本命法宝或可交易付费产物，所有材料默认绑定",
    },
  },
  faction_route: {
    config_type: "faction_route",
    config_version: factionConfigVersion,
    ruleset_version: "ruleset_p1_faction_v1",
    reward_config_version: factionRewardConfigVersion,
    payload: {
      unlock: {
        realm_required: factionUnlockRealm,
        chapter_required: factionUnlockChapter,
        hint: "化神 / 神躯或第五章后开启仙魔分流",
      },
      routes: factionRouteConfigs.map((config) => toFactionRouteConfigState({ config })),
      transfer_rule: {
        cooldown_days: factionTransferCooldownDays,
        base_cost: factionTransferBaseCost,
        reputation_clear_rate: factionTransferReputationClearRate,
        task_required: true,
      },
      sect_alignment_rule:
        "成仙对应仙盟宗门，成魔对应魔宗宗门，散修对应中立宗门；冲突时不能参与该宗门阵营集结",
      reward_boundary:
        "阵营奖励以称号、展示外观、纪元史册、绑定资源为主，不发唯一战力道具，不提高全服贡献倍率",
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
