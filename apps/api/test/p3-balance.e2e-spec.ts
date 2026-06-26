import { describe, expect, it } from "vitest";
import { exploreLootPools } from "../src/game/game.constants";
import {
  buildProductionBalanceWarnings,
  materialBalanceProfiles,
} from "../src/production/production.constants";

interface P3BalanceProfile {
  profile_id: string;
  label: string;
  daily_action_factor: number;
  daily_consumption_factor: number;
  paid_tier: "free" | "monthly" | "vip";
}

const p3BalanceProfiles: P3BalanceProfile[] = [
  {
    daily_action_factor: 0.72,
    daily_consumption_factor: 0.58,
    label: "新手玩家",
    paid_tier: "free",
    profile_id: "new_player",
  },
  {
    daily_action_factor: 1,
    daily_consumption_factor: 1,
    label: "免费玩家",
    paid_tier: "free",
    profile_id: "standard_free",
  },
  {
    daily_action_factor: 1.06,
    daily_consumption_factor: 1.06,
    label: "月卡玩家",
    paid_tier: "monthly",
    profile_id: "monthly",
  },
  {
    daily_action_factor: 1.1,
    daily_consumption_factor: 1.1,
    label: "VIP玩家",
    paid_tier: "vip",
    profile_id: "vip",
  },
  {
    daily_action_factor: 1.45,
    daily_consumption_factor: 1.35,
    label: "重肝玩家",
    paid_tier: "free",
    profile_id: "hardcore_free",
  },
];

const p3BalanceDays = [1, 7, 30] as const;
const forbiddenRewardFragments = ["paid", "jade", "ancient", "gubao", "limited", "unique"];

describe("P3-5 数值模拟与回归", () => {
  it("九州探索掉落池不包含付费或唯一战力产物", () => {
    const allLoot = Object.values(exploreLootPools).flat();

    expect(Object.values(exploreLootPools).every((pool) => pool.length >= 4)).toBe(true);
    expect(allLoot.length).toBeGreaterThanOrEqual(36);
    expect(
      allLoot.every(
        (loot) =>
          loot.sourceHint.length > 0 &&
          loot.usageHint.length > 0 &&
          !forbiddenRewardFragments.some((fragment) => loot.itemId.includes(fragment)),
      ),
    ).toBe(true);
  });

  it("1 / 7 / 30 天材料回归能指出紧缺但不出现阻断级风险", () => {
    const reports = p3BalanceProfiles.flatMap((profile) =>
      p3BalanceDays.map((days) => simulateP3MaterialBalance(profile, days)),
    );

    expect(reports).toHaveLength(p3BalanceProfiles.length * p3BalanceDays.length);
    expect(
      reports.every((report) =>
        report.materials.every((material) => material.balance >= -material.allowed_deficit),
      ),
    ).toBe(true);
    expect(
      reports.every((report) =>
        report.materials.every((material) => material.balance <= material.allowed_surplus),
      ),
    ).toBe(true);
    expect(
      reports.some((report) =>
        report.materials.some(
          (material) => material.item_id === "raw_iron" && material.status === "tight",
        ),
      ),
    ).toBe(true);
  });

  it("付费画像不提高探索掉落倍率，差距只表现为轻微节奏便利", () => {
    const day7Reports = p3BalanceProfiles.map((profile) => simulateP3MaterialBalance(profile, 7));
    const standardFree = day7Reports.find((report) => report.profile_id === "standard_free");
    const monthly = day7Reports.find((report) => report.profile_id === "monthly");
    const vip = day7Reports.find((report) => report.profile_id === "vip");

    if (!standardFree || !monthly || !vip) {
      throw new Error("缺少 P3 付费差距画像");
    }

    expect(monthly.drop_multiplier).toBe(1);
    expect(vip.drop_multiplier).toBe(1);
    expect(monthly.net_value_gap_vs_standard_free).toBeLessThanOrEqual(0.12);
    expect(vip.net_value_gap_vs_standard_free).toBeLessThanOrEqual(0.16);
  });

  it("材料链预警有调参建议，默认不提示付费跳过新手曲线", () => {
    const warnings = buildProductionBalanceWarnings([1, 7, 30]);
    const warningText = JSON.stringify(warnings);

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some((warning) => warning.item_id === "raw_iron")).toBe(true);
    expect(warnings.every((warning) => warning.suggestion.length > 0)).toBe(true);
    expect(warningText).not.toContain("付费");
    expect(warningText).not.toContain("仙玉");
    expect(warningText).not.toContain("倍率");
  });
});

function simulateP3MaterialBalance(profile: P3BalanceProfile, days: 1 | 7 | 30) {
  const materials = materialBalanceProfiles.map((material) => {
    const supply = material.daily_supply * profile.daily_action_factor * days;
    const demand = material.daily_demand * profile.daily_consumption_factor * days;
    const balance = supply - demand;
    const allowedDeficit = Math.max(material.daily_demand * days * 0.42, material.daily_demand);
    const allowedSurplus = Math.max(material.stockpile_threshold * days, 1);

    return {
      allowed_deficit: allowedDeficit,
      allowed_surplus: allowedSurplus,
      balance,
      item_id: material.item_id,
      status:
        balance < 0
          ? "tight"
          : balance > material.stockpile_threshold * Math.ceil(days / 7)
            ? "surplus"
            : "balanced",
    };
  });
  const netValue = materials.reduce((sum, material) => sum + material.balance, 0);
  const standardNetValue = materialBalanceProfiles.reduce(
    (sum, material) => sum + (material.daily_supply - material.daily_demand) * days,
    0,
  );

  return {
    drop_multiplier: 1,
    materials,
    net_value: netValue,
    net_value_gap_vs_standard_free:
      profile.profile_id === "standard_free"
        ? 0
        : Math.abs(netValue - standardNetValue) / Math.max(1, Math.abs(standardNetValue)),
    paid_tier: profile.paid_tier,
    profile_id: profile.profile_id,
  };
}
