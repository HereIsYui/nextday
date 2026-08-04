import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AdminDelayedSettlementListResponse,
  AdminPlayerRiskResponse,
  AdminRiskRecordListResponse,
  ReviewDelayedSettlementRequest,
  ReviewDelayedSettlementResponse,
  RewardBundle,
  RiskDecisionAction,
  RiskLevel,
  RiskStatus,
  SettlementStatus,
} from "@nextday/shared";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { riskConfig, riskRulesetVersion } from "./risk.constants";
import { toBehaviorRiskRecordState, toDelayedSettlementRecordState } from "./risk.mappers";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;

export interface RiskEvaluationInput {
  accountId?: string | null;
  playerId?: string | null;
  riskDomain: string;
  actionType: string;
  targetType?: string | null;
  targetId?: string | null;
  sourceRecordId?: string | null;
  requestId?: string | null;
  idempotencyKey?: string | null;
  path?: string | null;
  targetRepeatCount?: number;
  requestedCount?: number;
  acceptedCount?: number;
  privilegeViolation?: boolean;
  highImpact?: boolean;
  forceRiskStatus?: RiskStatus;
  metadata?: Record<string, unknown>;
}

export interface RiskEvaluationResult {
  risk_status: RiskStatus;
  risk_record_id: string | null;
  settlement_status: SettlementStatus;
  decision_action: RiskDecisionAction;
  risk_score: number;
  rule_codes: string[];
}

export interface DelayedSettlementInput {
  playerId: string;
  sourceType: string;
  sourceId?: string | null;
  sourceRecordId?: string | null;
  riskRecordId?: string | null;
  amountSnapshot: Record<string, unknown>;
  configVersion: string;
  rewardConfigVersion: string;
  idempotencyKey?: string | null;
}

@Injectable()
export class RiskService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async evaluateAndRecord(
    input: RiskEvaluationInput,
    tx: DbClient = this.prisma,
  ): Promise<RiskEvaluationResult> {
    const ruleCodes: string[] = [];
    let riskScore = 0;
    let riskStatus: RiskStatus = "normal";
    let decisionAction: RiskDecisionAction = "observe";
    let settlementStatus: SettlementStatus = "settled";
    const behavior = input.playerId
      ? await this.inspectRecentBehavior(tx, input.playerId, input.path)
      : emptyBehaviorInspection();

    if (behavior.samePathCount >= riskConfig.highFrequencySamePathCount) {
      riskScore += riskConfig.score.highFrequency;
      ruleCodes.push("high_frequency_path");
      riskStatus = pickRiskStatus(riskStatus, "rate_limited");
      decisionAction = pickDecision(decisionAction, "rate_limit");
    }

    if (behavior.fixedInterval) {
      riskScore += riskConfig.score.fixedInterval;
      ruleCodes.push("fixed_interval");
      riskStatus = pickRiskStatus(riskStatus, "rate_limited");
      decisionAction = pickDecision(decisionAction, "rate_limit");
    }

    if (behavior.longOnline) {
      riskScore += riskConfig.score.longOnline;
      ruleCodes.push("long_online_window");
    }

    if (behavior.sameIpPlayerCount >= riskConfig.sameIpPlayerThreshold) {
      riskScore += riskConfig.score.sameIpMultiAccount;
      ruleCodes.push("same_ip_multi_account");
    }

    if (
      input.requestedCount !== undefined &&
      input.acceptedCount !== undefined &&
      input.requestedCount > input.acceptedCount
    ) {
      riskScore += riskConfig.score.batchOverflow;
      ruleCodes.push("batch_over_limit");
      riskStatus = pickRiskStatus(riskStatus, "decayed");
      decisionAction = pickDecision(decisionAction, "truncate");
    }

    if (input.privilegeViolation) {
      riskScore += riskConfig.score.privilegeViolation;
      ruleCodes.push("privilege_violation");
      riskStatus = pickRiskStatus(riskStatus, "manual_review");
      decisionAction = pickDecision(decisionAction, "reject");
      settlementStatus = "rejected";
    }

    const targetRepeatCount = input.targetRepeatCount ?? 0;
    if (
      targetRepeatCount >= riskConfig.towerDelayedRepeatThreshold &&
      input.riskDomain === "tower"
    ) {
      riskScore += riskConfig.score.delayedRepeatedTarget;
      ruleCodes.push("repeat_tower_action_delayed");
      riskStatus = pickRiskStatus(riskStatus, "delayed_settlement");
      decisionAction = pickDecision(decisionAction, "delay_settlement");
      settlementStatus = "delayed";
    }

    if (input.forceRiskStatus && input.forceRiskStatus !== "normal") {
      riskStatus = pickRiskStatus(riskStatus, input.forceRiskStatus);
      if (!ruleCodes.some((code) => code.startsWith("forced_"))) {
        ruleCodes.push(`forced_${input.forceRiskStatus}`);
        riskScore += input.forceRiskStatus === "decayed" ? 20 : 40;
      }
      if (input.forceRiskStatus === "delayed_settlement") {
        decisionAction = pickDecision(decisionAction, "delay_settlement");
        settlementStatus = "delayed";
      }
      if (input.forceRiskStatus === "manual_review") {
        decisionAction = pickDecision(decisionAction, "manual_review");
      }
    }

    if (riskScore <= 0 && riskStatus === "normal") {
      return {
        risk_status: "normal",
        risk_record_id: null,
        settlement_status: "settled",
        decision_action: "observe",
        risk_score: 0,
        rule_codes: [],
      };
    }

    const record = await tx.behaviorRiskRecord.create({
      data: {
        riskRecordId: `risk_${randomUUID()}`,
        accountId: input.accountId ?? null,
        playerId: input.playerId ?? null,
        eraId: defaultEraId,
        riskDomain: input.riskDomain,
        actionType: input.actionType,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        sourceRecordId: input.sourceRecordId ?? null,
        riskStatus,
        riskLevel: scoreToRiskLevel(riskScore),
        riskScore: Math.min(100, riskScore),
        ruleCodes,
        decisionAction,
        settlementStatus,
        requestId: input.requestId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        ipHash: behavior.latestIpHash,
        userAgentHash: behavior.latestUserAgentHash,
        metadata: {
          ...input.metadata,
          behavior_summary: {
            same_path_count: behavior.samePathCount,
            fixed_interval: behavior.fixedInterval,
            long_online: behavior.longOnline,
            same_ip_player_count: behavior.sameIpPlayerCount,
          },
        } as Prisma.InputJsonValue,
        riskRulesetVersion,
      },
    });

    return {
      risk_status: riskStatus,
      risk_record_id: record.riskRecordId,
      settlement_status: settlementStatus,
      decision_action: decisionAction,
      risk_score: Math.min(100, riskScore),
      rule_codes: ruleCodes,
    };
  }

  async attachSourceRecord(
    tx: DbClient,
    riskRecordId: string | null,
    sourceRecordId: string,
  ): Promise<void> {
    if (!riskRecordId) {
      return;
    }

    await tx.behaviorRiskRecord.update({
      where: { riskRecordId },
      data: { sourceRecordId },
    });
  }

  async createDelayedSettlement(tx: DbClient, input: DelayedSettlementInput) {
    if (input.idempotencyKey) {
      const existing = await tx.delayedSettlementRecord.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    return tx.delayedSettlementRecord.create({
      data: {
        settlementRecordId: `delayed_${randomUUID()}`,
        playerId: input.playerId,
        eraId: defaultEraId,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? null,
        sourceRecordId: input.sourceRecordId ?? null,
        riskRecordId: input.riskRecordId ?? null,
        status: "delayed",
        amountSnapshot: input.amountSnapshot as Prisma.InputJsonValue,
        configVersion: input.configVersion,
        rewardConfigVersion: input.rewardConfigVersion,
        riskRulesetVersion,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  }

  async getPlayerRisk(playerId: string): Promise<AdminPlayerRiskResponse> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [records, delayedSettlements, behaviorLogs] = await Promise.all([
      this.prisma.behaviorRiskRecord.findMany({
        where: { playerId, createdAt: { gte: since24h } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.delayedSettlementRecord.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.behaviorLog.findMany({
        where: { playerId, createdAt: { gte: since24h } },
        orderBy: { createdAt: "desc" },
        take: 300,
      }),
    ]);
    const riskScore = Math.min(
      100,
      records.reduce((sum, record) => sum + record.riskScore, 0),
    );
    const recentRuleCodes = Array.from(
      new Set(records.flatMap((record) => normalizeRuleCodes(record.ruleCodes))),
    ).slice(0, 12);

    return {
      player_id: playerId,
      risk_score: riskScore,
      risk_level: scoreToRiskLevel(riskScore),
      current_status: records[0]?.riskStatus ? (records[0].riskStatus as RiskStatus) : "normal",
      recent_rule_codes: recentRuleCodes,
      behavior_summary: summarizeBehaviorLogs(behaviorLogs),
      recent_records: records.map(toBehaviorRiskRecordState),
      delayed_settlements: delayedSettlements.map(toDelayedSettlementRecordState),
    };
  }

  async listRiskRecords(input: {
    playerId?: string;
    riskStatus?: RiskStatus;
    limit?: number;
  }): Promise<AdminRiskRecordListResponse> {
    const records = await this.prisma.behaviorRiskRecord.findMany({
      where: {
        playerId: input.playerId,
        riskStatus: input.riskStatus,
      },
      orderBy: { createdAt: "desc" },
      take: clampLimit(input.limit),
    });

    return { records: records.map(toBehaviorRiskRecordState) };
  }

  async listDelayedSettlements(input: {
    playerId?: string;
    status?: SettlementStatus;
    limit?: number;
  }): Promise<AdminDelayedSettlementListResponse> {
    const records = await this.prisma.delayedSettlementRecord.findMany({
      where: {
        playerId: input.playerId,
        status: input.status,
      },
      orderBy: { createdAt: "desc" },
      take: clampLimit(input.limit),
    });

    return { records: records.map(toDelayedSettlementRecordState) };
  }

  async reviewDelayedSettlement(
    input: ReviewDelayedSettlementRequest,
  ): Promise<ReviewDelayedSettlementResponse> {
    const existing = await this.prisma.delayedSettlementRecord.findUnique({
      where: { settlementRecordId: input.settlement_record_id },
    });
    if (!existing) {
      throw new BadRequestException("延迟结算记录不存在");
    }
    if (existing.status !== "delayed") {
      return { record: toDelayedSettlementRecordState(existing) };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.action === "release") {
        await this.releaseDelayedRewards(tx, existing);
      }
      return tx.delayedSettlementRecord.update({
        where: { settlementRecordId: existing.settlementRecordId },
        data: {
          status: input.action === "release" ? "settled" : "rejected",
          reviewAction: input.action,
          reviewReason: input.reason ?? null,
          reviewer: input.reviewer ?? "admin_dev",
          reviewedAt: new Date(),
          settledAt: input.action === "release" ? new Date() : null,
        },
      });
    });

    return { record: toDelayedSettlementRecordState(updated) };
  }

  private async inspectRecentBehavior(tx: DbClient, playerId: string, path?: string | null) {
    const sinceHighFrequency = new Date(Date.now() - riskConfig.highFrequencyWindowMs);
    const logs = await tx.behaviorLog.findMany({
      where: { playerId, createdAt: { gte: sinceHighFrequency } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const normalizedPath = path?.split("?")[0] ?? null;
    const samePathCount = normalizedPath
      ? logs.filter((log) => log.path.split("?")[0] === normalizedPath).length
      : 0;
    const latestIpHash = logs.find((log) => log.ipHash)?.ipHash ?? null;
    const latestUserAgentHash = logs.find((log) => log.userAgentHash)?.userAgentHash ?? null;
    const sameIpPlayerCount = latestIpHash ? await this.countSameIpPlayers(tx, latestIpHash) : 0;

    return {
      samePathCount,
      fixedInterval: hasFixedIntervals(logs.map((log) => log.createdAt)),
      longOnline: await this.hasLongOnlineWindow(tx, playerId),
      sameIpPlayerCount,
      latestIpHash,
      latestUserAgentHash,
    };
  }

  private async hasLongOnlineWindow(tx: DbClient, playerId: string): Promise<boolean> {
    const since = new Date(Date.now() - riskConfig.longOnlineWindowMs);
    const logs = await tx.behaviorLog.findMany({
      where: { playerId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    if (logs.length < 80) {
      return false;
    }

    return (
      logs[logs.length - 1].createdAt.getTime() - logs[0].createdAt.getTime() >= 5 * 60 * 60 * 1000
    );
  }

  private async countSameIpPlayers(tx: DbClient, ipHash: string): Promise<number> {
    const since = new Date(Date.now() - riskConfig.sameIpPlayersWindowMs);
    const logs = await tx.behaviorLog.findMany({
      where: { ipHash, createdAt: { gte: since }, playerId: { not: null } },
      select: { playerId: true },
      take: 300,
    });

    return new Set(logs.map((log) => log.playerId).filter(Boolean)).size;
  }

  private async releaseDelayedRewards(
    tx: Tx,
    record: { playerId: string; amountSnapshot: Prisma.JsonValue },
  ) {
    const snapshot = normalizeSnapshot(record.amountSnapshot);
    const rewards = normalizeRewards(snapshot.rewards);
    const spiritStone = BigInt(rewards.spirit_stone ?? "0");
    if (spiritStone > 0n) {
      const wallet = await tx.playerWallet.findUniqueOrThrow({
        where: { playerId: record.playerId },
      });
      await tx.playerWallet.update({
        where: { playerId: record.playerId },
        data: { spiritStone: { increment: spiritStone } },
      });
      await tx.walletLog.create({
        data: {
          logId: `wallet_${randomUUID()}`,
          playerId: record.playerId,
          currencyType: "spirit_stone",
          changeAmount: spiritStone,
          beforeAmount: wallet.spiritStone,
          afterAmount: wallet.spiritStone + spiritStone,
          sourceType: "delayed_settlement_release",
          sourceId:
            typeof snapshot.source_record_id === "string" ? snapshot.source_record_id : undefined,
          idempotencyKey: `risk_release_${randomUUID()}`,
        },
      });
    }

    for (const item of rewards.items ?? []) {
      if (item.count <= 0) {
        continue;
      }
      await tx.playerItem.create({
        data: {
          itemInstanceId: `item_${randomUUID()}`,
          playerId: record.playerId,
          itemId: item.item_id,
          count: BigInt(item.count),
          bindType: item.bind_type,
          sourceType: "delayed_settlement_release",
        },
      });
    }
  }
}

function emptyBehaviorInspection() {
  return {
    samePathCount: 0,
    fixedInterval: false,
    longOnline: false,
    sameIpPlayerCount: 0,
    latestIpHash: null,
    latestUserAgentHash: null,
  };
}

function hasFixedIntervals(createdAtList: Date[]): boolean {
  if (createdAtList.length < riskConfig.fixedIntervalMinSamples) {
    return false;
  }
  const ascending = [...createdAtList].sort((left, right) => left.getTime() - right.getTime());
  const gaps = ascending
    .slice(1)
    .map((date, index) => Math.round((date.getTime() - ascending[index].getTime()) / 1000))
    .filter((gap) => gap > 0 && gap <= 30);
  if (gaps.length < riskConfig.fixedIntervalMinSamples - 1) {
    return false;
  }
  const minGap = Math.min(...gaps);
  const maxGap = Math.max(...gaps);

  return maxGap - minGap <= riskConfig.fixedIntervalVarianceSeconds;
}

function pickRiskStatus(current: RiskStatus, next: RiskStatus): RiskStatus {
  const priority: Record<RiskStatus, number> = {
    normal: 0,
    decayed: 1,
    rate_limited: 2,
    delayed_settlement: 3,
    manual_review: 4,
  };

  return priority[next] > priority[current] ? next : current;
}

function pickDecision(current: RiskDecisionAction, next: RiskDecisionAction): RiskDecisionAction {
  const priority: Record<RiskDecisionAction, number> = {
    observe: 0,
    truncate: 1,
    decay: 2,
    rate_limit: 3,
    delay_settlement: 4,
    manual_review: 5,
    reject: 6,
  };

  return priority[next] > priority[current] ? next : current;
}

function scoreToRiskLevel(score: number): RiskLevel {
  if (score >= 80) {
    return "high";
  }
  if (score >= 50) {
    return "medium";
  }
  if (score > 0) {
    return "low";
  }

  return "normal";
}

function clampLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return 50;
  }

  return Math.min(100, Math.max(1, Math.floor(limit)));
}

function normalizeRuleCodes(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function summarizeBehaviorLogs(
  logs: Array<{ path: string; ipHash: string | null; userAgentHash: string | null }>,
) {
  const pathCounts = new Map<string, number>();
  for (const log of logs) {
    const path = log.path.split("?")[0];
    pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
  }

  return {
    total_requests_24h: logs.length,
    high_frequency_paths: Array.from(pathCounts.entries())
      .filter(([, count]) => count >= 20)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([path, count]) => ({ path, count })),
    distinct_ip_count: new Set(logs.map((log) => log.ipHash).filter(Boolean)).size,
    distinct_user_agent_count: new Set(logs.map((log) => log.userAgentHash).filter(Boolean)).size,
  };
}

function normalizeSnapshot(value: Prisma.JsonValue): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeRewards(value: unknown): RewardBundle {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return {};
  }

  return value as RewardBundle;
}
