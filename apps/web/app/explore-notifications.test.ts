import type { ExploreEventState, ExploreResponse } from "@nextday/shared";
import { describe, expect, it } from "vitest";
import {
  createExploreCompletionNotice,
  createExploreEventNotice,
  getExplorePollDelay,
} from "./explore-notifications";

describe("探索主动传音", () => {
  it("在探索完成待领取时给出精确的结算指令", () => {
    const explore = {
      can_claim: true,
      completes_at: "2026-08-05T10:00:00.000Z",
      count: 2,
      province_name: "冀州",
      record_id: "explore_001",
      status: "completed",
    } satisfies Pick<
      ExploreResponse,
      "can_claim" | "completes_at" | "count" | "province_name" | "record_id" | "status"
    >;

    expect(createExploreCompletionNotice(explore)).toEqual({
      lines: ["冀州的 2 次探索已结束。输入“领取探索 explore_001”结算战报与奖励。"],
      tone: "success",
    });
  });

  it("将待选择奇遇及每个可输入指令主动传出", () => {
    const event = {
      choices: [
        {
          choice_id: "collect",
          description: "采集灵草",
          label: "顺势采药",
          reward_preview: "凝露草 ×1",
        },
        {
          choice_id: "leave",
          description: "继续赶路",
          label: "谨慎离开",
          reward_preview: "无额外奖励",
        },
      ],
      description: "山道旁有一簇异草。",
      event_id: "event_001",
      status: "pending",
      title: "路遇灵草",
    } satisfies Pick<
      ExploreEventState,
      "choices" | "description" | "event_id" | "status" | "title"
    >;

    expect(createExploreEventNotice(event)).toEqual({
      lines: [
        "探索途中触发奇遇“路遇灵草”：山道旁有一簇异草。",
        "请从以下选项中选择，并输入对应指令：",
        "选项 collect：顺势采药（凝露草 ×1）",
        "输入：奇遇 event_001 collect",
        "选项 leave：谨慎离开（无额外奖励）",
        "输入：奇遇 event_001 leave",
      ],
      tone: "warning",
    });
  });

  it("仅为进行中的探索安排下一次检查", () => {
    const pendingExplore = {
      completes_at: "1970-01-01T00:00:02.000Z",
      status: "pending",
    } satisfies Pick<ExploreResponse, "completes_at" | "status">;

    expect(getExplorePollDelay(pendingExplore, 0)).toBe(2_500);
    expect(getExplorePollDelay({ ...pendingExplore, status: "completed" }, 0)).toBeNull();
  });
});
