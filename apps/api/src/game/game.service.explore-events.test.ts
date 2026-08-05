import { describe, expect, it } from "vitest";
import type { ExploreEventChoiceConfig } from "./game.constants";
import { pickAutomaticExploreEventChoice, planExploreEvent } from "./game.service";

describe("探索奇遇计划", () => {
  it("以稳定概率在探索中段安排奇遇", () => {
    const startedAt = new Date("2026-08-05T00:00:00.000Z");
    const plans = Array.from({ length: 100 }, (_, index) =>
      planExploreEvent(`explore_plan_${index}`, startedAt, 100),
    );
    const triggered = plans.find((plan) => plan !== null);

    expect(plans.some((plan) => plan === null)).toBe(true);
    expect(triggered?.triggerAt.getTime()).toBeGreaterThan(startedAt.getTime() + 34_000);
    expect(triggered?.triggerAt.getTime()).toBeLessThan(startedAt.getTime() + 66_000);
  });

  it("自动选择优先修为奖励，没有时选第一项", () => {
    const choices: ExploreEventChoiceConfig[] = [
      choice("material", "0"),
      choice("cultivation", "35"),
    ];

    expect(pickAutomaticExploreEventChoice(choices)?.choiceId).toBe("cultivation");
    expect(
      pickAutomaticExploreEventChoice([choice("first", "0"), choice("second", "0")])?.choiceId,
    ).toBe("first");
  });
});

function choice(choiceId: string, cultivation: string): ExploreEventChoiceConfig {
  return {
    choiceId,
    description: choiceId,
    label: choiceId,
    rewardPreview: choiceId,
    rewards: { cultivation, items: [], spirit_stone: "0" },
  };
}
