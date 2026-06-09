export const mentorConfigVersion = "mentor_rule_p2_4_v1";
export const diplomacyConfigVersion = "sect_diplomacy_p2_4_v1";
export const hireConfigVersion = "sect_hire_p2_4_v1";
export const socialRewardConfigVersion = "reward_p2_social_v1";
export const socialRiskRulesetVersion = "risk_p2_social_v1";
export const socialRulesetVersion = "ruleset_p2_4_v1";

export const mentorRule = {
  mentor_condition: {
    chapter_required: 2,
    description: "导师需完成第二章前置，示范完整新手链路。",
  },
  apprentice_condition: {
    max_active_relation: 1,
    description: "徒弟同一时间只能有一名导师。",
  },
  apply_limit_rule: {
    pending_limit: 3,
    cooldown_hours_after_dissolve: 24,
  },
  task_group: [
    {
      task_id: "mentor_first_guidance",
      name: "初问道",
      target: "完成一次探索、一次生产或一次九塔行动后可领取指导奖励。",
      reward: {
        spirit_stone: "80",
        items: [{ item_id: "low_herb", count: 1, bind_type: "bound" }],
      },
    },
  ],
  graduation_rule: {
    claim_required: true,
    cooldown_hours_after_graduate: 72,
  },
  reward_boundary: {
    paid_jade: "0",
    ancient_treasure: false,
    unique_power_item: false,
    allowed: ["少量灵石", "绑定普通材料", "荣誉记录"],
  },
  anti_abuse_rule: {
    same_device_review: "记录风险摘要，异常收益可延迟",
    frequency_limit: "固定间隔或高频申请只记录和限频，不强验证码",
  },
};

export const diplomacyRules = [
  {
    diplomacy_type: "alliance",
    name: "盟约",
    assist_scope: ["活动协作", "宗门公告", "防守提醒"],
    cooldown_hours: 24,
  },
  {
    diplomacy_type: "hostility",
    name: "敌对",
    assist_scope: ["宣告立场", "资源点竞争提醒"],
    cooldown_hours: 24,
  },
  {
    diplomacy_type: "aid",
    name: "援助",
    assist_scope: ["宗门建设协助", "活动协作"],
    cooldown_hours: 12,
  },
  {
    diplomacy_type: "defense",
    name: "协防",
    assist_scope: ["防守提醒", "九塔补给协作"],
    cooldown_hours: 12,
  },
] as const;

export const diplomacyBoundary = {
  approval_rule: "宗主或长老可发起和审批外交提案。",
  pvp_boundary_rule: "外交不绕过 PVP 匹配、新手保护和收益衰减。",
  tower_boundary_rule: "外交不改变九塔贡献结算、行动令消耗或延迟结算。",
};

export const hireRules = [
  {
    hire_type: "explore_support",
    name: "探索协助",
    allowed_action_scope: { actions: ["explore"], max_count: 3 },
    reward: { spirit_stone: "50", paid_jade: "0", items: [] },
  },
  {
    hire_type: "sect_build",
    name: "宗门建设",
    allowed_action_scope: { actions: ["sect_task"], max_count: 1 },
    reward: { spirit_stone: "60", paid_jade: "0", items: [] },
  },
  {
    hire_type: "tower_supply",
    name: "九塔补给",
    allowed_action_scope: { actions: ["tower_supply"], max_count: 1, contribution_multiplier: 0 },
    reward: { spirit_stone: "40", paid_jade: "0", items: [] },
  },
  {
    hire_type: "event_support",
    name: "活动协助",
    allowed_action_scope: { actions: ["event_progress"], max_count: 2 },
    reward: { spirit_stone: "40", paid_jade: "0", items: [] },
  },
] as const;

export const hireBoundary = {
  reward_escrow_rule: "雇佣奖励由服务端托管，只发普通灵石和荣誉记录。",
  risk_decay_rule: "同宗门、同设备或重复目标刷分会拒绝、衰减或延迟结算。",
  forbidden_asset_rule: "禁止转移付费仙玉、绑定道具、限定产物、九大古宝本体和唯一战力道具。",
};
