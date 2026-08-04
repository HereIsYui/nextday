import type { ActivityEventType, RewardBundle } from "@nextday/shared";

export const eventConfigVersion = "event_p1_v1";
export const eventRewardConfigVersion = "reward_event_p1_v1";
export const eventRulesetVersion = "ruleset_p1_event_v1";
export const eventRiskRulesetVersion = "risk_p1_event_v1";

export const eventAsyncRule =
  "活动全天可提交行动，基础参与奖励可补偿，排行冲刺奖励不补发，不要求固定时间在线。";

export const eventRewardBoundary =
  "活动奖励只发绑定材料、荣誉、外观或少量基础资源，不发付费仙玉、唯一战力道具、九大古宝本体、限定法宝或倍率奖励。";

export interface EventTemplateConfig {
  eventId: string;
  eventType: ActivityEventType;
  name: string;
  description: string;
  actionLabel: string;
  targetProgress: number;
  actionPointCost: number;
  contributionPerAction: number;
  rankScorePerAction: number;
  countLimit: number;
  reward: RewardBundle;
  announcementTitle: string;
  announcementContent: string;
}

export const eventTemplateConfigs: EventTemplateConfig[] = [
  {
    eventId: "event_p1_jiuzhou_travel",
    eventType: "jiuzhou_travel",
    name: "九州游历",
    description: "道友可任选已开放州域提交游历札记，累计见闻后领取绑定游历奖励。",
    actionLabel: "提交游历札记",
    targetProgress: 3,
    actionPointCost: 2,
    contributionPerAction: 60,
    rankScorePerAction: 30,
    countLimit: 3,
    reward: {
      spirit_stone: "360",
      items: [{ item_id: "event_travel_note", name: "九州游历札", count: 3, bind_type: "bound" }],
    },
    announcementTitle: "九州游历开启",
    announcementContent: "活动期间可随时提交州域游历札记，不要求固定时间在线。",
  },
  {
    eventId: "event_p1_craft_trial",
    eventType: "craft_trial",
    name: "丹器加试",
    description: "以丹器心得换取活动积分，奖励只包含绑定丹器纪念材料。",
    actionLabel: "呈交丹器心得",
    targetProgress: 2,
    actionPointCost: 1,
    contributionPerAction: 45,
    rankScorePerAction: 35,
    countLimit: 2,
    reward: {
      spirit_stone: "240",
      items: [{ item_id: "event_danqi_medal", name: "丹器试牌", count: 2, bind_type: "bound" }],
    },
    announcementTitle: "丹器加试开启",
    announcementContent: "炼丹炼器心得可异步提交，活动奖励不影响炼丹炼器概率。",
  },
  {
    eventId: "event_p1_sect_celebration",
    eventType: "sect_celebration",
    name: "宗门同贺",
    description: "宗门弟子可提交贺礼；未入宗玩家也可提交个人贺礼，不影响个人修行进度。",
    actionLabel: "提交同贺贺礼",
    targetProgress: 2,
    actionPointCost: 1,
    contributionPerAction: 50,
    rankScorePerAction: 25,
    countLimit: 2,
    reward: {
      spirit_stone: "260",
      items: [{ item_id: "event_sect_ribbon", name: "同贺绶带", count: 2, bind_type: "bound" }],
    },
    announcementTitle: "宗门同贺开启",
    announcementContent: "宗门同贺支持随时提交，跳宗不会提高奖励倍率。",
  },
  {
    eventId: "event_p1_return_support",
    eventType: "return_support",
    name: "归山扶持",
    description: "回归玩家可领取低压追赶目标；当前 MVP 以异步扶持样板开放。",
    actionLabel: "登记归山名册",
    targetProgress: 1,
    actionPointCost: 0,
    contributionPerAction: 20,
    rankScorePerAction: 0,
    countLimit: 1,
    reward: {
      spirit_stone: "500",
      action_points: 10,
      items: [{ item_id: "event_return_pack", name: "归山修行囊", count: 1, bind_type: "bound" }],
    },
    announcementTitle: "归山扶持开启",
    announcementContent: "归山扶持只提供追赶资源，不参与排行冲刺。",
  },
  {
    eventId: "event_p1_compensation",
    eventType: "compensation",
    name: "停服补偿",
    description: "用于维护、Bug 或结算异常后的基础补偿样板，可由运营公告配合发放。",
    actionLabel: "领取补偿名帖",
    targetProgress: 1,
    actionPointCost: 0,
    contributionPerAction: 0,
    rankScorePerAction: 0,
    countLimit: 1,
    reward: {
      spirit_stone: "300",
      action_points: 5,
      items: [{ item_id: "event_comp_letter", name: "补偿名帖", count: 1, bind_type: "bound" }],
    },
    announcementTitle: "补偿活动开启",
    announcementContent: "补偿活动只提供基础资源，不补发排行冲刺奖励。",
  },
];
