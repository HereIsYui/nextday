import { describe, expect, it } from "vitest";
import {
  buildExploreEventCommand,
  exploreEventIdFromCommandState,
  mergePendingExploreEvents,
  pendingExploreEventsFromCommandState,
  pendingExploreEventsFromValues,
  withoutExploreEventInstructions,
} from "./explore-event-actions";

describe("探索奇遇选项", () => {
  const pendingEvent = {
    choices: [
      {
        choice_id: "collect",
        description: "采集灵草",
        label: "顺势采药",
        reward_preview: "凝露草 ×1",
      },
    ],
    description: "山道旁有一簇异草。",
    event_id: "event_001",
    status: "pending",
    title: "路遇灵草",
  };

  it("仅将待处理奇遇转换为可点击选项，并生成文字指令", () => {
    expect(
      pendingExploreEventsFromValues([pendingEvent, { ...pendingEvent, status: "resolved" }]),
    ).toEqual([
      {
        choices: [
          {
            choiceId: "collect",
            description: "采集灵草",
            label: "顺势采药",
            rewardPreview: "凝露草 ×1",
          },
        ],
        description: "山道旁有一簇异草。",
        eventId: "event_001",
        title: "路遇灵草",
      },
    ]);
    expect(buildExploreEventCommand("event_001", "collect")).toBe("奇遇 event_001 collect");
  });

  it("从文字指令结果中读取待选和已处理奇遇", () => {
    const claimState = { result: { event: pendingEvent } };
    const pendingState = { result: { events: [pendingEvent] } };
    const resolvedState = { result: { event: { ...pendingEvent, status: "resolved" } } };

    expect(pendingExploreEventsFromCommandState(claimState)).toHaveLength(1);
    expect(pendingExploreEventsFromCommandState(pendingState)).toHaveLength(1);
    expect(pendingExploreEventsFromCommandState(resolvedState)).toEqual([]);
    expect(exploreEventIdFromCommandState(resolvedState)).toBe("event_001");
  });

  it("合并新奇遇时按事件标识更新，不重复显示", () => {
    const updatedEvent = {
      ...pendingEvent,
      choices: [{ ...pendingEvent.choices[0], label: "顺势采药（更新）" }],
    };
    const current = pendingExploreEventsFromValues([pendingEvent]);
    const next = pendingExploreEventsFromValues([updatedEvent]);

    expect(mergePendingExploreEvents(current, next)).toEqual([
      expect.objectContaining({
        eventId: "event_001",
        choices: [expect.objectContaining({ label: "顺势采药（更新）" })],
      }),
    ]);
  });

  it("网页有选项卡时隐藏文字指令，保留奇遇叙事和结算结果", () => {
    const events = pendingExploreEventsFromValues([pendingEvent]);
    const entries = [
      { text: "探索结算完成：冀州共 1 战，胜 1 场。" },
      { text: "探索奇遇“路遇灵草”：山道旁有一簇异草。" },
      { text: "请从以下选项中选择，并输入对应指令：" },
      { text: "选项 collect：顺势采药（凝露草 ×1）。输入：奇遇 event_001 collect" },
    ];

    expect(withoutExploreEventInstructions(entries, events)).toEqual([
      { text: "探索结算完成：冀州共 1 战，胜 1 场。" },
      { text: "探索奇遇“路遇灵草”：山道旁有一簇异草。" },
    ]);
    expect(withoutExploreEventInstructions(entries, [])).toEqual(entries);
  });
});
