import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AdminCreateTransferDryRunRequest,
  AdminCreateTransferDryRunResponse,
  AdminExecuteTransferRequest,
  AdminExecuteTransferResponse,
  AdminReviewTransferRequest,
  AdminReviewTransferResponse,
  CancelTransferRequestRequest,
  CancelTransferRequestResponse,
  CreateTransferRequestRequest,
  CreateTransferRequestResponse,
  TransferRuleResponse,
  TransferStatusResponse,
} from "@nextday/shared";
import type {
  Account,
  GmOperationLog,
  Player,
  PlayerProgress,
  PlayerWallet,
  Prisma,
  SectMember,
  TransferRequestRecord,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { hashRequestBody } from "../platform/utils/hash";
import {
  finalBattleForbiddenDays,
  transferConfigVersion,
  transferCurrentServerId,
  transferRankCooldownDays,
  transferRiskRulesetVersion,
  transferRule,
  transferRulesetVersion,
  transferSettlementConfigVersion,
} from "./transfer.constants";
import { toTransferRequestState } from "./transfer.mappers";

type Tx = Prisma.TransactionClient;
type PlayerForTransfer = Player & {
  account: Account;
  progress: PlayerProgress | null;
  wallet: PlayerWallet | null;
  sectMembership: SectMember | null;
};

@Injectable()
export class TransferService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getRules(accountId: string): Promise<TransferRuleResponse> {
    const player = await this.requirePlayer(accountId);
    const activeRequest = await this.findActiveRequest(player.playerId);

    return {
      current_server_id: transferCurrentServerId,
      can_request: !activeRequest,
      reason: activeRequest ? "已有待处理转服申请" : null,
      rule: transferRule,
    };
  }

  async getStatus(accountId: string): Promise<TransferStatusResponse> {
    const player = await this.requirePlayer(accountId);
    const requests = await this.prisma.transferRequestRecord.findMany({
      where: { playerId: player.playerId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const currentRequest = requests.find(isActiveTransferRequest) ?? null;

    return {
      current_request: currentRequest ? toTransferRequestState(currentRequest) : null,
      recent_requests: requests.map(toTransferRequestState),
      rule: transferRule,
    };
  }

  async createTransferRequest(input: {
    accountId: string;
    body: CreateTransferRequestRequest;
    idempotencyKey: string;
  }): Promise<CreateTransferRequestResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeCreateTransferRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/transfer/request",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.assertCanCreateTransfer(tx, player, body.target_server_id, undefined);
        const report = await this.buildTransferReport(tx, {
          player,
          sourceServerId: transferCurrentServerId,
          targetServerId: body.target_server_id,
          targetServerStage: undefined,
        });
        const record = await tx.transferRequestRecord.create({
          data: {
            transferRequestId: `transfer_req_${randomUUID()}`,
            playerId: player.playerId,
            accountId: player.accountId,
            sourceServerId: transferCurrentServerId,
            targetServerId: body.target_server_id,
            eraId: player.progress?.eraId ?? "era_mvp_001",
            status: "submitted",
            dryRunReport: report.dryRunReport,
            assetMappingSummary: report.assetMappingSummary,
            rankCooldownUntil: report.rankCooldownUntil,
            sectCleanupSummary: report.sectCleanupSummary,
            paymentAssetCheckSummary: report.paymentAssetCheckSummary,
            riskSummary: report.riskSummary,
            executeStatus: "dry_run_only",
            idempotencyKey: input.idempotencyKey,
            transferConfigVersion,
            riskRulesetVersion: transferRiskRulesetVersion,
            settlementConfigVersion: transferSettlementConfigVersion,
          },
        });

        return { request: toTransferRequestState(record) };
      },
    });
  }

  async cancelTransferRequest(input: {
    accountId: string;
    body: CancelTransferRequestRequest;
    idempotencyKey: string;
  }): Promise<CancelTransferRequestResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeCancelTransferRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/transfer/cancel",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const record = await tx.transferRequestRecord.findUnique({
          where: { transferRequestId: body.transfer_request_id },
        });
        if (!record || record.playerId !== player.playerId) {
          throw new BadRequestException("转服申请不存在");
        }
        if (!["draft", "submitted", "reviewing"].includes(record.status)) {
          throw new BadRequestException("该转服申请已进入审核确认阶段，不能由玩家取消");
        }
        const updated = await tx.transferRequestRecord.update({
          where: { transferRequestId: record.transferRequestId },
          data: {
            reviewReason: body.reason ?? "玩家取消",
            status: "canceled",
          },
        });

        return { request: toTransferRequestState(updated) };
      },
    });
  }

  async createAdminDryRun(input: {
    body: AdminCreateTransferDryRunRequest;
    idempotencyKey: string;
  }): Promise<AdminCreateTransferDryRunResponse> {
    const body = normalizeAdminDryRunRequest(input.body);

    return this.withIdempotency({
      endpoint: "POST /api/admin/transfer/dry-run",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const player = await this.requirePlayerById(tx, body.player_id);
        await this.assertCanCreateTransfer(
          tx,
          player,
          body.target_server_id,
          body.target_server_stage,
        );
        const report = await this.buildTransferReport(tx, {
          player,
          sourceServerId: body.source_server_id || transferCurrentServerId,
          targetServerId: body.target_server_id,
          targetServerStage: body.target_server_stage,
        });
        const record = await tx.transferRequestRecord.create({
          data: {
            transferRequestId: `transfer_req_${randomUUID()}`,
            playerId: player.playerId,
            accountId: player.accountId,
            sourceServerId: body.source_server_id || transferCurrentServerId,
            targetServerId: body.target_server_id,
            eraId: player.progress?.eraId ?? "era_mvp_001",
            status: "draft",
            dryRunReport: report.dryRunReport,
            assetMappingSummary: report.assetMappingSummary,
            rankCooldownUntil: report.rankCooldownUntil,
            sectCleanupSummary: report.sectCleanupSummary,
            paymentAssetCheckSummary: report.paymentAssetCheckSummary,
            riskSummary: report.riskSummary,
            executeStatus: "dry_run_only",
            idempotencyKey: input.idempotencyKey,
            transferConfigVersion,
            riskRulesetVersion: transferRiskRulesetVersion,
            settlementConfigVersion: transferSettlementConfigVersion,
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator,
          action: "transfer_dry_run",
          targetType: "transfer_request_record",
          targetId: record.transferRequestId,
          afterSnapshot: toJson(toTransferRequestState(record)),
          reason: body.reason,
          idempotencyKey: `${input.idempotencyKey}:operation`,
        });

        return {
          request: toTransferRequestState(record),
          operation: toOperationState(operation),
        };
      },
    });
  }

  async reviewTransfer(input: {
    body: AdminReviewTransferRequest;
    idempotencyKey: string;
  }): Promise<AdminReviewTransferResponse> {
    const body = normalizeReviewRequest(input.body);

    return this.withIdempotency({
      endpoint: "POST /api/admin/transfer/review",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const record = await tx.transferRequestRecord.findUnique({
          where: { transferRequestId: body.transfer_request_id },
        });
        if (!record) {
          throw new BadRequestException("转服申请不存在");
        }
        if (!["draft", "submitted", "reviewing"].includes(record.status)) {
          throw new BadRequestException("该转服申请已处理，不能重复审核");
        }
        const nextStatus = body.decision === "approve" ? "pending_confirm" : "rejected";
        const updated = await tx.transferRequestRecord.update({
          where: { transferRequestId: record.transferRequestId },
          data: {
            status: nextStatus,
            executeStatus: body.decision === "approve" ? "reserved_only" : "dry_run_only",
            reviewOperatorId: body.operator,
            reviewReason: body.reason,
            reviewedAt: new Date(),
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator,
          action:
            body.decision === "approve" ? "transfer_review_approve" : "transfer_review_reject",
          targetType: "transfer_request_record",
          targetId: record.transferRequestId,
          beforeSnapshot: toJson(toTransferRequestState(record)),
          afterSnapshot: toJson(toTransferRequestState(updated)),
          reason: body.reason,
          idempotencyKey: input.idempotencyKey,
        });

        return { request: toTransferRequestState(updated), operation: toOperationState(operation) };
      },
    });
  }

  async reserveTransferExecution(input: {
    body: AdminExecuteTransferRequest;
    idempotencyKey: string;
  }): Promise<AdminExecuteTransferResponse> {
    const body = normalizeExecuteRequest(input.body);

    return this.withIdempotency({
      endpoint: "POST /api/admin/transfer/execute",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const record = await tx.transferRequestRecord.findUnique({
          where: { transferRequestId: body.transfer_request_id },
        });
        if (!record) {
          throw new BadRequestException("转服申请不存在");
        }
        if (record.status !== "pending_confirm") {
          throw new BadRequestException("只有审核通过且待确认的申请可写入执行预留");
        }
        if (body.confirm_text !== "确认转服执行预留") {
          throw new BadRequestException("执行预留需要输入确认文案");
        }
        const updated = await tx.transferRequestRecord.update({
          where: { transferRequestId: record.transferRequestId },
          data: {
            executeStatus: "reserved_only",
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator,
          action: "transfer_execute_reserved",
          targetType: "transfer_request_record",
          targetId: record.transferRequestId,
          beforeSnapshot: toJson(toTransferRequestState(record)),
          afterSnapshot: toJson({
            allowed: false,
            execution_status: "reserved_only",
            message: "P2 当前只写入执行预留审计，不迁移真实资产。",
          }),
          reason: body.reason,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          allowed: false,
          execution_status: "reserved_only",
          message: "P2 当前只写入执行预留审计，不迁移真实资产。",
          request: toTransferRequestState(updated),
          operation: toOperationState(operation),
        };
      },
    });
  }

  private async requirePlayer(accountId: string): Promise<PlayerForTransfer> {
    const player = await this.prisma.player.findUnique({
      where: { accountId },
      include: { account: true, progress: true, wallet: true, sectMembership: true },
    });
    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
  }

  private async requirePlayerById(client: Tx, playerId: string): Promise<PlayerForTransfer> {
    const player = await client.player.findUnique({
      where: { playerId },
      include: { account: true, progress: true, wallet: true, sectMembership: true },
    });
    if (!player) {
      throw new BadRequestException("玩家不存在");
    }

    return player;
  }

  private async findActiveRequest(playerId: string): Promise<TransferRequestRecord | null> {
    return this.prisma.transferRequestRecord.findFirst({
      where: {
        playerId,
        status: { in: ["submitted", "reviewing", "pending_confirm"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async assertCanCreateTransfer(
    tx: Tx,
    player: PlayerForTransfer,
    targetServerId: string,
    targetServerStage: string | undefined,
  ): Promise<void> {
    if (targetServerId === transferCurrentServerId) {
      throw new BadRequestException("目标服务器不能与当前服务器相同");
    }
    if (isFinalBattleForbidden(targetServerId, targetServerStage)) {
      throw new BadRequestException(`最终战前 ${finalBattleForbiddenDays} 天禁止转服`);
    }
    const activeRequest = await tx.transferRequestRecord.findFirst({
      where: {
        playerId: player.playerId,
        status: { in: ["submitted", "reviewing", "pending_confirm"] },
      },
    });
    if (activeRequest) {
      throw new BadRequestException("已有待处理转服申请");
    }
  }

  private async buildTransferReport(
    tx: Tx,
    input: {
      player: PlayerForTransfer;
      sourceServerId: string;
      targetServerId: string;
      targetServerStage: string | undefined;
    },
  ) {
    const playerId = input.player.playerId;
    const [
      itemCount,
      unboundItemCount,
      monthlyCards,
      pityStates,
      orderCount,
      paidOrderCount,
      appearanceCount,
      collectionCount,
      rankEntryCount,
      openRiskCount,
      delayedSettlementCount,
      activeDiplomacyCount,
      openHireCount,
    ] = await Promise.all([
      tx.playerItem.count({ where: { playerId } }),
      tx.playerItem.count({ where: { playerId, bindType: "unbound" } }),
      tx.monthlyCardState.findMany({ where: { playerId } }),
      tx.gachaPityState.findMany({ where: { playerId } }),
      tx.purchaseOrder.count({ where: { playerId } }),
      tx.purchaseOrder.count({ where: { playerId, status: "paid" } }),
      tx.appearanceOwnershipRecord.count({ where: { playerId } }),
      tx.eraCollectionRecord.count({ where: { playerId } }),
      tx.rankEntry.count({ where: { targetType: "player", targetId: playerId } }),
      tx.behaviorRiskRecord.count({ where: { playerId, resolutionStatus: "open" } }),
      tx.delayedSettlementRecord.count({ where: { playerId, status: "delayed" } }),
      input.player.sectId
        ? tx.sectDiplomacyRecord.count({
            where: {
              OR: [
                { sourceSectId: input.player.sectId, status: { in: ["proposed", "active"] } },
                { targetSectId: input.player.sectId, status: { in: ["proposed", "active"] } },
              ],
            },
          })
        : 0,
      input.player.sectId
        ? tx.sectHireRecord.count({
            where: {
              OR: [
                { employerSectId: input.player.sectId, status: { in: ["open", "accepted"] } },
                { helperSectId: input.player.sectId, status: { in: ["accepted"] } },
              ],
            },
          })
        : 0,
    ]);
    const rankCooldownUntil = new Date(Date.now() + transferRankCooldownDays * 24 * 60 * 60 * 1000);
    const wallet = input.player.wallet;
    const riskLevel = openRiskCount > 0 || delayedSettlementCount > 0 ? "manual_review" : "low";

    return {
      dryRunReport: toJson({
        mode: "dry_run_only",
        player_id: playerId,
        player_name: input.player.name,
        source_server_id: input.sourceServerId,
        target_server_id: input.targetServerId,
        target_server_stage: input.targetServerStage ?? "normal",
        era_id: input.player.progress?.eraId ?? "era_mvp_001",
        data_mutation: false,
        final_battle_forbidden_days: finalBattleForbiddenDays,
        rank_cooldown_days: transferRankCooldownDays,
        manual_review_required: true,
      }),
      assetMappingSummary: toJson({
        wallet: {
          spirit_stone: wallet?.spiritStone.toString() ?? "0",
          jade_paid: wallet?.jadePaid.toString() ?? "0",
          jade_bound: wallet?.jadeBound.toString() ?? "0",
          era_point: wallet?.eraPoint.toString() ?? "0",
          mapping: "保留并校验，不在 dry-run 中迁移或扣减。",
        },
        bag: {
          item_count: itemCount,
          unbound_item_count: unboundItemCount,
          mapping: "背包逐项映射，绑定状态不改变；P2 当前只生成摘要。",
        },
        monthly_cards: monthlyCards.map((card) => ({
          card_type: card.cardType,
          active_until: card.activeUntil.toISOString(),
          remaining_days: card.remainingDays,
        })),
        gacha_pity: pityStates.map((state) => ({
          pool_type: state.poolType,
          pity_count: state.pityCount,
          total_draws: state.totalDraws,
          guarantee_at: state.guaranteeAt,
        })),
        appearances: appearanceCount,
        collections: collectionCount,
        duplicate_assets_allowed: false,
      }),
      paymentAssetCheckSummary: toJson({
        paid_wallet_present: (wallet?.jadePaid ?? 0n) > 0n || (wallet?.jadeBound ?? 0n) > 0n,
        purchase_order_count: orderCount,
        paid_order_count: paidOrderCount,
        monthly_card_count: monthlyCards.length,
        gacha_pity_state_count: pityStates.length,
        rule: "付费资产、月卡剩余天数、订单和保底必须原样校验，不允许复制或丢失。",
      }),
      sectCleanupSummary: toJson({
        current_sect_id: input.player.sectId,
        role: input.player.sectMembership?.role ?? null,
        active_diplomacy_count: activeDiplomacyCount,
        open_hire_count: openHireCount,
        cleanup_required: Boolean(input.player.sectId),
        suggestion: input.player.sectId
          ? "转服前需退出宗门、清理外交和雇佣状态，并给宗门生成补偿建议。"
          : "未加入宗门，无需宗门清理。",
      }),
      riskSummary: toJson({
        risk_level: riskLevel,
        open_risk_count: openRiskCount,
        delayed_settlement_count: delayedSettlementCount,
        manual_review_required: true,
        rank_entry_count: rankEntryCount,
        rank_cooldown_until: rankCooldownUntil.toISOString(),
        rule: "转服后至少 7 天内不能参与部分排行奖励；风险和延迟收益需人工复核。",
      }),
      rankCooldownUntil,
    };
  }

  private async writeOperation(
    tx: Tx,
    input: {
      operator: string;
      action: string;
      targetType: string;
      targetId?: string | null;
      beforeSnapshot?: Prisma.InputJsonValue | null;
      afterSnapshot?: Prisma.InputJsonValue | null;
      reason?: string | null;
      idempotencyKey?: string | null;
    },
  ) {
    return tx.gmOperationLog.create({
      data: {
        operationId: `gmop_${randomUUID()}`,
        operator: input.operator,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        beforeSnapshot: input.beforeSnapshot ?? undefined,
        afterSnapshot: input.afterSnapshot ?? undefined,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  }

  private async withIdempotency<TResponse>(input: {
    accountId?: string;
    endpoint: string;
    idempotencyKey: string;
    requestBody: unknown;
    handler: (tx: Tx) => Promise<TResponse>;
  }): Promise<TResponse> {
    const requestHash = hashRequestBody(input.requestBody);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existingRecord) {
      if (
        existingRecord.endpoint !== input.endpoint ||
        existingRecord.requestHash !== requestHash ||
        (input.accountId && existingRecord.accountId !== input.accountId)
      ) {
        throw new BadRequestException("幂等键已被其他请求使用");
      }

      return existingRecord.responseData as unknown as TResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const response = await input.handler(tx);
      await tx.idempotencyRecord.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          accountId: input.accountId,
          endpoint: input.endpoint,
          requestHash,
          responseData: response as unknown as Prisma.InputJsonValue,
          statusCode: 200,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return response;
    });
  }
}

function normalizeCreateTransferRequest(
  body: CreateTransferRequestRequest,
): Required<CreateTransferRequestRequest> {
  const targetServerId = body?.target_server_id?.trim();
  if (!targetServerId) {
    throw new BadRequestException("请选择目标服务器");
  }

  return {
    target_server_id: targetServerId,
    reason: body.reason?.trim() ?? "",
  };
}

function normalizeCancelTransferRequest(
  body: CancelTransferRequestRequest,
): Required<CancelTransferRequestRequest> {
  const transferRequestId = body?.transfer_request_id?.trim();
  if (!transferRequestId) {
    throw new BadRequestException("请选择转服申请");
  }

  return {
    transfer_request_id: transferRequestId,
    reason: body.reason?.trim() ?? "",
  };
}

function normalizeAdminDryRunRequest(
  body: AdminCreateTransferDryRunRequest,
): Required<AdminCreateTransferDryRunRequest> {
  const playerId = body?.player_id?.trim();
  const targetServerId = body?.target_server_id?.trim();
  if (!playerId) {
    throw new BadRequestException("请选择玩家");
  }
  if (!targetServerId) {
    throw new BadRequestException("请选择目标服务器");
  }

  return {
    player_id: playerId,
    target_server_id: targetServerId,
    source_server_id: body.source_server_id?.trim() || transferCurrentServerId,
    target_server_stage: body.target_server_stage?.trim() || "normal",
    operator: body.operator?.trim() || "admin_dev",
    reason: body.reason?.trim() ?? "",
  };
}

function normalizeReviewRequest(
  body: AdminReviewTransferRequest,
): Required<AdminReviewTransferRequest> {
  const transferRequestId = body?.transfer_request_id?.trim();
  if (!transferRequestId || (body.decision !== "approve" && body.decision !== "reject")) {
    throw new BadRequestException("请选择转服申请和审核结果");
  }

  return {
    transfer_request_id: transferRequestId,
    decision: body.decision,
    operator: body.operator?.trim() || "admin_dev",
    reason: body.reason?.trim() ?? "",
  };
}

function normalizeExecuteRequest(
  body: AdminExecuteTransferRequest,
): Required<AdminExecuteTransferRequest> {
  const transferRequestId = body?.transfer_request_id?.trim();
  if (!transferRequestId) {
    throw new BadRequestException("请选择转服申请");
  }

  return {
    transfer_request_id: transferRequestId,
    confirm_text: body.confirm_text?.trim() ?? "",
    operator: body.operator?.trim() || "admin_dev",
    reason: body.reason?.trim() ?? "",
  };
}

function isActiveTransferRequest(record: TransferRequestRecord): boolean {
  return ["submitted", "reviewing", "pending_confirm"].includes(record.status);
}

function isFinalBattleForbidden(targetServerId: string, targetServerStage: string | undefined) {
  return targetServerStage === "final_war_30d" || targetServerId.includes("final_war_30d");
}

function toOperationState(operation: GmOperationLog) {
  return {
    operation_id: operation.operationId,
    operator: operation.operator,
    action: operation.action,
    target_type: operation.targetType,
    target_id: operation.targetId,
    reason: operation.reason,
    idempotency_key: operation.idempotencyKey,
    created_at: operation.createdAt.toISOString(),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
