import { describe, expect, it } from "vitest";
import { exploreActionCard, formatRemainingDuration } from "./explore-action-card";

describe("当前行旅状态卡", () => {
  it("探索进行中显示倒计时，奇遇状态优先显示", () => {
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
