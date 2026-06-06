import { describe, expect, it } from "vitest";
import { entitlementTierLabels, mvpProvinceLabels, riskStatusLabels } from "./index";

describe("game-rules 展示规则", () => {
  it("包含 MVP 四州", () => {
    expect(Object.values(mvpProvinceLabels)).toEqual(["冀州", "兖州", "青州", "徐州"]);
  });

  it("包含大月卡与风控状态展示", () => {
    expect(entitlementTierLabels.large_monthly).toBe("大月卡");
    expect(riskStatusLabels.delayed_settlement).toBe("延迟结算");
  });
});
