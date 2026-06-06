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
    config_version: "action_m1_v1",
    ruleset_version: "ruleset_m1_v1",
    reward_config_version: "reward_m1_v1",
    payload: {
      action_points: { daily_restore: 60, storage_cap: 180 },
      batch_limits: { free: 5, vip3: 10, large_monthly: 20 },
    },
  },
};
