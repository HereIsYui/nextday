import type { DailyRouteResponse, NewPlayerRouteState } from "@nextday/shared";
import { describe, expect, it } from "vitest";
import {
  exploreActionCard,
  formatRemainingDuration,
  routeActionForStep,
  selectCompactActionRoute,
} from "./action-route-model";

const newPlayerRoute: NewPlayerRouteState = {
  config_version: "new_player_route_p1_9_v1",
  primary_action_hint: "explore",
  primary_step_id: "first_explore",
  progress_percent: 17,
  progress_text: "1/6",
  route_id: "first_30_minutes_ji",
  steps: [
    {
      action_hint: "overview",
      action_label: "查看冀州",
      detail: "已抵达冀州。",
      status: "done",
      step_id: "enter_ji",
      title: "初入冀州",
    },
    {
      action_hint: "explore",
      action_label: "开始探索",
      detail: "消耗行动令探索冀州。",
      status: "active",
      step_id: "first_explore",
      title: "第一次探索",
    },
    {
      action_hint: "explore_event",
      action_label: "继续探索",
      detail: "途中可能出现奇遇。",
      status: "pending",
      step_id: "resolve_event",
      title: "处理奇遇",
    },
  ],
  subtitle: "按顺序完成冀州初定。",
  title: "冀州初定",
};

const dailyRoute: DailyRouteResponse = {
  config_version: "daily_route_p3_v1",
  generated_at: "2026-08-05T10:00:00.000Z",
  next_refresh_hint: "完成行动后刷新。",
  primary_action_hint: "task",
  primary_step_id: "claim_task",
  progress_percent: 20,
  progress_text: "1/7",
  route_id: "daily_practice_p3",
  steps: [
    {
      action_hint: "task",
      action_label: "领取任务",
      detail: "初入冀州等待领取。",
      priority: 100,
      state_label: "可领取",
      status: "active",
      step_id: "claim_task",
      title: "先领已完成目标",
      view_state: "ready",
    },
    {
      action_hint: "explore",
      action_label: "开始探索",
      detail: "冀州可探索。",
      priority: 82,
      state_label: "可出发",
      status: "active",
      step_id: "start_explore",
      title: "推进州域探索",
      view_state: "ready",
    },
  ],
  subtitle: "按当前状态安排日课。",
  title: "今日修行路线",
};

describe("首页行动路线", () => {
  it("可领取的日常优先于新手路线，并保留新手进度提示", () => {
    const route = selectCompactActionRoute({ dailyRoute, newPlayerRoute });

    expect(route).toMatchObject({
      companion: { progressText: "1/6", title: "冀州初定", upcomingTitle: "第一次探索" },
      primaryStep: { step_id: "claim_task" },
      source: "daily",
      title: "今日修行路线",
    });
  });

  it("日常没有紧急行动时继续突出未完成的新手路线", () => {
    const route = selectCompactActionRoute({
      dailyRoute: {
        ...dailyRoute,
        steps: dailyRoute.steps.map((step) => ({ ...step, view_state: "jump" as const })),
      },
      newPlayerRoute,
    });

    expect(route).toMatchObject({
      companion: { title: "今日修行路线" },
      primaryStep: { step_id: "first_explore" },
      source: "new_player",
    });
  });

  it("路线操作只生成既有文字命令，不携带内部标识", () => {
    const step = newPlayerRoute.steps[1];
    if (!step) {
      throw new Error("缺少测试路线步骤");
    }

    expect(routeActionForStep(step, "冀州")).toEqual({
      command: "探索 冀州 1",
      displayCommand: "开始探索",
    });
  });

  it("探索状态优先提示奇遇，并为进行中的探索提供倒计时文案", () => {
    const pending = exploreActionCard({
      currentExplore: {
        can_claim: false,
        completes_at: "2026-08-05T10:01:15.000Z",
        count: 2,
        province_name: "冀州",
        status: "pending",
      },
      now: Date.parse("2026-08-05T10:00:00.000Z"),
      pendingEvent: null,
    });
    const event = exploreActionCard({
      currentExplore: {
        can_claim: false,
        completes_at: "2026-08-05T10:01:15.000Z",
        count: 2,
        province_name: "冀州",
        status: "pending",
      },
      now: Date.parse("2026-08-05T10:00:00.000Z"),
      pendingEvent: { choiceCount: 2, title: "炉火余温" },
    });

    expect(pending).toMatchObject({
      action: "waiting",
      detail: "冀州 · 2 次探索正在进行，约 1 分 15 秒后可领取。",
    });
    expect(event).toMatchObject({
      action: "event",
      detail: "炉火余温 · 2 个选择待定；冀州探索仍在途中",
    });
    expect(
      formatRemainingDuration("2026-08-05T10:00:00.000Z", Date.parse("2026-08-05T10:00:01.000Z")),
    ).toBe("即将完成");
  });
});
