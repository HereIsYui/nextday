import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ChooseFactionRouteRequest,
  ChooseFactionRouteResponse,
  ExperiencePayload,
  FactionReputationResponse,
  FactionRoutesResponse,
  FactionStateSummary,
  FactionTransferRecordState,
  PlayerWalletState,
  RewardBundle,
  TransferFactionRouteRequest,
  TransferFactionRouteResponse,
} from "@nextday/shared";
import type { Player, PlayerFactionState, PlayerProgress, Prisma, Sect } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { writeJournalFromResponse } from "../journal/journal.utils";
import { hashRequestBody } from "../platform/utils/hash";
import {
  factionConfigVersion,
  factionRewardConfigVersion,
  factionRouteConfigs,
  factionToSectAlignment,
  factionTransferBaseCost,
  factionTransferCooldownDays,
  factionTransferReputationClearRate,
  factionUnlockChapter,
  factionUnlockRealm,
  getFactionRouteConfig,
  isFactionRouteId,
} from "./factions.constants";
import {
  factionTransferRuleState,
  toFactionRouteConfigState,
  toFactionStateSummary,
  toFactionTransferRecordState,
} from "./factions.mappers";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type PlayerWithProgress = Player & { progress: PlayerProgress | null };

@Injectable()
export class FactionsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getRoutes(accountId: string): Promise<FactionRoutesResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureFactionState(player.playerId);

    return {
      state: await this.buildStateSummary(player.playerId),
      routes: factionRouteConfigs.map((config) => toFactionRouteConfigState({ config })),
      transfer_rule: factionTransferRuleState(),
      recent_records: await this.getRecentRecords(player.playerId),
    };
  }

  async getReputation(accountId: string): Promise<FactionReputationResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureFactionState(player.playerId);

    return {
      state: await this.buildStateSummary(player.playerId),
      routes: factionRouteConfigs.map((config) => toFactionRouteConfigState({ config })),
      recent_records: await this.getRecentRecords(player.playerId),
    };
  }

  async chooseRoute(input: {
    accountId: string;
    body: ChooseFactionRouteRequest;
    idempotencyKey: string;
  }): Promise<ChooseFactionRouteResponse> {
    const player = await this.requirePlayer(input.accountId);
    const routeId = normalizeRouteId(input.body?.route_id);
    const routeConfig = getFactionRouteConfig(routeId);
    if (!routeConfig) {
      throw new BadRequestException("未知仙魔路线");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/factions/choose",
      idempotencyKey: input.idempotencyKey,
      requestBody: { route_id: routeId },
      handler: async (tx) => {
        const context = await this.ensureFactionState(player.playerId, tx);
        this.assertUnlocked(context.player);
        if (context.state.route !== "undecided") {
          throw new BadRequestException("已选择仙魔路线，如需改变请走转道流程");
        }

        const sect = await this.getPlayerSect(tx, player.playerId);
        const nextState = await tx.playerFactionState.update({
          where: { playerId: player.playerId },
          data: {
            route: routeId,
            ...reputationPatchForRoute(routeId, routeConfig.initialReputation),
            routeChosenAt: new Date(),
            titleId: routeConfig.title_id,
            chronicleTitle: routeConfig.chronicle_title,
            endingSummary: routeConfig.ending_summary,
            displayAppearanceId: routeConfig.display_appearance_id,
          },
        });
        await tx.player.update({
          where: { playerId: player.playerId },
          data: { alignment: routeId },
        });
        const record = await tx.factionTransferRecord.create({
          data: {
            transferRecordId: `faction_choose_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            fromRoute: "undecided",
            toRoute: routeId,
            taskId: "choose_route",
            costSummary: {} as Prisma.InputJsonValue,
            reputationClearSummary: { initial_reputation: routeConfig.initialReputation },
            sectConflict: hasSectConflict(routeId, sect),
            previousSectAlignment: sect?.alignment ?? null,
            titleId: routeConfig.title_id,
            displayAppearanceId: routeConfig.display_appearance_id,
            configVersion: factionConfigVersion,
            rewardConfigVersion: factionRewardConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "choose_faction_route",
          targetType: "player_faction_state",
          targetId: player.playerId,
          afterSnapshot: toJson({
            route: routeId,
            title_id: routeConfig.title_id,
            sect_conflict: hasSectConflict(routeId, sect),
            record_id: record.transferRecordId,
          }),
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: record.transferRecordId,
          state: this.toStateSummary(nextState, context.player, sect),
          selected_route: toFactionRouteConfigState({ config: routeConfig }),
          experience: buildFactionExperience({
            title: "仙魔路线已定",
            summary: `你选择了${routeConfig.name}，获得${routeConfig.title_name}展示称号与纪元史册入口。`,
            state: this.toStateSummary(nextState, context.player, sect),
            tags: ["route_locked", "honor_reward", "sect_conflict_checked"],
          }),
        };
      },
    });
  }

  async transferRoute(input: {
    accountId: string;
    body: TransferFactionRouteRequest;
    idempotencyKey: string;
  }): Promise<TransferFactionRouteResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeTransferRequest(input.body);
    const routeConfig = getFactionRouteConfig(body.route_id);
    if (!routeConfig) {
      throw new BadRequestException("未知转道目标");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/factions/transfer",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const context = await this.ensureFactionState(player.playerId, tx);
        this.assertUnlocked(context.player);
        if (context.state.route === "undecided") {
          throw new BadRequestException("请先正式选择仙魔路线");
        }
        if (context.state.route === body.route_id) {
          throw new BadRequestException("已在该路线，无需转道");
        }
        if (routeConfig.transferTaskId !== body.task_id) {
          throw new BadRequestException("转道任务未完成或任务不匹配");
        }
        if (
          context.state.transferCooldownUntil &&
          context.state.transferCooldownUntil.getTime() > Date.now()
        ) {
          throw new BadRequestException("转道冷却中");
        }

        const cost = transferCostForCount(context.state.transferCount);
        await this.consumeSpiritStone(tx, player.playerId, cost, {
          sourceType: "faction_transfer",
          sourceId: body.route_id,
          idempotencyKey: `${input.idempotencyKey}:cost`,
        });
        const reputationClearSummary = buildReputationClearSummary(context.state, body.route_id);
        const sect = await this.getPlayerSect(tx, player.playerId);
        const cooldownUntil = new Date(
          Date.now() + factionTransferCooldownDays * 24 * 60 * 60 * 1000,
        );
        const nextState = await tx.playerFactionState.update({
          where: { playerId: player.playerId },
          data: {
            route: body.route_id,
            ...reputationTransferPatch(
              context.state,
              body.route_id,
              routeConfig.transferReputation,
            ),
            transferCooldownUntil: cooldownUntil,
            transferCount: { increment: 1 },
            titleId: routeConfig.title_id,
            chronicleTitle: routeConfig.chronicle_title,
            endingSummary: routeConfig.ending_summary,
            displayAppearanceId: routeConfig.display_appearance_id,
          },
        });
        await tx.player.update({
          where: { playerId: player.playerId },
          data: { alignment: body.route_id },
        });
        const record = await tx.factionTransferRecord.create({
          data: {
            transferRecordId: `faction_transfer_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            fromRoute: context.state.route,
            toRoute: body.route_id,
            taskId: body.task_id,
            costSummary: cost as unknown as Prisma.InputJsonValue,
            reputationClearSummary: reputationClearSummary as Prisma.InputJsonValue,
            sectConflict: hasSectConflict(body.route_id, sect),
            previousSectAlignment: sect?.alignment ?? null,
            titleId: routeConfig.title_id,
            displayAppearanceId: routeConfig.display_appearance_id,
            configVersion: factionConfigVersion,
            rewardConfigVersion: factionRewardConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "transfer_faction_route",
          targetType: "player_faction_state",
          targetId: player.playerId,
          afterSnapshot: toJson({
            from_route: context.state.route,
            to_route: body.route_id,
            cooldown_until: cooldownUntil.toISOString(),
            reputation_clear_summary: reputationClearSummary,
            sect_conflict: hasSectConflict(body.route_id, sect),
          }),
          idempotencyKey: input.idempotencyKey,
        });

        const state = this.toStateSummary(nextState, context.player, sect);
        const transferRecord = toFactionTransferRecordState(record);
        return {
          record_id: record.transferRecordId,
          state,
          transfer_record: transferRecord,
          wallet: await this.getWalletState(tx, player.playerId),
          experience: buildFactionExperience({
            title: "转道完成",
            summary: `已转入${routeConfig.name}，部分旧声望已清除，并进入 ${factionTransferCooldownDays} 天冷却。`,
            state,
            record: transferRecord,
            tags: ["transfer_cooldown", "reputation_cleared", "sect_conflict_checked"],
          }),
        };
      },
    });
  }

  private async ensureFactionState(playerId: string, tx: DbClient = this.prisma) {
    const player = (await tx.player.findUniqueOrThrow({
      where: { playerId },
      include: { progress: true },
    })) as PlayerWithProgress;
    const state = await tx.playerFactionState.upsert({
      where: { playerId },
      create: {
        playerId,
        eraId: defaultEraId,
        route: normalizeExistingAlignment(player.alignment),
        configVersion: factionConfigVersion,
        rewardConfigVersion: factionRewardConfigVersion,
      },
      update: {
        configVersion: factionConfigVersion,
        rewardConfigVersion: factionRewardConfigVersion,
      },
    });

    return { player, state };
  }

  private async buildStateSummary(playerId: string, tx: DbClient = this.prisma) {
    const [state, player, sect] = await Promise.all([
      tx.playerFactionState.findUniqueOrThrow({ where: { playerId } }),
      tx.player.findUniqueOrThrow({ where: { playerId }, include: { progress: true } }),
      this.getPlayerSect(tx, playerId),
    ]);

    return this.toStateSummary(state, player as PlayerWithProgress, sect);
  }

  private toStateSummary(
    state: PlayerFactionState,
    player: PlayerWithProgress,
    sect: Pick<Sect, "alignment"> | null,
  ): FactionStateSummary {
    return toFactionStateSummary({
      state,
      playerRealm: player.currentRealm,
      playerChapter: player.progress?.chapterId ?? 1,
      sect,
      unlockRealm: factionUnlockRealm,
      unlockChapter: factionUnlockChapter,
    });
  }

  private assertUnlocked(player: PlayerWithProgress) {
    const chapter = player.progress?.chapterId ?? 1;
    if (player.currentRealm < factionUnlockRealm && chapter < factionUnlockChapter) {
      throw new BadRequestException("仙魔路线需化神 / 神躯或第五章后开启");
    }
  }

  private async getRecentRecords(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<FactionTransferRecordState[]> {
    const records = await tx.factionTransferRecord.findMany({
      where: { playerId },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    return records.map(toFactionTransferRecordState);
  }

  private async getPlayerSect(
    tx: DbClient,
    playerId: string,
  ): Promise<Pick<Sect, "alignment"> | null> {
    const member = await tx.sectMember.findUnique({
      where: { playerId },
      include: { sect: { select: { alignment: true } } },
    });

    return member?.sect ?? null;
  }

  private async getWalletState(tx: DbClient, playerId: string): Promise<PlayerWalletState> {
    const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
    return {
      player_id: wallet.playerId,
      spirit_stone: wallet.spiritStone.toString(),
      immortal_stone: wallet.immortalStone.toString(),
      jade_paid: wallet.jadePaid.toString(),
      jade_bound: wallet.jadeBound.toString(),
      era_point: wallet.eraPoint.toString(),
    };
  }

  private async consumeSpiritStone(
    tx: Tx,
    playerId: string,
    cost: RewardBundle,
    source: { sourceType: string; sourceId?: string; idempotencyKey?: string },
  ) {
    const amount = BigInt(cost.spirit_stone ?? "0");
    if (amount <= 0n) {
      return;
    }
    const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
    if (wallet.spiritStone < amount) {
      throw new BadRequestException("灵石不足，无法转道");
    }
    await tx.playerWallet.update({
      where: { playerId },
      data: { spiritStone: { decrement: amount } },
    });
    await tx.walletLog.create({
      data: {
        logId: `wallet_${randomUUID()}`,
        playerId,
        currencyType: "spirit_stone",
        changeAmount: -amount,
        beforeAmount: wallet.spiritStone,
        afterAmount: wallet.spiritStone - amount,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        idempotencyKey: source.idempotencyKey,
      },
    });
  }

  private async requirePlayer(accountId: string): Promise<Player> {
    const player = await this.prisma.player.findUnique({ where: { accountId } });
    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
  }

  private async writeAudit(
    tx: Tx,
    input: {
      accountId: string;
      playerId: string;
      action: string;
      targetType: string;
      targetId: string;
      afterSnapshot: Prisma.InputJsonValue;
      idempotencyKey?: string;
    },
  ) {
    await tx.auditLog.create({
      data: {
        auditLogId: `audit_${randomUUID()}`,
        accountId: input.accountId,
        playerId: input.playerId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        afterSnapshot: input.afterSnapshot,
        idempotencyKey: input.idempotencyKey,
        configVersion: factionConfigVersion,
      },
    });
  }

  private async withIdempotency<TResponse>(input: {
    accountId: string;
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
        existingRecord.accountId !== input.accountId ||
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
          accountId: input.accountId,
          endpoint: input.endpoint,
          requestHash,
          responseData: response as unknown as Prisma.InputJsonValue,
          statusCode: 200,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      await writeJournalFromResponse(tx, {
        accountId: input.accountId,
        endpoint: input.endpoint,
        response,
        idempotencyKey: input.idempotencyKey,
      });

      return response;
    });
  }
}

function normalizeRouteId(routeId: unknown): "immortal" | "demon" | "wanderer" {
  const normalized = typeof routeId === "string" ? routeId.trim() : "";
  if (!isFactionRouteId(normalized)) {
    throw new BadRequestException("请选择有效仙魔路线");
  }

  return normalized;
}

function normalizeTransferRequest(body: TransferFactionRouteRequest): {
  route_id: "immortal" | "demon" | "wanderer";
  task_id: string;
} {
  const routeId = normalizeRouteId(body?.route_id);
  const taskId = body?.task_id?.trim();
  if (!taskId) {
    throw new BadRequestException("请完成转道任务");
  }

  return { route_id: routeId, task_id: taskId };
}

function normalizeExistingAlignment(
  alignment: string,
): "undecided" | "immortal" | "demon" | "wanderer" {
  if (alignment === "immortal" || alignment === "demon" || alignment === "wanderer") {
    return alignment;
  }
  if (alignment === "neutral") {
    return "wanderer";
  }

  return "undecided";
}

function reputationPatchForRoute(routeId: string, value: number) {
  if (routeId === "immortal") {
    return { reputationImmortal: value };
  }
  if (routeId === "demon") {
    return { reputationDemon: value };
  }

  return { reputationWanderer: value };
}

function reputationTransferPatch(
  state: PlayerFactionState,
  targetRoute: string,
  targetReputation: number,
) {
  const keptRate = (100 - factionTransferReputationClearRate) / 100;
  const next = {
    reputationImmortal: Math.floor(state.reputationImmortal * keptRate),
    reputationDemon: Math.floor(state.reputationDemon * keptRate),
    reputationWanderer: Math.floor(state.reputationWanderer * keptRate),
  };
  if (targetRoute === "immortal") {
    next.reputationImmortal = Math.max(state.reputationImmortal, targetReputation);
  } else if (targetRoute === "demon") {
    next.reputationDemon = Math.max(state.reputationDemon, targetReputation);
  } else {
    next.reputationWanderer = Math.max(state.reputationWanderer, targetReputation);
  }

  return next;
}

function buildReputationClearSummary(state: PlayerFactionState, targetRoute: string) {
  const next = reputationTransferPatch(state, targetRoute, 0);
  return {
    clear_rate: factionTransferReputationClearRate,
    before: {
      immortal: state.reputationImmortal,
      demon: state.reputationDemon,
      wanderer: state.reputationWanderer,
    },
    after: {
      immortal: next.reputationImmortal,
      demon: next.reputationDemon,
      wanderer: next.reputationWanderer,
    },
  };
}

function transferCostForCount(transferCount: number): RewardBundle {
  const base = BigInt(factionTransferBaseCost.spirit_stone ?? "0");
  return { spirit_stone: String(base + BigInt(transferCount) * 250n) };
}

function hasSectConflict(routeId: string, sect: Pick<Sect, "alignment"> | null): boolean {
  const expected = factionToSectAlignment(routeId);
  return Boolean(expected && sect?.alignment && expected !== sect.alignment);
}

function buildFactionExperience(input: {
  title: string;
  summary: string;
  state: FactionStateSummary;
  record?: FactionTransferRecordState;
  tags: string[];
}): ExperiencePayload {
  return {
    title: input.title,
    summary: input.summary,
    timeline: [
      {
        step: 1,
        title: "路线结算",
        description: "仙魔 / 散修路线由服务端根据境界、章节、冷却和幂等键结算。",
        tone: "neutral",
      },
      {
        step: 2,
        title: "边界校验",
        description: "路线奖励只发放荣誉、展示外观和纪元记录，不发唯一战力道具。",
        tone: "success",
      },
      {
        step: 3,
        title: "宗门立场",
        description: input.state.sect_conflict
          ? "当前个人路线与宗门立场冲突，阵营集结会被限制。"
          : "当前个人路线与宗门立场无冲突。",
        tone: input.state.sect_conflict ? "warning" : "success",
      },
    ],
    delta_summary: [
      { label: "路线", after: input.state.route_name, tone: "neutral" },
      { label: "称号", after: input.state.title_name ?? "未定", tone: "success" },
      input.record
        ? { label: "转道冷却", after: input.state.transfer_cooldown_until ?? "无", tone: "warning" }
        : { label: "史册", after: input.state.chronicle_title ?? "未定", tone: "neutral" },
    ],
    next_recommendations: [
      {
        label: "查看阵营",
        reason: "阵营声望、宗门立场和纪元史册会影响后续章节展示。",
        action_hint: "faction",
        priority: "medium",
      },
    ],
    reason_tags: input.tags.map((tag) => ({
      code: tag,
      label: factionTagLabel(tag),
      description: factionTagDescription(tag),
      tone: tag === "sect_conflict_checked" && input.state.sect_conflict ? "warning" : "neutral",
    })),
  };
}

function factionTagLabel(tag: string): string {
  const labels: Record<string, string> = {
    route_locked: "路线锁定",
    honor_reward: "荣誉奖励",
    sect_conflict_checked: "宗门校验",
    transfer_cooldown: "转道冷却",
    reputation_cleared: "声望清除",
  };
  return labels[tag] ?? tag;
}

function factionTagDescription(tag: string): string {
  const descriptions: Record<string, string> = {
    route_locked: "化神 / 神躯后正式锁定成仙、成魔或散修路线。",
    honor_reward: "奖励以称号、展示外观和纪元纪念为主，不提供唯一战力道具。",
    sect_conflict_checked: "个人路线与宗门立场冲突时，不能参与该宗门阵营集结。",
    transfer_cooldown: `转道后进入 ${factionTransferCooldownDays} 天冷却，避免活动前反复套利。`,
    reputation_cleared: "转道会清除部分旧路线声望，保留新路线基础参与价值。",
  };
  return descriptions[tag] ?? tag;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
