import type {
  DailyRouteResponse,
  DailyRouteStepState,
  ExploreResponse,
  NewPlayerRouteState,
  NewPlayerRouteStepState,
} from "@nextday/shared";

export type ActionRouteStep = DailyRouteStepState | NewPlayerRouteStepState;

export interface RouteAction {
  command: string;
  displayCommand: string;
}

export interface CompactActionRoute {
  companion: {
    progressText: string;
    title: string;
    upcomingTitle: string;
  } | null;
  followingSteps: ActionRouteStep[];
  primaryStep: ActionRouteStep;
  progressPercent: number;
  progressText: string;
  source: "daily" | "new_player";
  subtitle: string;
  title: string;
}

export interface ExploreActionCard {
  action: "claim" | "event" | "waiting";
  detail: string;
  title: string;
}

export function selectCompactActionRoute(input: {
  dailyRoute: DailyRouteResponse | null;
  newPlayerRoute: NewPlayerRouteState | null;
}): CompactActionRoute | null {
  const { dailyRoute, newPlayerRoute } = input;
  const hasActiveNewPlayerRoute = Boolean(
    newPlayerRoute?.steps.some((step) => step.status !== "done"),
  );
  const dailyPrimaryStep = dailyRoute ? primaryStepOf(dailyRoute) : null;
  const shouldPrioritizeDailyRoute = Boolean(
    dailyPrimaryStep &&
      isDailyRouteStep(dailyPrimaryStep) &&
      dailyPrimaryStep.view_state === "ready",
  );

  if (dailyRoute && (shouldPrioritizeDailyRoute || !hasActiveNewPlayerRoute)) {
    return compactRoute("daily", dailyRoute, hasActiveNewPlayerRoute ? newPlayerRoute : null);
  }
  if (newPlayerRoute && hasActiveNewPlayerRoute) {
    return compactRoute("new_player", newPlayerRoute, dailyRoute);
  }
  if (dailyRoute) {
    return compactRoute("daily", dailyRoute, null);
  }
  if (newPlayerRoute) {
    return compactRoute("new_player", newPlayerRoute, null);
  }
  return null;
}

export function routeActionForStep(
  step: ActionRouteStep,
  provinceName: string | null,
): RouteAction | null {
  if (!canRunRouteStep(step)) {
    return null;
  }

  const displayCommand = step.action_label;
  switch (step.action_hint) {
    case "claim_explore":
      return { command: "领取探索", displayCommand };
    case "collect_cave":
      return { command: "领取洞府", displayCommand };
    case "explore":
      return {
        command: provinceName ? `探索 ${provinceName} 1` : "探索",
        displayCommand,
      };
    case "explore_event":
      return { command: "奇遇", displayCommand };
    case "growth":
      return { command: "材料 炼丹", displayCommand };
    case "multiplayer":
      return { command: "九塔", displayCommand };
    case "overview":
      return { command: "状态", displayCommand };
    case "task":
      return { command: "任务", displayCommand };
    default:
      return null;
  }
}

export function routeStepStateLabel(step: ActionRouteStep): string {
  if (isDailyRouteStep(step) && step.state_label) {
    return step.state_label;
  }
  return {
    active: "进行中",
    done: "已完成",
    pending: "待推进",
  }[step.status];
}

export function routeStepVisualState(step: ActionRouteStep): string {
  if (isDailyRouteStep(step) && step.view_state) {
    return step.view_state;
  }
  return step.status;
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

function compactRoute(
  source: CompactActionRoute["source"],
  route: DailyRouteResponse | NewPlayerRouteState,
  companionRoute: DailyRouteResponse | NewPlayerRouteState | null,
): CompactActionRoute {
  const primaryStep = primaryStepOf(route);
  const followingSteps = route.steps
    .filter((step) => step.step_id !== primaryStep.step_id && step.status !== "done")
    .slice(0, 2);
  const companionStep = companionRoute ? primaryStepOf(companionRoute) : null;

  return {
    companion:
      companionRoute && companionStep
        ? {
            progressText: companionRoute.progress_text,
            title: companionRoute.title,
            upcomingTitle: companionStep.title,
          }
        : null,
    followingSteps,
    primaryStep,
    progressPercent: route.progress_percent,
    progressText: route.progress_text,
    source,
    subtitle: route.subtitle,
    title: route.title,
  };
}

function primaryStepOf(route: DailyRouteResponse | NewPlayerRouteState): ActionRouteStep {
  return route.steps.find((step) => step.step_id === route.primary_step_id) ?? route.steps[0];
}

function canRunRouteStep(step: ActionRouteStep): boolean {
  if (step.status === "done") {
    return false;
  }
  if (!isDailyRouteStep(step)) {
    return step.status === "active";
  }
  return (
    step.view_state !== "blocked" && step.view_state !== "waiting" && step.view_state !== "done"
  );
}

function isDailyRouteStep(step: ActionRouteStep): step is DailyRouteStepState {
  return "view_state" in step;
}
