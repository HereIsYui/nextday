import { describe, expect, it } from "vitest";
import {
  getLevelRequirement,
  getRealmProgression,
  getStageLevelCount,
  maximumRealm,
  realmProgressionConfigVersion,
  realmProgressionConfigs,
  stagesPerRealm,
} from "./realm-progression.constants";

describe("境界总览配置", () => {
  it("按文章结构返回九境三小境界和递增等级数量", () => {
    const progression = getRealmProgression("qi");

    expect(progression).toMatchObject({
      route: "qi",
      maximum_realm: maximumRealm,
      stages_per_realm: stagesPerRealm,
      config_version: realmProgressionConfigVersion,
    });
    expect(progression.realms).toHaveLength(realmProgressionConfigs.length);
    expect(progression.realms.every((realm) => realm.stages.length === 3)).toBe(true);
    expect(progression.realms.map((realm) => realm.max_level)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 12,
    ]);
  });

  it("每个大境界等级需求精确覆盖等级预算", () => {
    for (const config of realmProgressionConfigs) {
      const transitionCount = config.levelRequirements.length;
      expect(transitionCount).toBe(getStageLevelCount(config.realmId) * 3);
      const levelBudget = config.levelRequirements.reduce((sum, value) => sum + value, 0);
      expect(levelBudget + config.breakthroughCultivation).toBe(config.realmBudget);
      expect(
        getLevelRequirement(config.realmId, 3, getStageLevelCount(config.realmId)),
      ).toBeGreaterThan(0n);
    }
  });

  it("炼体路线返回专属小境界名称并保留真魔十二级", () => {
    const progression = getRealmProgression("body");
    expect(progression.realms[0]?.stages[0]?.qi_name).toBe("淬皮");
    expect(progression.realms[8]?.body_name).toBe("真魔");
    expect(progression.realms[8]?.max_level).toBe(12);
  });
});
