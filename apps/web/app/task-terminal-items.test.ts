import { describe, expect, it } from "vitest";
import {
  formatTaskItem,
  taskItemFromClaimResult,
  taskItemsFromResult,
} from "./task-terminal-items";

describe("任务传音条目", () => {
  it("只展示任务摘要，不将任务标识拼入可见文本", () => {
    const items = taskItemsFromResult({
      tasks: [
        {
          progress_value: 1,
          status: "completed",
          target_value: 1,
          task_id: "chapter_unlock_ji",
          title: "塔裂冀州",
        },
        {
          progress_value: 0,
          status: "in_progress",
          target_value: 1,
          task_id: "novice_craft_alchemy",
          title: "第一炉丹",
        },
      ],
    });

    expect(items).toHaveLength(2);
    expect(formatTaskItem(items?.[0] as NonNullable<typeof items>[number])).toBe(
      "塔裂冀州：1/1（可领取）",
    );
    expect(formatTaskItem(items?.[0] as NonNullable<typeof items>[number])).not.toContain(
      "chapter_unlock_ji",
    );
  });

  it("从领取结果读取已领取任务，以便撤下原按钮", () => {
    expect(
      taskItemFromClaimResult({
        task: {
          progress_value: 1,
          status: "claimed",
          target_value: 1,
          task_id: "daily_explore",
          title: "今日历练",
        },
      }),
    ).toMatchObject({ status: "claimed", taskId: "daily_explore", title: "今日历练" });
  });
});
