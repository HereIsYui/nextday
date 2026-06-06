import type { EntitlementTier, MonthlyCardType } from "@nextday/shared";
import { tierOrder } from "./commerce.constants";

export function isActiveDate(date: Date): boolean {
  return date.getTime() > Date.now();
}

export function getEffectiveVipTier(vipLevel: number): EntitlementTier {
  if (vipLevel <= 0) {
    return "free";
  }
  if (vipLevel >= 4) {
    return "vip4";
  }

  return `vip${vipLevel}` as EntitlementTier;
}

export function getMonthlyTier(cardType: MonthlyCardType): EntitlementTier {
  return cardType;
}

export function maxTier(left: EntitlementTier, right: EntitlementTier): EntitlementTier {
  return tierOrder.indexOf(right) > tierOrder.indexOf(left) ? right : left;
}

export function automationRank(queueType: string): number {
  if (queueType === "core_daily") {
    return 3;
  }
  if (queueType === "simple_cross_play") {
    return 2;
  }
  if (queueType === "single_play") {
    return 1;
  }

  return 0;
}
