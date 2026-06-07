import type {
  ActivityRecordState,
  ActivitySummaryState,
  ActivityTemplateState,
  RewardBundle,
} from "@nextday/shared";
import type { EventInstance, EventRecord } from "@prisma/client";
import type { EventTemplateConfig } from "./events.constants";
import { eventRewardBoundary } from "./events.constants";

export function toActivityTemplateState(config: EventTemplateConfig): ActivityTemplateState {
  return {
    event_id: config.eventId,
    event_type: config.eventType,
    name: config.name,
    description: config.description,
    action_label: config.actionLabel,
    async_enabled: true,
    target_progress: config.targetProgress,
    action_point_cost: config.actionPointCost,
    contribution_per_action: config.contributionPerAction,
    rank_score_per_action: config.rankScorePerAction,
    reward_preview: config.reward,
    reward_boundary: eventRewardBoundary,
    announcement_template: {
      title: config.announcementTitle,
      content: config.announcementContent,
    },
  };
}

export function toActivityRecordState(record: EventRecord): ActivityRecordState {
  return {
    event_record_id: record.eventRecordId,
    event_instance_id: record.eventInstanceId,
    event_id: record.eventId,
    player_id: record.playerId,
    period_key: record.periodKey,
    province_id: record.provinceId,
    sect_id: record.sectId,
    progress: record.progress,
    target_progress: record.targetProgress,
    contribution: record.contribution.toString(),
    rank_score: record.rankScore.toString(),
    reward_state: record.rewardState,
    event_config_version: record.eventConfigVersion,
    reward_config_version: record.rewardConfigVersion,
    ruleset_version: record.rulesetVersion,
    created_at: record.createdAt.toISOString(),
    settled_at: record.settledAt?.toISOString() ?? null,
  };
}

export function toActivitySummaryState(input: {
  instance: EventInstance;
  config: EventTemplateConfig;
  record: EventRecord | null;
}): ActivitySummaryState {
  const progress = input.record?.progress ?? 0;
  const rewardState = input.record?.rewardState ?? "unsettled";

  return {
    event_instance_id: input.instance.eventInstanceId,
    event_id: input.config.eventId,
    event_type: input.config.eventType,
    name: input.config.name,
    description: input.config.description,
    status: input.instance.status,
    async_enabled: input.instance.asyncEnabled,
    starts_at: input.instance.startsAt.toISOString(),
    ends_at: input.instance.endsAt.toISOString(),
    settlement_at: input.instance.settlementAt.toISOString(),
    progress,
    target_progress: input.config.targetProgress,
    reward_state: rewardState,
    claimable: rewardState === "claimable",
    action_label: input.config.actionLabel,
    reward_preview: input.config.reward as RewardBundle,
    reward_boundary: eventRewardBoundary,
  };
}
