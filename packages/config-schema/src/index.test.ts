import { describe, expect, it } from "vitest";
import { validateConfigEnvelope } from "./index";

describe("config-schema 配置校验占位", () => {
  it("校验配置包基础字段", () => {
    expect(
      validateConfigEnvelope({
        config_type: "numeric",
        config_version: "numeric_001",
        payload: {},
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it("返回缺失字段错误", () => {
    const result = validateConfigEnvelope({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("缺少 config_type");
  });
});
