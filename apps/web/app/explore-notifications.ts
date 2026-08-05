import type { ExploreEventState, ExploreResponse } from "@nextday/shared";
import type { TerminalMessageBatch } from "./terminal-message-batch";

const minimumPollDelayMs = 1_000;
const maximumPollDelayMs = 10_000;
const completionGracePeriodMs = 500;

type ExploreCompletionState = Pick<
  ExploreResponse,
  "can_claim" | "completes_at" | "count" | "province_name" | "status"
>;

type ExplorePollingState = Pick<ExploreResponse, "completes_at" | "status">;

type PendingExploreEvent = Pick<ExploreEventState, "event_id" | "status" | "title">;

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

export function getExplorePollDelay(explore: ExplorePollingState | null, now = Date.now()) {
  if (!explore || explore.status !== "pending") {
    return null;
  }

  const completesAt = new Date(explore.completes_at).getTime();
  if (Number.isNaN(completesAt)) {
    return maximumPollDelayMs;
  }

  return Math.min(
    maximumPollDelayMs,
    Math.max(minimumPollDelayMs, completesAt - now + completionGracePeriodMs),
  );
}
