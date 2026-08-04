import type {
  FactionRouteConfigState,
  FactionStateSummary,
  FactionTransferRecordState,
  RewardBundle,
  SectAlignment,
} from "@nextday/shared";
import type { FactionTransferRecord, PlayerFactionState, Sect } from "@prisma/client";
import {
  factionRewardConfigVersion,
  type factionRouteConfigs,
  factionRouteName,
  factionToSectAlignment,
  factionTransferBaseCost,
  factionTransferCooldownDays,
  factionTransferReputationClearRate,
  getFactionRouteConfig,
} from "./factions.constants";

export function toFactionRouteConfigState(input: {
  config: (typeof factionRouteConfigs)[number];
}): FactionRouteConfigState {
  const {
    transferTaskId: _transferTaskId,
    initialReputation: _initial,
    transferReputation: _transfer,
    ...state
  } = input.config;
  return state;
}

export function toFactionStateSummary(input: {
  state: PlayerFactionState;
  playerRealm: number;
  playerChapter: number;
  sect: Pick<Sect, "alignment"> | null;
  unlockRealm: number;
  unlockChapter: number;
}): FactionStateSummary {
  const unlocked =
    input.playerRealm >= input.unlockRealm || input.playerChapter >= input.unlockChapter;
  const routeConfig = getFactionRouteConfig(input.state.route);
  const expectedSectAlignment = factionToSectAlignment(input.state.route);
  const sectAlignment = input.sect?.alignment ?? null;
  const sectConflict =
    Boolean(expectedSectAlignment) &&
    Boolean(sectAlignment) &&
    sectAlignment !== expectedSectAlignment;

  return {
    route: input.state.route,
    route_name: factionRouteName(input.state.route),
    unlocked,
    unlock_hint: unlocked ? "仙魔路线已开启" : "化神 / 神躯或第五章后开启仙魔分流",
    reputation: {
      immortal: input.state.reputationImmortal,
      demon: input.state.reputationDemon,
      wanderer: input.state.reputationWanderer,
    },
    route_chosen_at: input.state.routeChosenAt?.toISOString() ?? null,
    transfer_cooldown_until: input.state.transferCooldownUntil?.toISOString() ?? null,
    transfer_available:
      input.state.route !== "undecided" &&
      (!input.state.transferCooldownUntil ||
        input.state.transferCooldownUntil.getTime() <= Date.now()),
    transfer_count: input.state.transferCount,
    title_id: input.state.titleId,
    title_name: routeConfig?.title_name ?? null,
    chronicle_title: input.state.chronicleTitle,
    ending_summary: input.state.endingSummary,
    display_appearance_id: input.state.displayAppearanceId,
    sect_alignment: sectAlignment as SectAlignment | string | null,
    sect_conflict: sectConflict,
    sect_conflict_hint: sectConflict
      ? "个人路线与宗门立场不一致，部分宗门叙事将以旁观者视角呈现。"
      : null,
    config_version: input.state.configVersion,
    reward_config_version: input.state.rewardConfigVersion,
  };
}

export function toFactionTransferRecordState(
  record: FactionTransferRecord,
): FactionTransferRecordState {
  return {
    transfer_record_id: record.transferRecordId,
    from_route: record.fromRoute,
    to_route: record.toRoute,
    task_id: record.taskId,
    cost_summary: normalizeRewardBundle(record.costSummary),
    reputation_clear_summary: normalizeRecord(record.reputationClearSummary),
    sect_conflict: record.sectConflict,
    previous_sect_alignment: record.previousSectAlignment,
    title_id: record.titleId,
    display_appearance_id: record.displayAppearanceId,
    created_at: record.createdAt.toISOString(),
  };
}

export function factionTransferRuleState() {
  return {
    cooldown_days: factionTransferCooldownDays,
    base_cost: factionTransferBaseCost,
    reputation_clear_rate: factionTransferReputationClearRate,
  };
}

export function factionRewardVersion() {
  return factionRewardConfigVersion;
}

function normalizeRewardBundle(value: unknown): RewardBundle {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as RewardBundle;
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
