import type { MentorRelationState, SectDiplomacyState, SectHireState } from "@nextday/shared";
import type { MentorRelationRecord, SectDiplomacyRecord, SectHireRecord } from "@prisma/client";

export function toMentorRelationState(
  record: MentorRelationRecord,
  names: { mentorName?: string; apprenticeName?: string },
): MentorRelationState {
  return {
    mentor_relation_id: record.mentorRelationId,
    mentor_player_id: record.mentorPlayerId,
    mentor_name: names.mentorName ?? "未知导师",
    apprentice_player_id: record.apprenticePlayerId,
    apprentice_name: names.apprenticeName ?? "未知徒弟",
    era_id: record.eraId,
    status: record.status,
    task_summary: objectFromJson(record.taskSummary),
    reward_boundary_summary: objectFromJson(record.rewardBoundarySummary),
    cooldown_until: record.cooldownUntil?.toISOString() ?? null,
    risk_summary: record.riskSummary ? objectFromJson(record.riskSummary) : null,
    mentor_config_version: record.mentorConfigVersion,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

export function toSectDiplomacyState(
  record: SectDiplomacyRecord,
  sectNames: { sourceName?: string; targetName?: string },
): SectDiplomacyState {
  return {
    diplomacy_record_id: record.diplomacyRecordId,
    source_sect_id: record.sourceSectId,
    source_sect_name: sectNames.sourceName ?? "未知宗门",
    target_sect_id: record.targetSectId,
    target_sect_name: sectNames.targetName ?? "未知宗门",
    era_id: record.eraId,
    diplomacy_type: record.diplomacyType,
    status: record.status,
    proposal_summary: objectFromJson(record.proposalSummary),
    approval_summary: record.approvalSummary ? objectFromJson(record.approvalSummary) : null,
    cooldown_until: record.cooldownUntil?.toISOString() ?? null,
    announcement_id: record.announcementId ?? null,
    diplomacy_config_version: record.diplomacyConfigVersion,
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
  };
}

export function toSectHireState(
  record: SectHireRecord,
  names: {
    employerName?: string;
    helperSectName?: string | null;
    helperPlayerName?: string | null;
  },
): SectHireState {
  return {
    hire_record_id: record.hireRecordId,
    employer_sect_id: record.employerSectId,
    employer_sect_name: names.employerName ?? "未知宗门",
    helper_sect_id: record.helperSectId ?? null,
    helper_sect_name: names.helperSectName ?? null,
    helper_player_id: record.helperPlayerId ?? null,
    helper_player_name: names.helperPlayerName ?? null,
    era_id: record.eraId,
    hire_type: record.hireType,
    status: record.status,
    allowed_action_scope: objectFromJson(record.allowedActionScope),
    reward_escrow_summary: objectFromJson(record.rewardEscrowSummary),
    risk_status: record.riskStatus,
    settlement_status: record.settlementStatus,
    hire_config_version: record.hireConfigVersion,
    reward_config_version: record.rewardConfigVersion,
    created_at: record.createdAt.toISOString(),
    settled_at: record.settledAt?.toISOString() ?? null,
  };
}

export function objectFromJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}
