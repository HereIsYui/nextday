import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AdminActionRecordState,
  AdminConfigValidationResult,
  AdminConfigVersionListResponse,
  AdminConfigVersionState,
  AdminGachaRecordState,
  AdminGmOperationListResponse,
  AdminGmOperationState,
  AdminMailListResponse,
  AdminMailState,
  AdminOrderState,
  AdminPlayerDigestResponse,
  AnnouncementListResponse,
  AnnouncementState,
  CreateAnnouncementRequest,
  CreateAnnouncementResponse,
  CreateMergeDryRunRequest,
  CreateMergeDryRunResponse,
  ExecuteMergeReservedRequest,
  ExecuteMergeReservedResponse,
  MergeDryRunReportResponse,
  MergeDryRunReportState,
  PublishAdminConfigRequest,
  PublishAdminConfigResponse,
  ResolveRiskRecordRequest,
  ResolveRiskRecordResponse,
  RewardBundle,
  RollbackAdminConfigRequest,
  RollbackAdminConfigResponse,
  SendAdminMailRequest,
  SendAdminMailResponse,
} from "@nextday/shared";
import type {
  Announcement,
  ConfigVersion,
  GachaRecord,
  GmOperationLog,
  MergeDryRunReport,
  PlayerMail,
  Prisma,
  PurchaseOrder,
} from "@prisma/client";
import { toPlayerSummary, toPublicAccount } from "../auth/auth.service";
import { ancientTreasures } from "../commerce/commerce.constants";
import { PrismaService } from "../database/prisma.service";
import { defaultConfigEnvelopes } from "../game-config/default-configs";
import { toBattleSummary } from "../game/game.mappers";
import { hashRequestBody } from "../platform/utils/hash";
import { toPlayerProfileResponse } from "../player/player.mapper";
import { toBehaviorRiskRecordState } from "../risk/risk.mappers";
import { RiskService } from "../risk/risk.service";

type Tx = Prisma.TransactionClient;
const mergeDryRunConfigVersion = "merge_dry_run_p1_v1";
const mergeDryRunRulesetVersion = "ruleset_p1_merge_v1";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RiskService) private readonly riskService: RiskService,
  ) {}

  async getPlayerDigest(playerId: string): Promise<AdminPlayerDigestResponse> {
    const player = await this.prisma.player.findUnique({
      where: { playerId },
      include: { account: true, progress: true, wallet: true },
    });
    if (!player) {
      throw new BadRequestException("玩家不存在");
    }

    const [orders, gachaRecords, battles, towerActions, bossActions, caveActions, mails, risk] =
      await Promise.all([
        this.prisma.purchaseOrder.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        this.prisma.gachaRecord.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        this.prisma.battleLog.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        this.prisma.towerActionRecord.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        this.prisma.worldBossChallengeRecord.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        this.prisma.caveCollectRecord.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        this.prisma.playerMail.findMany({
          where: { OR: [{ playerId }, { targetType: "all" }] },
          orderBy: { createdAt: "desc" },
          take: 12,
        }),
        this.riskService.getPlayerRisk(playerId),
      ]);
    const profile = toPlayerProfileResponse({
      player,
      progress: player.progress,
      wallet: player.wallet,
    });

    return {
      player: toPlayerSummary(player),
      account: toPublicAccount(player.account),
      progress: profile.progress,
      wallet: profile.wallet,
      orders: orders.map(toAdminOrderState),
      gacha_records: gachaRecords.map(toAdminGachaRecordState),
      battles: battles.map(toBattleSummary),
      action_records: [
        ...towerActions.map((record) => ({
          record_id: record.recordId,
          action_type: record.actionType,
          source: "tower" as const,
          summary: `${record.towerId} 贡献 ${record.contribution}`,
          settlement_status: record.settlementStatus,
          created_at: record.createdAt.toISOString(),
        })),
        ...bossActions.map((record) => ({
          record_id: record.recordId,
          action_type: "boss_challenge",
          source: "boss" as const,
          summary: `${record.bossId} 伤害 ${record.damageDone}`,
          settlement_status: "settled",
          created_at: record.createdAt.toISOString(),
        })),
        ...caveActions.map((record) => ({
          record_id: record.recordId,
          action_type: "cave_collect",
          source: "cave" as const,
          summary: `灵石 ${record.spiritStone.toString()}，${record.collectedMinutes} 分钟`,
          settlement_status: "settled",
          created_at: record.createdAt.toISOString(),
        })),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at)) satisfies AdminActionRecordState[],
      mails: mails.map(toMailState),
      risk,
    };
  }

  async listMails(playerId?: string): Promise<AdminMailListResponse> {
    const mails = await this.prisma.playerMail.findMany({
      where: playerId ? { OR: [{ playerId }, { targetType: "all" }] } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return { mails: mails.map(toMailState) };
  }

  async sendMail(input: {
    body: SendAdminMailRequest;
    idempotencyKey: string;
  }): Promise<SendAdminMailResponse> {
    const body = normalizeMailRequest(input.body);
    validateMailRewards(body.rewards ?? {});

    return this.withAdminIdempotency({
      endpoint: "POST /api/admin/mails/send",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        if (body.target_type === "player") {
          await tx.player.findUniqueOrThrow({ where: { playerId: body.player_id } });
        }
        const mail = await tx.playerMail.create({
          data: {
            mailId: `mail_${randomUUID()}`,
            playerId: body.target_type === "player" ? body.player_id : null,
            targetType: body.target_type,
            title: body.title,
            content: body.content,
            rewardSnapshot: (body.rewards ?? {}) as Prisma.InputJsonValue,
            sentBy: body.operator ?? "admin_dev",
            reason: body.reason ?? null,
            expiresAt: body.expires_at ? new Date(body.expires_at) : null,
            idempotencyKey: input.idempotencyKey,
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator ?? "admin_dev",
          action: "send_mail",
          targetType: "player_mail",
          targetId: mail.mailId,
          afterSnapshot: toJson(toMailState(mail)),
          reason: body.reason ?? null,
          idempotencyKey: input.idempotencyKey,
        });

        return { mail: toMailState(mail), operation: toOperationState(operation) };
      },
    });
  }

  async listAnnouncements(): Promise<AnnouncementListResponse> {
    const announcements = await this.prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return { announcements: announcements.map(toAnnouncementState) };
  }

  async createAnnouncement(input: {
    body: CreateAnnouncementRequest;
    idempotencyKey: string;
  }): Promise<CreateAnnouncementResponse> {
    const body = normalizeAnnouncementRequest(input.body);

    return this.withAdminIdempotency({
      endpoint: "POST /api/admin/announcements",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const announcement = await tx.announcement.create({
          data: {
            announcementId: `announce_${randomUUID()}`,
            announcementType: body.announcement_type,
            title: body.title,
            content: body.content,
            visibleScope: body.visible_scope ?? "all",
            relatedConfigVersion: body.related_config_version ?? null,
            publishedBy: body.operator ?? "admin_dev",
            startsAt: body.starts_at ? new Date(body.starts_at) : new Date(),
            endsAt: body.ends_at ? new Date(body.ends_at) : null,
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator ?? "admin_dev",
          action: "create_announcement",
          targetType: "announcement",
          targetId: announcement.announcementId,
          afterSnapshot: toJson(toAnnouncementState(announcement)),
          idempotencyKey: input.idempotencyKey,
        });

        return {
          announcement: toAnnouncementState(announcement),
          operation: toOperationState(operation),
        };
      },
    });
  }

  async listConfigVersions(configType?: string): Promise<AdminConfigVersionListResponse> {
    const configs = await this.prisma.configVersion.findMany({
      where: configType ? { configType } : undefined,
      orderBy: [{ configType: "asc" }, { publishedAt: "desc" }],
      take: 80,
    });

    return { configs: configs.map(toConfigState) };
  }

  async publishConfig(input: {
    body: PublishAdminConfigRequest;
    idempotencyKey: string;
  }): Promise<PublishAdminConfigResponse> {
    const body = normalizePublishConfigRequest(input.body);
    const validation = validateConfigPayload(body.config_type, body.payload);

    return this.withAdminIdempotency({
      endpoint: "POST /api/admin/configs/publish",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const previous = await tx.configVersion.findMany({
          where: { configType: body.config_type, active: true },
          orderBy: { publishedAt: "desc" },
        });
        await tx.configVersion.updateMany({
          where: { configType: body.config_type, active: true },
          data: { active: false },
        });
        const config = await tx.configVersion.upsert({
          where: {
            configType_configVersion: {
              configType: body.config_type,
              configVersion: body.config_version,
            },
          },
          create: {
            configId: `config_${randomUUID()}`,
            configType: body.config_type,
            configVersion: body.config_version,
            rulesetVersion: body.ruleset_version ?? `ruleset_${body.config_version}`,
            rewardConfigVersion: body.reward_config_version ?? `reward_${body.config_version}`,
            payload: body.payload as Prisma.InputJsonValue,
            active: true,
            publishedAt: new Date(),
          },
          update: {
            rulesetVersion: body.ruleset_version ?? `ruleset_${body.config_version}`,
            rewardConfigVersion: body.reward_config_version ?? `reward_${body.config_version}`,
            payload: body.payload as Prisma.InputJsonValue,
            active: true,
            publishedAt: new Date(),
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator ?? "admin_dev",
          action: "publish_config",
          targetType: "config_version",
          targetId: config.configId,
          beforeSnapshot: toJson(previous.map(toConfigState)),
          afterSnapshot: toJson({ config: toConfigState(config), validation }),
          reason: body.reason ?? null,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          config: toConfigState(config),
          validation,
          operation: toOperationState(operation),
        };
      },
    });
  }

  async rollbackConfig(input: {
    body: RollbackAdminConfigRequest;
    idempotencyKey: string;
  }): Promise<RollbackAdminConfigResponse> {
    const body = normalizeRollbackConfigRequest(input.body);

    return this.withAdminIdempotency({
      endpoint: "POST /api/admin/configs/rollback",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const target = await tx.configVersion.findUnique({
          where: {
            configType_configVersion: {
              configType: body.config_type,
              configVersion: body.target_config_version,
            },
          },
        });
        if (!target) {
          throw new BadRequestException("回滚目标配置不存在");
        }
        const previous = await tx.configVersion.findMany({
          where: { configType: body.config_type, active: true },
        });
        await tx.configVersion.updateMany({
          where: { configType: body.config_type, active: true },
          data: { active: false },
        });
        const config = await tx.configVersion.update({
          where: { configId: target.configId },
          data: { active: true, publishedAt: new Date() },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator ?? "admin_dev",
          action: "rollback_config",
          targetType: "config_version",
          targetId: config.configId,
          beforeSnapshot: toJson(previous.map(toConfigState)),
          afterSnapshot: toJson(toConfigState(config)),
          reason: body.reason ?? null,
          idempotencyKey: input.idempotencyKey,
        });

        return { config: toConfigState(config), operation: toOperationState(operation) };
      },
    });
  }

  async resolveRiskRecord(input: {
    body: ResolveRiskRecordRequest;
    idempotencyKey: string;
  }): Promise<ResolveRiskRecordResponse> {
    const body = normalizeResolveRiskRequest(input.body);

    return this.withAdminIdempotency({
      endpoint: "POST /api/admin/risk/resolve",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const previous = await tx.behaviorRiskRecord.findUnique({
          where: { riskRecordId: body.risk_record_id },
        });
        if (!previous) {
          throw new BadRequestException("风控记录不存在");
        }
        const record = await tx.behaviorRiskRecord.update({
          where: { riskRecordId: body.risk_record_id },
          data: {
            resolutionStatus: "resolved",
            resolutionReason: body.reason ?? null,
            resolvedBy: body.operator ?? "admin_dev",
            resolvedAt: new Date(),
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator ?? "admin_dev",
          action: "resolve_risk_record",
          targetType: "behavior_risk_record",
          targetId: record.riskRecordId,
          beforeSnapshot: toJson(toBehaviorRiskRecordState(previous)),
          afterSnapshot: toJson(toBehaviorRiskRecordState(record)),
          reason: body.reason ?? null,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record: toBehaviorRiskRecordState(record),
          operation: toOperationState(operation),
        };
      },
    });
  }

  async createMergeDryRun(input: {
    body: CreateMergeDryRunRequest;
    idempotencyKey: string;
  }): Promise<CreateMergeDryRunResponse> {
    const body = normalizeMergeDryRunRequest(input.body);

    return this.withAdminIdempotency({
      endpoint: "POST /api/admin/merge/dry-run",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const reportData = await this.buildMergeDryRunData(tx, body);
        const report = await tx.mergeDryRunReport.create({
          data: {
            reportId: `merge_dry_${randomUUID()}`,
            sourceServerIds: body.source_server_ids as unknown as Prisma.InputJsonValue,
            targetServerId: body.target_server_id,
            status: "generated",
            summary: reportData.summary,
            conflictSummary: reportData.conflictSummary,
            assetInheritanceSummary: reportData.assetInheritanceSummary,
            rankFreezeSummary: reportData.rankFreezeSummary,
            sectConflictSummary: reportData.sectConflictSummary,
            compensationSuggestion: reportData.compensationSuggestion,
            riskSummary: reportData.riskSummary,
            rollbackSuggestion: reportData.rollbackSuggestion,
            configVersion: mergeDryRunConfigVersion,
            rulesetVersion: mergeDryRunRulesetVersion,
            generatedBy: body.operator,
            executeStatus: "reserved_only",
            idempotencyKey: input.idempotencyKey,
          },
        });
        const operation = await this.writeOperation(tx, {
          operator: body.operator,
          action: "merge_dry_run",
          targetType: "merge_dry_run_report",
          targetId: report.reportId,
          afterSnapshot: toJson(toMergeDryRunReportState(report)),
          reason: body.reason,
          idempotencyKey: `${input.idempotencyKey}:operation`,
        });

        return {
          report: toMergeDryRunReportState(report),
          operation: toOperationState(operation),
        };
      },
    });
  }

  async getMergeDryRunReport(reportId: string): Promise<MergeDryRunReportResponse> {
    const report = await this.prisma.mergeDryRunReport.findUnique({ where: { reportId } });
    if (!report) {
      throw new BadRequestException("合服 dry-run 报告不存在");
    }

    return { report: toMergeDryRunReportState(report) };
  }

  async reserveMergeExecution(input: {
    body: ExecuteMergeReservedRequest;
    idempotencyKey: string;
  }): Promise<ExecuteMergeReservedResponse> {
    const body = normalizeExecuteMergeRequest(input.body);

    return this.withAdminIdempotency({
      endpoint: "POST /api/admin/merge/execute",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const report = await tx.mergeDryRunReport.findUnique({
          where: { reportId: body.report_id },
        });
        if (!report) {
          throw new BadRequestException("合服 dry-run 报告不存在");
        }
        const operation = await this.writeOperation(tx, {
          operator: body.operator,
          action: "merge_execute_reserved",
          targetType: "merge_dry_run_report",
          targetId: report.reportId,
          beforeSnapshot: toJson(toMergeDryRunReportState(report)),
          afterSnapshot: toJson({
            allowed: false,
            execution_status: "reserved_only",
            message: "真实合服执行未开放，必须人工确认并单独发布。",
          }),
          reason: body.reason,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          allowed: false,
          execution_status: "reserved_only",
          message: "真实合服执行未开放，必须人工确认并单独发布。",
          report: toMergeDryRunReportState(report),
          operation: toOperationState(operation),
        };
      },
    });
  }

  async listOperations(): Promise<AdminGmOperationListResponse> {
    const operations = await this.prisma.gmOperationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
    });

    return { operations: operations.map(toOperationState) };
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

  private async withAdminIdempotency<TResponse>(input: {
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
        existingRecord.requestHash !== requestHash
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

  private async buildMergeDryRunData(tx: Tx, body: Required<CreateMergeDryRunRequest>) {
    const [
      playerCount,
      sects,
      activeMonthlyCount,
      paidWalletCount,
      pityCount,
      rankSnapshotCount,
      rankEntryCount,
      openRiskCount,
      delayedSettlementCount,
      orderCount,
      eventRecordCount,
    ] = await Promise.all([
      tx.player.count({ where: body.include_inactive ? undefined : { status: "normal" } }),
      tx.sect.findMany({ include: { members: true } }),
      tx.monthlyCardState.count({ where: { activeUntil: { gt: new Date() } } }),
      tx.playerWallet.count({ where: { OR: [{ jadePaid: { gt: 0 } }, { jadeBound: { gt: 0 } }] } }),
      tx.gachaPityState.count(),
      tx.rankSnapshot.count(),
      tx.rankEntry.count(),
      tx.behaviorRiskRecord.count({ where: { resolutionStatus: "open" } }),
      tx.delayedSettlementRecord.count({ where: { status: "delayed" } }),
      tx.purchaseOrder.count(),
      tx.eventRecord.count(),
    ]);
    const duplicateSectNames = findDuplicates(sects.map((sect) => sect.name));
    const sectsOverLimit = sects.filter((sect) => sect.members.length > sect.memberLimit);
    const conflictCount = duplicateSectNames.length + sectsOverLimit.length;
    const riskLevel =
      openRiskCount + delayedSettlementCount > 0 || conflictCount > 0 ? "manual_review" : "low";

    return {
      summary: toJson({
        mode: "dry_run_only",
        player_count: playerCount,
        sect_count: sects.length,
        source_server_ids: body.source_server_ids,
        target_server_id: body.target_server_id,
        include_inactive: body.include_inactive,
        data_mutation: false,
      }),
      conflictSummary: toJson({
        duplicate_player_names: [],
        duplicate_sect_names: duplicateSectNames,
        note: "当前 MVP 单服内玩家和宗门名称唯一；跨服重名需在真实多服数据接入后重新 dry-run。",
      }),
      assetInheritanceSummary: toJson({
        paid_wallet_count: paidWalletCount,
        active_monthly_card_count: activeMonthlyCount,
        gacha_pity_state_count: pityCount,
        purchase_order_count: orderCount,
        rule: "dry-run 只检查付费资产、月卡剩余天数和保底记录，不迁移、不折算、不扣减。",
      }),
      rankFreezeSummary: toJson({
        rank_snapshot_count: rankSnapshotCount,
        rank_entry_count: rankEntryCount,
        freeze_required: rankSnapshotCount > 0,
        rule: "真实合服前需冻结排行快照；dry-run 不锁榜、不发奖、不补发排行冲刺奖励。",
      }),
      sectConflictSummary: toJson({
        sect_count: sects.length,
        duplicate_sect_names: duplicateSectNames,
        over_member_limit: sectsOverLimit.map((sect) => ({
          sect_id: sect.sectId,
          name: sect.name,
          member_count: sect.members.length,
          member_limit: sect.memberLimit,
        })),
        rule: "宗门同名生成改名建议；成员超限需保留原成员但冻结新加入，等待人工处理。",
      }),
      compensationSuggestion: toJson({
        affected_player_count: playerCount,
        event_record_count: eventRecordCount,
        mail_template: "合服演练完成后仅建议基础补偿，排行冲刺奖励不补发。",
        reward_boundary: "不得包含付费仙玉、九大古宝本体、限定法宝、唯一战力或倍率奖励。",
      }),
      riskSummary: toJson({
        risk_level: riskLevel,
        open_risk_count: openRiskCount,
        delayed_settlement_count: delayedSettlementCount,
        manual_review_required: riskLevel === "manual_review",
      }),
      rollbackSuggestion: toJson({
        dry_run_rollback: "dry-run 不修改真实数据，无需回滚业务表。",
        real_merge_rollback:
          "真实合服必须在执行前生成数据库备份、订单快照、保底快照、排行冻结快照和宗门冲突清单。",
        execution_entry: "POST /api/admin/merge/execute 当前仅写入预留审计，不执行真实合服。",
      }),
    };
  }
}

function toAdminOrderState(order: PurchaseOrder): AdminOrderState {
  return {
    order_id: order.orderId,
    player_id: order.playerId,
    product_id: order.productId,
    product_type: order.productType,
    fishpi_point_cost: order.fishpiPointCost.toString(),
    paid_jade_amount: order.paidJadeAmount.toString(),
    bound_jade_amount: order.boundJadeAmount.toString(),
    status: order.status,
    config_version: order.configVersion,
    reward_config_version: order.rewardConfigVersion,
    created_at: order.createdAt.toISOString(),
  };
}

function toAdminGachaRecordState(record: GachaRecord): AdminGachaRecordState {
  return {
    gacha_id: record.gachaId,
    player_id: record.playerId,
    pool_type: record.poolType,
    cost_type: record.costType,
    result_name: record.resultName,
    duplicate: record.duplicate,
    pity_before: record.pityBefore,
    pity_after: record.pityAfter,
    created_at: record.createdAt.toISOString(),
  };
}

function toMailState(mail: PlayerMail): AdminMailState {
  return {
    mail_id: mail.mailId,
    player_id: mail.playerId,
    target_type: mail.targetType,
    title: mail.title,
    content: mail.content,
    reward_snapshot: normalizeRewardBundle(mail.rewardSnapshot),
    status: mail.status,
    sent_by: mail.sentBy,
    reason: mail.reason,
    created_at: mail.createdAt.toISOString(),
    expires_at: mail.expiresAt?.toISOString() ?? null,
    read_at: mail.readAt?.toISOString() ?? null,
    claimed_at: mail.claimedAt?.toISOString() ?? null,
  };
}

function toAnnouncementState(announcement: Announcement): AnnouncementState {
  return {
    announcement_id: announcement.announcementId,
    announcement_type: announcement.announcementType,
    title: announcement.title,
    content: announcement.content,
    visible_scope: announcement.visibleScope,
    related_config_version: announcement.relatedConfigVersion,
    status: announcement.status,
    published_by: announcement.publishedBy,
    starts_at: announcement.startsAt.toISOString(),
    ends_at: announcement.endsAt?.toISOString() ?? null,
    created_at: announcement.createdAt.toISOString(),
    updated_at: announcement.updatedAt.toISOString(),
  };
}

function toConfigState(config: ConfigVersion): AdminConfigVersionState {
  return {
    config_id: config.configId,
    config_type: config.configType,
    config_version: config.configVersion,
    ruleset_version: config.rulesetVersion,
    reward_config_version: config.rewardConfigVersion,
    active: config.active,
    created_at: config.createdAt.toISOString(),
    published_at: config.publishedAt.toISOString(),
  };
}

function toOperationState(operation: GmOperationLog): AdminGmOperationState {
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

function normalizeMailRequest(body: SendAdminMailRequest): Required<SendAdminMailRequest> {
  const targetType = body?.target_type;
  const title = body?.title?.trim();
  const content = body?.content?.trim();
  if (targetType !== "player" && targetType !== "all") {
    throw new BadRequestException("邮件范围不合法");
  }
  if (targetType === "player" && !body.player_id?.trim()) {
    throw new BadRequestException("个人邮件必须指定玩家 ID");
  }
  if (!title || title.length > 40) {
    throw new BadRequestException("邮件标题需为 1-40 个字符");
  }
  if (!content || content.length > 1000) {
    throw new BadRequestException("邮件正文需为 1-1000 个字符");
  }

  return {
    target_type: targetType,
    player_id: body.player_id?.trim() ?? "",
    title,
    content,
    rewards: body.rewards ?? {},
    reason: body.reason?.trim() ?? "",
    operator: body.operator?.trim() || "admin_dev",
    expires_at: body.expires_at ?? "",
  };
}

function normalizeAnnouncementRequest(
  body: CreateAnnouncementRequest,
): Required<CreateAnnouncementRequest> {
  const type = body?.announcement_type;
  const title = body?.title?.trim();
  const content = body?.content?.trim();
  if (!["maintenance", "activity", "probability", "rules", "risk", "era"].includes(type)) {
    throw new BadRequestException("公告类型不合法");
  }
  if (!title || title.length > 50) {
    throw new BadRequestException("公告标题需为 1-50 个字符");
  }
  if (!content || content.length > 2000) {
    throw new BadRequestException("公告正文需为 1-2000 个字符");
  }

  return {
    announcement_type: type,
    title,
    content,
    visible_scope: body.visible_scope?.trim() || "all",
    related_config_version: body.related_config_version?.trim() ?? "",
    starts_at: body.starts_at ?? "",
    ends_at: body.ends_at ?? "",
    operator: body.operator?.trim() || "admin_dev",
  };
}

function normalizePublishConfigRequest(
  body: PublishAdminConfigRequest,
): Required<PublishAdminConfigRequest> {
  const configType = body?.config_type;
  const configVersion = body?.config_version?.trim();
  if (!configType || !defaultConfigEnvelopes[configType]) {
    throw new BadRequestException("配置类型不支持");
  }
  if (!configVersion || configVersion.length > 60) {
    throw new BadRequestException("配置版本需为 1-60 个字符");
  }
  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    throw new BadRequestException("配置 payload 必须是对象");
  }
  const defaultEnvelope = defaultConfigEnvelopes[configType];

  return {
    config_type: configType,
    config_version: configVersion,
    ruleset_version: body.ruleset_version?.trim() || defaultEnvelope.ruleset_version,
    reward_config_version:
      body.reward_config_version?.trim() || defaultEnvelope.reward_config_version,
    payload: body.payload,
    reason: body.reason?.trim() ?? "",
    operator: body.operator?.trim() || "admin_dev",
  };
}

function normalizeRollbackConfigRequest(
  body: RollbackAdminConfigRequest,
): Required<RollbackAdminConfigRequest> {
  const configType = body?.config_type;
  const targetVersion = body?.target_config_version?.trim();
  if (!configType || !defaultConfigEnvelopes[configType]) {
    throw new BadRequestException("配置类型不支持");
  }
  if (!targetVersion) {
    throw new BadRequestException("请选择回滚版本");
  }

  return {
    config_type: configType,
    target_config_version: targetVersion,
    reason: body.reason?.trim() ?? "",
    operator: body.operator?.trim() || "admin_dev",
  };
}

function normalizeResolveRiskRequest(
  body: ResolveRiskRecordRequest,
): Required<ResolveRiskRecordRequest> {
  const riskRecordId = body?.risk_record_id?.trim();
  if (!riskRecordId) {
    throw new BadRequestException("请选择风控记录");
  }

  return {
    risk_record_id: riskRecordId,
    reason: body.reason?.trim() ?? "",
    operator: body.operator?.trim() || "admin_dev",
  };
}

function normalizeMergeDryRunRequest(
  body: CreateMergeDryRunRequest,
): Required<CreateMergeDryRunRequest> {
  const sourceServerIds = Array.isArray(body?.source_server_ids)
    ? body.source_server_ids.map((item) => item.trim()).filter(Boolean)
    : [];
  const targetServerId = body?.target_server_id?.trim();
  if (sourceServerIds.length < 1) {
    throw new BadRequestException("合服 dry-run 至少需要 1 个来源服务器");
  }
  if (!targetServerId) {
    throw new BadRequestException("合服 dry-run 必须指定目标服务器");
  }
  if (sourceServerIds.includes(targetServerId)) {
    throw new BadRequestException("目标服务器不能同时作为来源服务器");
  }

  return {
    source_server_ids: sourceServerIds,
    target_server_id: targetServerId,
    include_inactive: body.include_inactive ?? false,
    operator: body.operator?.trim() || "admin_dev",
    reason: body.reason?.trim() ?? "",
  };
}

function normalizeExecuteMergeRequest(
  body: ExecuteMergeReservedRequest,
): Required<ExecuteMergeReservedRequest> {
  const reportId = body?.report_id?.trim();
  if (!reportId) {
    throw new BadRequestException("请选择合服 dry-run 报告");
  }

  return {
    report_id: reportId,
    confirm_text: body.confirm_text?.trim() ?? "",
    operator: body.operator?.trim() || "admin_dev",
    reason: body.reason?.trim() ?? "",
  };
}

function validateMailRewards(rewards: RewardBundle) {
  if (BigInt(rewards.jade_paid ?? "0") > 0n) {
    throw new BadRequestException("补偿邮件不能发放付费仙玉");
  }

  for (const item of rewards.items ?? []) {
    if (
      item.item_id.includes("ancient_treasure") ||
      item.item_id.includes("limited") ||
      item.item_id.includes("gubao")
    ) {
      throw new BadRequestException("补偿邮件不能发放限定法宝或九大古宝");
    }
  }
}

function validateConfigPayload(
  configType: string,
  payload: Record<string, unknown>,
): AdminConfigValidationResult {
  const warnings: string[] = [];
  const text = JSON.stringify(payload);
  if (text.includes('"jade_paid"')) {
    warnings.push("配置中包含付费仙玉字段，请确认不是补偿或排行奖励");
  }
  if (configType === "gacha") {
    validateGachaConfig(payload);
  }
  if (configType === "inner_world") {
    validateInnerWorldConfig(payload);
  }
  if (configType === "faction_route") {
    validateFactionRouteConfig(payload);
  }
  if (configType === "rank" || configType === "era_rank") {
    validateRankConfig(payload);
  }
  if (configType === "event" || configType === "activity_template") {
    validateActivityConfig(payload);
  }
  if (configType === "merge_dry_run") {
    validateMergeDryRunConfig(payload);
  }
  if (configType === "transfer_rule") {
    validateTransferRuleConfig(payload);
  }
  if (configType === "convenience" && text.includes('"reward_multiplier":2')) {
    throw new BadRequestException("便利配置不能提高奖励倍率");
  }

  return { passed: true, warnings };
}

function validateGachaConfig(payload: Record<string, unknown>) {
  const pools = normalizeRecord(payload.pools);
  const ancientPool = normalizeRecord(pools?.ancient_treasure);
  if (!ancientPool) {
    return;
  }
  const results = Array.isArray(ancientPool.results) ? ancientPool.results : [];
  const validTreasureIds = new Set<string>(ancientTreasures.map((treasure) => treasure.treasureId));
  if (results.length !== validTreasureIds.size) {
    throw new BadRequestException("九大古宝池必须列满 9 件古宝");
  }
  for (const result of results) {
    const treasureId =
      typeof result === "object" && result !== null
        ? (result as Record<string, unknown>).treasure_id
        : null;
    if (typeof treasureId !== "string" || !validTreasureIds.has(treasureId)) {
      throw new BadRequestException("九大古宝池不能混入非九大古宝产物");
    }
  }
  const allowedCosts = Array.isArray(ancientPool.allowedCostTypes)
    ? ancientPool.allowedCostTypes
    : Array.isArray(ancientPool.allowed_cost_types)
      ? ancientPool.allowed_cost_types
      : [];
  if (allowedCosts.includes("paid_jade")) {
    throw new BadRequestException("当前九大古宝池不能开放付费仙玉直抽");
  }
}

function validateInnerWorldConfig(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  const forbiddenFragments = [
    '"jade_paid"',
    '"jade_bound"',
    "ancient_treasure",
    "gubao",
    "limited",
    "paid",
  ];
  if (forbiddenFragments.some((fragment) => text.includes(fragment))) {
    throw new BadRequestException("内天地配置不能产出付费货币、九大古宝、限定法宝或付费产物");
  }
  if (text.includes('"tradeable":true')) {
    throw new BadRequestException("内天地配置不能产出可交易材料");
  }
}

function validateFactionRouteConfig(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  const forbiddenFragments = [
    '"jade_paid"',
    '"paid_jade"',
    "ancient_treasure",
    "gubao",
    "limited",
    "unique_power",
    "reward_multiplier",
    "contribution_multiplier",
    "damage_multiplier",
    "必胜",
    "无敌",
    "碾压",
    "唯一战力",
  ];
  if (forbiddenFragments.some((fragment) => text.includes(fragment))) {
    throw new BadRequestException("阵营路线配置不能包含付费直给、限定产物、唯一战力或倍率奖励");
  }

  if (!Array.isArray(payload.routes)) {
    throw new BadRequestException("阵营路线配置必须提供 routes 数组");
  }

  const routeIds = new Set<string>();
  for (const route of payload.routes) {
    if (!route || typeof route !== "object" || Array.isArray(route)) {
      throw new BadRequestException("阵营路线项必须是对象");
    }
    const routeId = (route as Record<string, unknown>).route_id;
    if (!["immortal", "demon", "wanderer"].includes(String(routeId))) {
      throw new BadRequestException("阵营路线只能包含成仙、成魔和散修");
    }
    routeIds.add(String(routeId));
  }
  if (routeIds.size !== 3) {
    throw new BadRequestException("阵营路线必须列满成仙、成魔和散修三条路线");
  }
}

function validateRankConfig(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  const forbiddenFragments = [
    '"jade_paid"',
    '"paid_jade"',
    "ancient_treasure",
    "limited",
    "unique_power",
    "reward_multiplier",
    "contribution_multiplier",
    "damage_multiplier",
    "必胜",
    "无敌",
    "碾压",
    "唯一战力",
  ];
  if (forbiddenFragments.some((fragment) => text.includes(fragment))) {
    throw new BadRequestException("排行配置不能包含付费直给、限定产物、唯一战力或倍率奖励");
  }

  const rankTypes = Array.isArray(payload.rank_types) ? payload.rank_types : [];
  if (rankTypes.length === 0) {
    throw new BadRequestException("排行配置必须提供 rank_types");
  }
  if (text.includes('"cap_percent":') && !text.includes('"cap_percent":1')) {
    throw new BadRequestException("纪元祝福上限不能超过 1%");
  }
}

function validateActivityConfig(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  const forbiddenFragments = [
    '"jade_paid"',
    '"paid_jade"',
    "ancient_treasure",
    "gubao",
    "limited",
    "unique_power",
    "reward_multiplier",
    "contribution_multiplier",
    "damage_multiplier",
    "必胜",
    "无敌",
    "碾压",
    "唯一战力",
  ];
  if (forbiddenFragments.some((fragment) => text.includes(fragment))) {
    throw new BadRequestException("活动配置不能包含付费直给、限定产物、唯一战力或倍率奖励");
  }

  const events = Array.isArray(payload.events)
    ? payload.events
    : Array.isArray(payload.templates)
      ? payload.templates
      : [];
  if (events.length === 0) {
    throw new BadRequestException("活动配置必须提供 events 或 templates 数组");
  }
  if (text.includes('"async_enabled":false')) {
    throw new BadRequestException("P1 活动必须支持异步参与");
  }
}

function validateMergeDryRunConfig(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  if (text.includes('"mode":"execute"') || text.includes('"execution_enabled":true')) {
    throw new BadRequestException("P1 合服配置只能开放 dry-run，不能开放真实执行");
  }
  if (!text.includes("dry_run")) {
    throw new BadRequestException("合服配置必须明确 dry-run 模式");
  }
}

function validateTransferRuleConfig(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  if (text.includes('"free_transfer_enabled":true')) {
    throw new BadRequestException("P2 转服配置不能开放自由转服");
  }
  if (text.includes('"execute_enabled":true')) {
    throw new BadRequestException("P2 转服配置不能开放真实执行");
  }
  if (text.includes('"rank_cooldown_days":0')) {
    throw new BadRequestException("P2 转服配置不能取消排行冷却");
  }
  if (!text.includes("dry_run") || !text.includes("manual_review")) {
    throw new BadRequestException("转服配置必须明确 dry-run 和人工审核流程");
  }
}

function normalizeRewardBundle(value: unknown): RewardBundle {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as RewardBundle;
}

function normalizeRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toMergeDryRunReportState(report: MergeDryRunReport): MergeDryRunReportState {
  return {
    report_id: report.reportId,
    source_server_ids: normalizeStringArray(report.sourceServerIds),
    target_server_id: report.targetServerId,
    status: report.status,
    summary: report.summary as Record<string, unknown>,
    conflict_summary: report.conflictSummary as Record<string, unknown>,
    asset_inheritance_summary: report.assetInheritanceSummary as Record<string, unknown>,
    rank_freeze_summary: report.rankFreezeSummary as Record<string, unknown>,
    sect_conflict_summary: report.sectConflictSummary as Record<string, unknown>,
    compensation_suggestion: report.compensationSuggestion as Record<string, unknown>,
    risk_summary: report.riskSummary as Record<string, unknown>,
    rollback_suggestion: report.rollbackSuggestion as Record<string, unknown>,
    config_version: report.configVersion,
    ruleset_version: report.rulesetVersion,
    generated_by: report.generatedBy,
    execute_status: report.executeStatus,
    created_at: report.createdAt.toISOString(),
  };
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function findDuplicates(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
}
