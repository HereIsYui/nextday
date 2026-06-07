import type {
  CultivationRoute,
  EntitlementTier,
  RiskStatus,
  SettlementStatus,
} from "@nextday/shared";

export const cultivationRouteLabels: Record<CultivationRoute, string> = {
  qi: "练气",
  body: "炼体",
};

export const entitlementTierLabels: Record<EntitlementTier, string> = {
  free: "免费",
  vip1: "VIP1",
  vip2: "VIP2",
  vip3: "VIP3",
  vip4: "VIP4",
  small_monthly: "小月卡",
  large_monthly: "大月卡",
};

export const riskStatusLabels: Record<RiskStatus, string> = {
  normal: "正常",
  rate_limited: "限频",
  delayed_settlement: "延迟结算",
  decayed: "收益衰减",
  manual_review: "人工审核",
};

export const settlementStatusLabels: Record<SettlementStatus, string> = {
  settled: "已结算",
  delayed: "延迟中",
  rejected: "已拒绝",
};

export const currencyLabels = {
  spirit_stone: "灵石",
  immortal_stone: "仙石",
  jade_paid: "仙玉",
  jade_bound: "绑定仙玉",
  era_point: "纪元积分",
} as const;

export const provinceLabels = {
  ji: "冀州",
  yan: "兖州",
  qing: "青州",
  xu: "徐州",
  yang: "扬州",
  jing: "荆州",
  yu: "豫州",
  liang: "梁州",
  yong: "雍州",
} as const;

export const mvpProvinceLabels = provinceLabels;
