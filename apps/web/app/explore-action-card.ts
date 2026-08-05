import type { ExploreResponse } from "@nextday/shared";

export interface ExploreActionCard {
  action: "claim" | "event" | "waiting";
  detail: string;
  title: string;
}

export function exploreActionCard(input: {
  currentExplore: Pick<
    ExploreResponse,
    "can_claim" | "completes_at" | "count" | "province_name" | "status"
  > | null;
  now: number;
  pendingEvent: { choiceCount: number; title: string } | null;
}): ExploreActionCard | null {
  const { currentExplore, now, pendingEvent } = input;
  if (pendingEvent) {
    const journeyText =
      currentExplore?.status === "pending" ? `；${currentExplore.province_name}探索仍在途中` : "";
    return {
      action: "event",
      detail: `${pendingEvent.title} · ${pendingEvent.choiceCount} 个选择待定${journeyText}`,
      title: "途中奇遇待选择",
    };
  }
  if (currentExplore?.status === "completed" && currentExplore.can_claim) {
    return {
      action: "claim",
      detail: `${currentExplore.province_name} · ${currentExplore.count} 次探索已结束，战报与掉落待领取。`,
      title: "探索已完成",
    };
  }
  if (currentExplore?.status === "pending") {
    return {
      action: "waiting",
      detail: `${currentExplore.province_name} · ${currentExplore.count} 次探索正在进行，${formatRemainingDuration(
        currentExplore.completes_at,
        now,
      )}后可领取。`,
      title: "探索进行中",
    };
  }
  return null;
}

export function formatRemainingDuration(completesAt: string, now: number): string {
  const completesAtTime = Date.parse(completesAt);
  if (Number.isNaN(completesAtTime)) {
    return "即将完成";
  }
  const remainingSeconds = Math.max(0, Math.ceil((completesAtTime - now) / 1_000));
  if (remainingSeconds <= 0) {
    return "即将完成";
  }
  if (remainingSeconds < 60) {
    return `约 ${remainingSeconds} 秒`;
  }
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return seconds > 0 ? `约 ${minutes} 分 ${seconds} 秒` : `约 ${minutes} 分`;
}
