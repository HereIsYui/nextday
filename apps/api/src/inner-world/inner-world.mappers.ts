import type {
  InnerWorldAssignmentState,
  InnerWorldCreatureState,
  InnerWorldLawRecordState,
  InnerWorldStateSummary,
  InnerWorldSupportRecordState,
  RewardBundle,
} from "@nextday/shared";
import type {
  InnerWorldAssignment,
  InnerWorldCreature,
  InnerWorldLawRecord,
  InnerWorldState,
  InnerWorldSupportRecord,
} from "@prisma/client";
import { provinceConfigs } from "../game/game.constants";
import {
  getInnerWorldLevelConfig,
  innerWorldDailySupportLimit,
  innerWorldUnlockChapter,
  innerWorldUnlockRealm,
} from "./inner-world.constants";

export function toInnerWorldStateSummary(input: {
  state: InnerWorldState;
  playerRealm: number;
  playerChapter: number;
  activeAssignmentCount: number;
  claimableAssignmentCount: number;
}): InnerWorldStateSummary {
  const unlocked =
    input.playerRealm >= innerWorldUnlockRealm || input.playerChapter >= innerWorldUnlockChapter;
  const levelConfig = getInnerWorldLevelConfig(input.state.worldLevel);

  return {
    unlocked,
    unlock_hint: unlocked ? "内天地已开启" : "化神 / 神躯或第四章后开启内天地",
    world_level: input.state.worldLevel,
    law_level: input.state.lawLevel,
    law_exp: input.state.lawExp,
    next_law_exp_required: levelConfig.nextLawExpRequired,
    creature_capacity: input.state.creatureCapacity,
    assignment_limit: input.state.assignmentLimit,
    active_assignment_count: input.activeAssignmentCount,
    claimable_assignment_count: input.claimableAssignmentCount,
    support_count_today: input.state.supportCountToday,
    support_limit_daily: innerWorldDailySupportLimit,
    config_version: input.state.configVersion,
    reward_config_version: input.state.rewardConfigVersion,
  };
}

export function toInnerWorldCreatureState(creature: InnerWorldCreature): InnerWorldCreatureState {
  return {
    creature_id: creature.creatureId,
    creature_type: creature.creatureType,
    name: creature.name,
    level: creature.level,
    affinity_province_id: creature.affinityProvinceId,
    status: creature.status,
    assignment_bonus_summary: normalizeRecord(creature.assignmentBonusSummary),
  };
}

export function toInnerWorldAssignmentState(
  assignment: InnerWorldAssignment,
  creature?: Pick<InnerWorldCreature, "name"> | null,
  now = new Date(),
): InnerWorldAssignmentState {
  const province = provinceConfigs.find((item) => item.provinceId === assignment.provinceId);
  const ended = assignment.endsAt.getTime() <= now.getTime();
  const status = assignment.status === "active" && ended ? "claimable" : assignment.status;

  return {
    assignment_id: assignment.assignmentId,
    creature_id: assignment.creatureId,
    creature_name: creature?.name ?? "内天地生灵",
    province_id: assignment.provinceId,
    province_name: province?.name ?? assignment.provinceId,
    status,
    started_at: assignment.startedAt.toISOString(),
    ends_at: assignment.endsAt.toISOString(),
    claimed_at: assignment.claimedAt?.toISOString() ?? null,
    remaining_seconds: Math.max(0, Math.ceil((assignment.endsAt.getTime() - now.getTime()) / 1000)),
    rewards: normalizeRewardBundle(assignment.rewardSnapshot),
    law_exp_gain: assignment.lawExpGain,
  };
}

export function toInnerWorldLawRecordState(record: InnerWorldLawRecord): InnerWorldLawRecordState {
  return {
    law_record_id: record.lawRecordId,
    law_type: record.lawType,
    exp_delta: record.expDelta,
    source_type: record.sourceType,
    source_id: record.sourceId,
    before_level: record.beforeLevel,
    after_level: record.afterLevel,
    before_exp: record.beforeExp,
    after_exp: record.afterExp,
    created_at: record.createdAt.toISOString(),
  };
}

export function toInnerWorldSupportRecordState(
  record: InnerWorldSupportRecord,
): InnerWorldSupportRecordState {
  const province = provinceConfigs.find((item) => item.provinceId === record.provinceId);

  return {
    support_record_id: record.supportRecordId,
    province_id: record.provinceId,
    province_name: province?.name ?? record.provinceId,
    tower_id: record.towerId,
    support_type: record.supportType,
    cost_summary: normalizeRewardBundle(record.costSummary),
    reward_summary: normalizeRewardBundle(record.rewardSummary),
    contribution_summary: normalizeRecord(record.contributionSummary),
    created_at: record.createdAt.toISOString(),
  };
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
