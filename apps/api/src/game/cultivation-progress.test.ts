import { describe, expect, it } from "vitest";
import { allocateCultivation } from "./cultivation-progress";
import { getLevelRequirement, getRealmConfig } from "./realm-progression.constants";

describe("统一修为结算", () => {
  it("完成小境界末级后进入下一小境界第一级", () => {
    const firstStageRequirements = [1, 2, 3].map((level) => getLevelRequirement(1, 1, level));
    const allocation = allocateCultivation(
      {
        currentRealm: 1,
        currentStage: 1,
        currentLevel: 1,
        cultivationValue: 0n,
      },
      firstStageRequirements.reduce((sum, value) => sum + value, 0n),
    );

    expect(allocation.currentStage).toBe(2);
    expect(allocation.currentLevel).toBe(1);
    expect(allocation.stageUps).toBe(1);
  });

  it("大境界末级完成后保留突破修为，不自动跨境", () => {
    const config = getRealmConfig(1);
    const levelBudget = config.levelRequirements.reduce((sum, value) => sum + value, 0);
    const allocation = allocateCultivation(
      {
        currentRealm: 1,
        currentStage: 1,
        currentLevel: 1,
        cultivationValue: 0n,
      },
      BigInt(levelBudget + config.breakthroughCultivation),
    );

    expect(allocation.currentRealm).toBe(1);
    expect(allocation.currentStage).toBe(3);
    expect(allocation.currentLevel).toBe(3);
    expect(allocation.cultivationValue).toBe(BigInt(config.breakthroughCultivation));
  });
});
