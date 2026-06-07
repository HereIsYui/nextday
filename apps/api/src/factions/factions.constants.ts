import type { FactionRouteConfigState, FactionRouteId, RewardBundle } from "@nextday/shared";

export const factionConfigVersion = "faction_route_p1_v1";
export const factionRewardConfigVersion = "reward_faction_p1_v1";
export const factionUnlockRealm = 5;
export const factionUnlockChapter = 5;
export const factionTransferCooldownDays = 14;
export const factionTransferReputationClearRate = 60;

export const factionTransferBaseCost: RewardBundle = {
  spirit_stone: "500",
};

export interface FactionRouteConfig extends FactionRouteConfigState {
  transferTaskId: string;
  initialReputation: number;
  transferReputation: number;
}

export const factionRouteConfigs: FactionRouteConfig[] = [
  {
    route_id: "immortal",
    name: "成仙",
    stance_label: "仙盟",
    theme: "净化、护盾、守塔、民望",
    core_goal: "重封九塔，稳定九州灵脉，削弱最终魔王的魔相。",
    task_chain: ["天衡问心", "镇魔誓约", "云阙留名"],
    weekly_focus: ["九塔镇封", "魔染净化", "护送补给"],
    reputation_rule: "通过镇封、净化、护送和仙盟任务获得仙盟声望。",
    transferTaskId: "transfer_immortal_oath",
    initialReputation: 120,
    transferReputation: 80,
    title_id: "title_yunque_zhenjun",
    title_name: "云阙真君",
    chronicle_title: "云阙题名",
    ending_summary: "纪元史册会记录其重封九塔、扶正灵脉的功绩。",
    display_appearance_id: "faction_card_immortal",
    reward_boundary: "奖励以仙盟称号、名片样式、纪元纪念和绑定材料为主，不发唯一战力道具。",
  },
  {
    route_id: "demon",
    name: "成魔",
    stance_label: "魔宗",
    theme: "侵蚀、吞噬、破封、压制",
    core_goal: "撬动九塔裂隙，积累九渊魔势，影响最终魔王的魔相规则。",
    task_chain: ["九渊听令", "血誓破封", "魔潮留痕"],
    weekly_focus: ["破封行动", "魔潮推进", "裂隙争夺"],
    reputation_rule: "通过破封、裂隙、魔潮和魔宗任务获得魔宗声望。",
    transferTaskId: "transfer_demon_oath",
    initialReputation: 120,
    transferReputation: 80,
    title_id: "title_jiuyuan_mojun",
    title_name: "九渊魔君",
    chronicle_title: "九渊留名",
    ending_summary: "纪元史册会记录其破封九渊、引动魔潮的选择。",
    display_appearance_id: "faction_card_demon",
    reward_boundary: "奖励以魔宗称号、战报样式、纪元纪念和绑定材料为主，不发唯一战力道具。",
  },
  {
    route_id: "wanderer",
    name: "散修",
    stance_label: "散修盟",
    theme: "调停、雇佣、奇遇、商路",
    core_goal: "维持九州生存和利益平衡，在仙魔拉锯中保留中立结局。",
    task_chain: ["天衡旁观", "散盟契书", "中州留名"],
    weekly_focus: ["中立调停", "资源雇佣", "奇遇游历"],
    reputation_rule: "通过调停、雇佣、商路和散修任务获得散修声望。",
    transferTaskId: "transfer_wanderer_oath",
    initialReputation: 120,
    transferReputation: 80,
    title_id: "title_tianheng_sanren",
    title_name: "天衡散人",
    chronicle_title: "散修行卷",
    ending_summary: "纪元史册会记录其周旋九州、调停仙魔的游历。",
    display_appearance_id: "faction_card_wanderer",
    reward_boundary: "奖励以中立称号、纪元积分、展示外观和绑定材料为主，不获得仙魔专属终局称号。",
  },
];

export function getFactionRouteConfig(routeId: string): FactionRouteConfig | null {
  return factionRouteConfigs.find((config) => config.route_id === routeId) ?? null;
}

export function factionRouteName(routeId: string): string {
  if (routeId === "undecided") {
    return "未定";
  }

  return getFactionRouteConfig(routeId)?.name ?? routeId;
}

export function factionToSectAlignment(routeId: string): "immortal" | "demon" | "neutral" | null {
  if (routeId === "immortal" || routeId === "demon") {
    return routeId;
  }
  if (routeId === "wanderer") {
    return "neutral";
  }

  return null;
}

export function isFactionRouteId(value: string): value is Exclude<FactionRouteId, "undecided"> {
  return value === "immortal" || value === "demon" || value === "wanderer";
}
