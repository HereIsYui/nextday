import type { TransferRequestState } from "@nextday/shared";
import type { TransferRequestRecord } from "@prisma/client";

export function toTransferRequestState(record: TransferRequestRecord): TransferRequestState {
  return {
    transfer_request_id: record.transferRequestId,
    player_id: record.playerId,
    account_id: record.accountId,
    source_server_id: record.sourceServerId,
    target_server_id: record.targetServerId,
    era_id: record.eraId,
    status: record.status,
    dry_run_report: objectFromJson(record.dryRunReport),
    asset_mapping_summary: record.assetMappingSummary
      ? objectFromJson(record.assetMappingSummary)
      : null,
    rank_cooldown_until: record.rankCooldownUntil?.toISOString() ?? null,
    sect_cleanup_summary: record.sectCleanupSummary
      ? objectFromJson(record.sectCleanupSummary)
      : null,
    payment_asset_check_summary: record.paymentAssetCheckSummary
      ? objectFromJson(record.paymentAssetCheckSummary)
      : null,
    risk_summary: record.riskSummary ? objectFromJson(record.riskSummary) : null,
    review_operator_id: record.reviewOperatorId ?? null,
    review_reason: record.reviewReason ?? null,
    execute_status: record.executeStatus,
    transfer_config_version: record.transferConfigVersion,
    risk_ruleset_version: record.riskRulesetVersion,
    settlement_config_version: record.settlementConfigVersion,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    reviewed_at: record.reviewedAt?.toISOString() ?? null,
    executed_at: record.executedAt?.toISOString() ?? null,
  };
}

export function objectFromJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
