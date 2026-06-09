import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type P1SimulationConfig,
  formatP1BalanceTuningReport,
  runP1BalanceTuning,
  runP1Simulation,
  validateP1SimulationConfig,
} from "./index";

const configPath = resolve(__dirname, "../../../configs/p1-simulation.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as P1SimulationConfig;

describe("P1-10 数值与掉落节奏校准", () => {
  it("配置覆盖前 7 天画像、低阶材料和行动令校准", () => {
    const result = validateP1SimulationConfig(config);

    expect(result).toEqual({ valid: true, errors: [] });
    expect(config.drop_tuning?.day_range).toBe(7);
    expect(config.drop_tuning?.required_profile_ids).toEqual(
      expect.arrayContaining([
        "novice_free",
        "standard_free",
        "small_monthly",
        "large_monthly",
        "vip3",
        "vip4",
        "hardcore_free",
      ]),
    );
    expect(config.drop_tuning?.material_flows.map((item) => item.category)).toEqual(
      expect.arrayContaining(["alchemy", "forge", "common", "tower"]),
    );
  });

  it("前 7 天画像能对比成长速度、资源消耗和行动令压力", () => {
    const report = runP1BalanceTuning(config);
    const standardFree = report.profiles.find((profile) => profile.profile_id === "standard_free");
    const smallMonthly = report.profiles.find((profile) => profile.profile_id === "small_monthly");
    const vip3 = report.profiles.find((profile) => profile.profile_id === "vip3");
    const hardcoreFree = report.profiles.find((profile) => profile.profile_id === "hardcore_free");

    expect(report.profiles.every((profile) => profile.daily_reports.length === 7)).toBe(true);
    expect(standardFree?.day7_realm).toBe("练气 / 锻体");
    expect(hardcoreFree?.day7_cultivation).toBeGreaterThan(standardFree?.day7_cultivation ?? 0);
    expect(smallMonthly?.cultivation_gap_vs_standard_free).toBeLessThanOrEqual(
      config.drop_tuning?.thresholds.max_monthly_day7_cultivation_gap ?? 0,
    );
    expect(vip3?.cultivation_gap_vs_standard_free).toBeLessThanOrEqual(
      config.drop_tuning?.thresholds.max_vip_day7_cultivation_gap ?? 0,
    );
    expect(report.profiles.every((profile) => profile.core_minutes_required <= 30)).toBe(true);
    expect(
      report.profiles.every(
        (profile) =>
          profile.action_token_pressure <=
          (config.drop_tuning?.thresholds.max_action_token_pressure ?? 0),
      ),
    ).toBe(true);
  });

  it("默认掉落校准不会让低阶材料断供或明显通胀", () => {
    const report = runP1BalanceTuning(config);

    expect(report.materials.length).toBeGreaterThanOrEqual(5);
    expect(report.materials.every((material) => material.status === "balanced")).toBe(true);
    expect(
      report.profiles.every((profile) =>
        profile.materials.every((material) => material.day7_balance >= material.min_day7_balance),
      ),
    ).toBe(true);
  });

  it("总模拟报表会带上 P1-10 调参与风险段落", () => {
    const report = runP1Simulation(config);
    const balanceTuning = report.balance_tuning;

    if (!balanceTuning) {
      throw new Error("P1-10 调参报告未生成");
    }

    const formatted = formatP1BalanceTuningReport(balanceTuning);

    expect(balanceTuning.tuning_id).toBe("p1_10_first_7_days_v1");
    expect(formatted).toContain("P1-10 前 7 天画像");
    expect(formatted).toContain("P1-10 掉落校准");
    expect(formatted).toContain("P1-10 卡点与风险报告");
    expect(report.warnings.every((warning) => warning.severity !== "critical")).toBe(true);
  });

  it("异常配置能指出材料断点、行动令压力、过快毕业和付费差距", () => {
    const dropTuning = config.drop_tuning;

    if (!dropTuning) {
      throw new Error("缺少 P1-10 drop_tuning 配置");
    }

    const unsafeConfig: P1SimulationConfig = {
      ...config,
      drop_tuning: {
        ...dropTuning,
        action_token: {
          ...dropTuning.action_token,
          day7_core_required: 118,
        },
        material_flows: dropTuning.material_flows.map((material) =>
          material.material_id === "low_herb"
            ? { ...material, daily_base_income: 1, min_day7_balance: 2 }
            : material,
        ),
        thresholds: {
          ...dropTuning.thresholds,
          max_day7_realm_target_ratio: 0.45,
          max_whale_day7_cultivation_gap: 0.1,
        },
      },
    };
    const report = runP1BalanceTuning(unsafeConfig);
    const warningCodes = report.warnings.map((warning) => warning.code);

    expect(warningCodes).toEqual(
      expect.arrayContaining([
        "p1_10_material_shortage",
        "p1_10_action_token_pressure",
        "p1_10_fast_graduation",
        "p1_10_whale_gap",
      ]),
    );
    expect(report.warnings.every((warning) => warning.suggestion.length > 0)).toBe(true);
  });
});
