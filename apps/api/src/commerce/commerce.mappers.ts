import type {
  AncientTreasureStateSummary,
  AppearanceState,
  AutomationQueueState,
  ConvenienceStrategyState,
  GachaRecordState,
  GachaResultState,
  MonthlyCardDrawGrantState,
  MonthlyCardStateSummary,
  VipStateSummary,
} from "@nextday/shared";
import type {
  AncientTreasureState,
  AutomationQueue,
  ConvenienceStrategy,
  GachaRecord,
  MonthlyCardDrawGrant,
  MonthlyCardState,
  PlayerAppearance,
  PlayerVipState,
} from "@prisma/client";
import { ancientTreasures, appearanceConfigs } from "./commerce.constants";
import { getEffectiveVipTier, isActiveDate } from "./commerce.rules";

export function toMonthlyCardState(card: MonthlyCardState): MonthlyCardStateSummary {
  return {
    card_type: card.cardType as MonthlyCardStateSummary["card_type"],
    active: isActiveDate(card.activeUntil),
    active_until: card.activeUntil.toISOString(),
    remaining_days: card.remainingDays,
    last_claim_date: card.lastClaimDate,
  };
}

export function toMonthlyGrantState(grant: MonthlyCardDrawGrant): MonthlyCardDrawGrantState {
  return {
    grant_id: grant.grantId,
    card_type: grant.cardType as MonthlyCardDrawGrantState["card_type"],
    pool_type: grant.poolType as MonthlyCardDrawGrantState["pool_type"],
    grant_date: grant.grantDate,
    draw_count: grant.drawCount,
    used_count: grant.usedCount,
    expires_at: grant.expiresAt.toISOString(),
  };
}

export function toVipState(vip: PlayerVipState | null): VipStateSummary {
  if (!vip) {
    return {
      vip_level: 0,
      active: false,
      active_until: null,
      convenience_tier: "free",
    };
  }

  const active = !vip.activeUntil || isActiveDate(vip.activeUntil);
  return {
    vip_level: active
      ? (Math.min(4, Math.max(0, vip.vipLevel)) as VipStateSummary["vip_level"])
      : 0,
    active,
    active_until: vip.activeUntil?.toISOString() ?? null,
    convenience_tier: active ? getEffectiveVipTier(vip.vipLevel) : "free",
  };
}

export function toGachaResult(record: GachaRecord): GachaResultState {
  return {
    result_type: record.resultType as GachaResultState["result_type"],
    result_id: record.resultId,
    result_name: record.resultName,
    duplicate: record.duplicate,
    conversion: record.conversionSnapshot as GachaResultState["conversion"],
  };
}

export function toGachaRecordState(record: GachaRecord): GachaRecordState {
  return {
    gacha_id: record.gachaId,
    pool_type: record.poolType as GachaRecordState["pool_type"],
    cost_type: record.costType as GachaRecordState["cost_type"],
    result: toGachaResult(record),
    pity_before: record.pityBefore,
    pity_after: record.pityAfter,
    created_at: record.createdAt.toISOString(),
  };
}

export function toAncientTreasureSummary(
  state: AncientTreasureState | null,
  treasureId: string,
): AncientTreasureStateSummary {
  const config = ancientTreasures.find((item) => item.treasureId === treasureId);
  return {
    treasure_id: treasureId,
    name: config?.name ?? treasureId,
    owned: state?.owned ?? false,
    star_level: state?.starLevel ?? 0,
    fragment_count: state?.fragmentCount ?? 0,
    soul_count: state?.soulCount ?? 0,
  };
}

export function toConvenienceStrategyState(
  strategy: ConvenienceStrategy,
): ConvenienceStrategyState {
  return {
    strategy_id: strategy.strategyId,
    strategy_name: strategy.strategyName,
    strategy_type: strategy.strategyType,
    tier_at_create: strategy.tierAtCreate as ConvenienceStrategyState["tier_at_create"],
    config: strategy.configSnapshot as Record<string, unknown>,
    status: strategy.status,
  };
}

export function toAutomationQueueState(queue: AutomationQueue): AutomationQueueState {
  return {
    queue_id: queue.queueId,
    queue_type: queue.queueType,
    entitlement_tier: queue.entitlementTier as AutomationQueueState["entitlement_tier"],
    requested_actions: queue.requestedActions as Array<Record<string, unknown>>,
    accepted_actions: queue.acceptedActions as Array<Record<string, unknown>>,
    status: queue.status,
  };
}

export function toAppearanceState(
  appearance: PlayerAppearance | null,
  appearanceId: string,
): AppearanceState {
  const config = appearanceConfigs.find((item) => item.appearanceId === appearanceId);
  return {
    appearance_id: appearanceId,
    name: config?.name ?? appearanceId,
    appearance_type: config?.appearanceType ?? appearance?.appearanceType ?? "title_style",
    source_type: appearance?.sourceType ?? config?.sourceType ?? "activity",
    owned: Boolean(appearance),
    equipped: appearance?.equipped ?? false,
    inherited: appearance?.inherited ?? false,
    stat_bonus: null,
  };
}
