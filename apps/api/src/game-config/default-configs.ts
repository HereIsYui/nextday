import type { ConfigEnvelope } from "@nextday/shared";

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
};
