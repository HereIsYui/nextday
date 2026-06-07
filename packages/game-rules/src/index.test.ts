import { describe, expect, it } from "vitest";
import { entitlementTierLabels, provinceLabels, riskStatusLabels } from "./index";

describe("game-rules 展示规则", () => {
  it("包含 P1 九州", () => {
    expect(Object.values(provinceLabels)).toEqual([
      "冀州",
      "兖州",
      "青州",
      "徐州",
      "扬州",
      "荆州",
      "豫州",
      "梁州",
      "雍州",
    ]);
  });

  it("包含大月卡与风控状态展示", () => {
    expect(entitlementTierLabels.large_monthly).toBe("大月卡");
    expect(riskStatusLabels.delayed_settlement).toBe("延迟结算");
  });
});
