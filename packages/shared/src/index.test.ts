import { describe, expect, it } from "vitest";
import {
  type EntitlementTier,
  ErrorCode,
  type RiskStatus,
  createSuccessResponse,
  createTraceId,
} from "./index";

describe("shared 基础类型", () => {
  it("导出风控错误码", () => {
    expect(ErrorCode.rateLimited).toBe(90010);
    expect(ErrorCode.entitlementRequired).toBe(90011);
  });

  it("创建统一成功响应", () => {
    const response = createSuccessResponse({ status: "ok" }, "req_test");
    expect(response).toMatchObject({
      code: 0,
      message: "ok",
      data: { status: "ok" },
      trace_id: "req_test",
    });
  });

  it("保留权益与风控状态联合类型", () => {
    const tier: EntitlementTier = "large_monthly";
    const riskStatus: RiskStatus = "delayed_settlement";
    expect(tier).toBe("large_monthly");
    expect(riskStatus).toBe("delayed_settlement");
  });

  it("创建请求追踪 ID", () => {
    expect(createTraceId()).toMatch(/^req_/);
  });
});
