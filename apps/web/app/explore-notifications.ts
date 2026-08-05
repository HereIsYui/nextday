import type { ExploreEventState, ExploreResponse } from "@nextday/shared";
import type { TerminalMessageBatch } from "./terminal-message-batch";

const minimumPollDelayMs = 1_000;
const maximumPollDelayMs = 10_000;
const completionGracePeriodMs = 500;

type ExploreCompletionState = Pick<
  ExploreResponse,
  "can_claim" | "completes_at" | "count" | "province_name" | "status"
>;

type ExplorePollingState = Pick<ExploreResponse, "completes_at" | "event_trigger_at" | "status">;

type PendingExploreEvent = Pick<ExploreEventState, "event_id" | "status" | "title">;
type AutoResolvedExploreEvent = Pick<
  ExploreEventState,
  "choices" | "event_id" | "resolution_mode" | "selected_choice_id" | "status" | "title"
>;

export function createExploreCompletionNotice(
  explore: ExploreCompletionState,
): TerminalMessageBatch | null {
  if (explore.status !== "completed" || !explore.can_claim) {
    return null;
  }

  return {
    lines: [
      `${explore.province_name}的 ${explore.count} 次探索已结束。输入“领取探索”结算战报与奖励。`,
    ],
    tone: "success",
  };
}

export function createExploreEventNotice(event: PendingExploreEvent): TerminalMessageBatch | null {
  if (event.status !== "pending" || !event.event_id) {
    return null;
  }

  return {
    lines: [`探索途中触发奇遇“${event.title}”，请在下方直接选择。`],
    tone: "warning",
  };
}

export function createExploreEventAutoResolveNotice(
  event: AutoResolvedExploreEvent,
): TerminalMessageBatch | null {
  if (event.status !== "resolved" || event.resolution_mode !== "auto" || !event.event_id) {
    return null;
  }

  const selectedChoice = event.choices.find(
    (choice) => choice.choice_id === event.selected_choice_id,
  );
  return {
    lines: [
      `奇遇“${event.title}”久未选择，已自动${selectedChoice ? `择取“${selectedChoice.label}”` : "处理"}。`,
    ],
    tone: "system",
  };
}

export function getExplorePollDelay(
  explore: ExplorePollingState | null,
  hasPendingEvent = false,
  now = Date.now(),
) {
  if (!explore || explore.status !== "pending") {
    return null;
  }

  const completesAt = new Date(explore.completes_at).getTime();
  if (Number.isNaN(completesAt)) {
    return maximumPollDelayMs;
  }

  const eventTriggerAt = explore.event_trigger_at
    ? new Date(explore.event_trigger_at).getTime()
    : Number.NaN;
  const nextCheckpoint =
    !hasPendingEvent && !Number.isNaN(eventTriggerAt) && eventTriggerAt <= now
      ? now
      : !hasPendingEvent && !Number.isNaN(eventTriggerAt) && eventTriggerAt > now
        ? Math.min(completesAt, eventTriggerAt)
        : completesAt;

  return Math.min(
    maximumPollDelayMs,
    Math.max(minimumPollDelayMs, nextCheckpoint - now + completionGracePeriodMs),
  );
}
