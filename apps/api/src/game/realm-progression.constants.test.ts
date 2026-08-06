import { describe, expect, it } from "vitest";
import {
  getRealmProgression,
  levelsPerRealm,
  maximumRealm,
  realmProgressionConfigVersion,
  realmProgressionConfigs,
} from "./realm-progression.constants";

describe("境界总览配置", () => {
  it("从境界配置完整映射九境和每境九层", () => {
    const progression = getRealmProgression("qi");

    expect(progression).toMatchObject({
      route: "qi",
      maximum_realm: maximumRealm,
      levels_per_realm: levelsPerRealm,
      config_version: realmProgressionConfigVersion,
    });
    expect(progression.realms).toHaveLength(realmProgressionConfigs.length);
    expect(progression.realms).toEqual(
      realmProgressionConfigs.map((config) => ({
        realm_id: config.realmId,
        qi_name: config.qiName,
        body_name: config.bodyName,
        min_level: 1,
        max_level: levelsPerRealm,
        levels: Array.from({ length: levelsPerRealm }, (_, index) => index + 1),
        breakthrough_cultivation: String(config.breakthroughCultivation),
        power_bonus_percent: config.powerBonusPercent,
        unlocks: config.unlocks,
      })),
    );
  });
});
