import type {
  BehaviorRiskRecordState,
  DelayedSettlementRecordState,
  RiskDecisionAction,
  RiskLevel,
  RiskStatus,
  SettlementStatus,
} from "@nextday/shared";
import type { BehaviorRiskRecord, DelayedSettlementRecord, Prisma } from "@prisma/client";

export function toBehaviorRiskRecordState(record: BehaviorRiskRecord): BehaviorRiskRecordState {
  return {
    risk_record_id: record.riskRecordId,
    account_id: record.accountId,
    player_id: record.playerId,
    era_id: record.eraId,
    risk_domain: record.riskDomain,
    action_type: record.actionType,
    target_type: record.targetType,
    target_id: record.targetId,
    source_record_id: record.sourceRecordId,
    risk_status: record.riskStatus as RiskStatus,
    risk_level: record.riskLevel as RiskLevel,
    risk_score: record.riskScore,
    rule_codes: normalizeStringArray(record.ruleCodes),
    decision_action: record.decisionAction as RiskDecisionAction,
    settlement_status: record.settlementStatus as SettlementStatus,
    request_id: record.requestId,
    idempotency_key: record.idempotencyKey,
    metadata: normalizeRecord(record.metadata),
    risk_ruleset_version: record.riskRulesetVersion,
    resolution_status: record.resolutionStatus as "open" | "resolved",
    resolution_reason: record.resolutionReason,
    resolved_by: record.resolvedBy,
    resolved_at: record.resolvedAt?.toISOString() ?? null,
    created_at: record.createdAt.toISOString(),
  };
}

export function toDelayedSettlementRecordState(
  record: DelayedSettlementRecord,
): DelayedSettlementRecordState {
  return {
    settlement_record_id: record.settlementRecordId,
    player_id: record.playerId,
    era_id: record.eraId,
    source_type: record.sourceType,
    source_id: record.sourceId,
    source_record_id: record.sourceRecordId,
    risk_record_id: record.riskRecordId,
    status: record.status as SettlementStatus,
    amount_snapshot: normalizeRecord(record.amountSnapshot) ?? {},
    review_action: record.reviewAction,
    review_reason: record.reviewReason,
    reviewer: record.reviewer,
    config_version: record.configVersion,
    reward_config_version: record.rewardConfigVersion,
    risk_ruleset_version: record.riskRulesetVersion,
    created_at: record.createdAt.toISOString(),
    reviewed_at: record.reviewedAt?.toISOString() ?? null,
    settled_at: record.settledAt?.toISOString() ?? null,
  };
}

function normalizeStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}
