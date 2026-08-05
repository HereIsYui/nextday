import { describe, expect, it } from "vitest";
import { mergeCommandEntries } from "./terminal-message-batch";

describe("九州传音消息批次", () => {
  it("将同一命令响应中的多条消息合并为一条传音", () => {
    const batch = mergeCommandEntries([
      { entry_id: "entry_1", tone: "info", text: "云游道友，练气第 1 层。" },
      { entry_id: "entry_2", tone: "info", text: "修为 20，可收束 5。" },
      { entry_id: "entry_3", tone: "warning", text: "洞府已有可领取产出。" },
    ]);

    expect(batch).toEqual({
      lines: ["云游道友，练气第 1 层。", "修为 20，可收束 5。", "洞府已有可领取产出。"],
      tone: "warning",
    });
  });

  it("保留不同消息中的重复文本及其原始顺序", () => {
    const batch = mergeCommandEntries([
      { tone: "success", text: "奖励已到账。" },
      { tone: "success", text: "奖励已到账。" },
      { tone: "error", text: "后续操作暂不可用。" },
    ]);

    expect(batch).toEqual({
      lines: ["奖励已到账。", "奖励已到账。", "后续操作暂不可用。"],
      tone: "error",
    });
  });

  it("合并主动提醒批次时保留单个批次内的重复消息", () => {
    const batch = mergeCommandEntries([
      {
        tone: "success",
        lines: ["冀州探索已结束。", "冀州探索已结束。"],
      },
      {
        tone: "warning",
        lines: ["探索奇遇待选择。", "输入：奇遇 event_001 collect"],
      },
    ]);

    expect(batch).toEqual({
      lines: [
        "冀州探索已结束。",
        "冀州探索已结束。",
        "探索奇遇待选择。",
        "输入：奇遇 event_001 collect",
      ],
      tone: "warning",
    });
  });

  it("忽略无效内容，避免生成空传音", () => {
    expect(mergeCommandEntries([null, {}, "  ", { text: "" }])).toBeNull();
  });
});
