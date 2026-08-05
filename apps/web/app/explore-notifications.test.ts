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
      status: "completed",
    } satisfies Pick<
      ExploreResponse,
      "can_claim" | "completes_at" | "count" | "province_name" | "status"
    >;

    expect(createExploreCompletionNotice(explore)).toEqual({
      lines: ["冀州的 2 次探索已结束。输入“领取探索”结算战报与奖励。"],
      tone: "success",
    });
  });

  it("将待选择奇遇主动引导至网页选项卡", () => {
    const event = {
      event_id: "event_001",
      status: "pending",
      title: "路遇灵草",
    } satisfies Pick<ExploreEventState, "event_id" | "status" | "title">;

    expect(createExploreEventNotice(event)).toEqual({
      lines: ["探索途中触发奇遇“路遇灵草”，请在下方直接选择。"],
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
