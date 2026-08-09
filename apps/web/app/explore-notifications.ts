import type { ExploreEventState } from "@nextday/shared";
import type { TerminalMessageBatch } from "./terminal-message-batch";

type PendingExploreEvent = Pick<ExploreEventState, "event_id" | "status" | "title">;
type AutoResolvedExploreEvent = Pick<
  ExploreEventState,
  "choices" | "event_id" | "resolution_mode" | "selected_choice_id" | "status" | "title"
>;

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
