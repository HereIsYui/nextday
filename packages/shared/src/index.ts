export type ClientPlatform = "web" | "h5" | "admin" | "fishpi_plugin";

export type CultivationRoute = "qi" | "body";

export type EntitlementTier =
  | "free"
  | "vip1"
  | "vip2"
  | "vip3"
  | "vip4"
  | "small_monthly"
  | "large_monthly";

export type RiskStatus =
  | "normal"
  | "rate_limited"
  | "delayed_settlement"
  | "decayed"
  | "manual_review";

export type SettlementStatus = "settled" | "delayed" | "rejected";

export interface RiskResult {
  risk_status: RiskStatus;
  risk_record_id: string | null;
  settlement_status: SettlementStatus;
}

export interface ApiResponse<TData> {
  code: number;
  message: string;
  server_time: number;
  data: TData;
  trace_id: string;
}

export const ErrorCode = {
  ok: 0,
  authRequired: 10000,
  validationFailed: 70000,
  systemError: 90000,
  rateLimited: 90010,
  entitlementRequired: 90011,
  batchLimitExceeded: 90012,
  strategySlotExceeded: 90013,
  delayedSettlement: 90014,
  manualReviewRequired: 90015,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface HealthStatus {
  status: "ok";
  service: string;
  version: string;
}

export function createTraceId(prefix = "req"): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${randomPart}`;
}

export function createSuccessResponse<TData>(
  data: TData,
  traceId: string,
  message = "ok",
): ApiResponse<TData> {
  return {
    code: ErrorCode.ok,
    message,
    server_time: Math.floor(Date.now() / 1000),
    data,
    trace_id: traceId,
  };
}
