import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type P1SimulationConfig, runP1Simulation, validateP1SimulationConfig } from "./index";

const configPath = resolve(__dirname, "../../../configs/p1-simulation.json");
const config = JSON.parse(readFileSync(configPath, "utf8")) as P1SimulationConfig;

describe("P1 数值模拟配置", () => {
  it("配置能通过基础校验", () => {
    const result = validateP1SimulationConfig(config);

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("覆盖 P1 要求的玩家画像和服务器规模", () => {
    const profileIds = config.profiles.map((profile) => profile.profile_id);

    expect(config.active_player_counts).toEqual(expect.arrayContaining([30, 100, 300]));
    expect(profileIds).toEqual(
      expect.arrayContaining([
        "standard_free",
        "hardcore_free",
        "small_monthly",
        "large_monthly",
        "vip3",
        "vip4",
        "whale_light",
        "whale_hardcore",
      ]),
    );
  });

  it("模拟能输出成长、经济、古宝、抽卡和服务器报表", () => {
    const report = runP1Simulation(config);

    expect(report.profiles.length).toBe(config.profiles.length);
    expect(report.servers.map((server) => server.active_players)).toEqual([30, 100, 300]);

    const standardFree = report.profiles.find((profile) => profile.profile_id === "standard_free");
    const largeMonthly = report.profiles.find((profile) => profile.profile_id === "large_monthly");
    const whaleHardcore = report.profiles.find(
      (profile) => profile.profile_id === "whale_hardcore",
    );

    expect(standardFree?.day_reports.map((dayReport) => dayReport.day)).toEqual(config.report_days);
    expect(standardFree?.final_realm).toBe("真仙 / 真魔");
    expect(standardFree?.day_reports.find((report) => report.day === 20)?.realm).toBe(
      "筑基 / 筑身",
    );
    expect(standardFree?.day_reports.find((report) => report.day === 55)?.realm).toBe(
      "金丹 / 血丹",
    );
    expect(standardFree?.day_reports.find((report) => report.day === 20)?.level_max).toBe(4);
    expect(largeMonthly?.ancient_treasure_draws).toBeGreaterThan(700);
    expect(whaleHardcore?.limited_gacha_draw_budget).toBeGreaterThan(4000);
  });

  it("当前九大古宝进度只来自月卡赠抽和残页折算", () => {
    const report = runP1Simulation(config);
    const whaleLight = report.profiles.find((profile) => profile.profile_id === "whale_light");
    const largeMonthly = report.profiles.find((profile) => profile.profile_id === "large_monthly");

    expect(whaleLight?.ancient_treasure_draws).toBeGreaterThan(
      largeMonthly?.ancient_treasure_draws ?? 0,
    );
    expect(whaleLight?.ancient_treasure_draws).toBeLessThan(760);
    expect(whaleLight?.limited_gacha_draw_budget).toBeGreaterThan(700);
  });

  it("风险预警能指出低活跃服兜底依赖和经济风险", () => {
    const report = runP1Simulation(config);
    const warningCodes = report.warnings.map((warning) => warning.code);

    expect(warningCodes).toContain("npc_dependency");
    expect(warningCodes).toContain("spirit_stone_inflation");
    expect(report.warnings.every((warning) => warning.suggestion.length > 0)).toBe(true);
    expect(report.warnings.every((warning) => warning.severity !== "critical")).toBe(true);
  });
});
