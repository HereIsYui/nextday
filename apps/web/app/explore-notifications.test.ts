import type { ExploreEventState } from "@nextday/shared";
import { describe, expect, it } from "vitest";
import {
  createExploreEventAutoResolveNotice,
  createExploreEventNotice,
} from "./explore-notifications";

describe("长期探索奇遇传音", () => {
  it("将待选择奇遇主动发送给用户", () => {
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

  it("奇遇超时自动结算后说明最终选择", () => {
    const event = {
      choices: [
        { choice_id: "collect", description: "", label: "收拢丹尘", reward_preview: "丹尘 ×1" },
        { choice_id: "warm_fire", description: "", label: "借火行功", reward_preview: "修为 35" },
      ],
      event_id: "event_001",
      resolution_mode: "auto",
      selected_choice_id: "warm_fire",
      status: "resolved",
      title: "炉火余温",
    } satisfies Pick<
      ExploreEventState,
      "choices" | "event_id" | "resolution_mode" | "selected_choice_id" | "status" | "title"
    >;

    expect(createExploreEventAutoResolveNotice(event)).toEqual({
      lines: ["奇遇“炉火余温”久未选择，已自动择取“借火行功”。"],
      tone: "system",
    });
  });
});
