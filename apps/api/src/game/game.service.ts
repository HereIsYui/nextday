import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ActionState,
  BattleRoundLog,
  BattleSummary,
  BreakthroughResponse,
  CaveCollectResponse,
  CultivationClaimResponse,
  CultivationRoute,
  CultivationStatus,
  ExploreClaimRequest,
  ExploreCurrentResponse,
  ExploreEventListResponse,
  ExploreEventState,
  ExploreRequest,
  ExploreResponse,
  GameOverviewResponse,
  JournalListResponse,
  NewPlayerRouteState,
  NewPlayerRouteStepState,
  PlayerProfileResponse,
  ProvinceSummary,
  ResolveExploreEventRequest,
  ResolveExploreEventResponse,
  RewardBundle,
  TaskClaimResponse,
  TaskState,
  TaskSummaryResponse,
} from "@nextday/shared";
import type {
  ExploreActionRecord,
  ExploreEventRecord,
  Player,
  PlayerActionState,
  PlayerCaveState,
  PlayerProgress,
  PlayerSkillLoadout,
  PlayerWallet,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { buildJournalExperience, writeJournalFromResponse } from "../journal/journal.utils";
import { buildCaveCollectExperience, buildExploreExperience } from "../platform/experience";
import { hashRequestBody } from "../platform/utils/hash";
import { toPlayerProfileResponse } from "../player/player.mapper";
import { getDefaultSkillLoadout, getSkillName } from "../production/production.constants";
import {
  type ExploreEventChoiceConfig,
  type ExploreEventConfig,
  defaultEraId,
  exploreEventConfigs,
  maxExploreBatch,
  maxOfflineCultivationHours,
  provinceConfigs,
  provinceExploreSeconds,
  selectExploreEnemy,
} from "./game.constants";
import {
  getCaveReward,
  normalizeRewardBundle,
  toActionState,
  toBattleSummary,
  toCaveState,
  toProvinceSummary,
  toTaskState,
} from "./game.mappers";
import { ensureInitialPlayerTasks, incrementPlayerTasks } from "./task-progress.utils";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type PlayerWithCore = Player & { progress: PlayerProgress; wallet: PlayerWallet };

@Injectable()
export class GameService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getOverview(accountId: string): Promise<GameOverviewResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    const [profile, cultivation, actionState, provinces, tasks, cave, recentBattles] =
      await Promise.all([
        this.getProfileByPlayerId(player.playerId),
        this.getCultivationStatus(player.playerId),
        this.refreshActionState(player.playerId),
        this.getProvinceSummaries(player.playerId),
        this.getTasksByPlayerId(player.playerId),
        this.getCaveByPlayerId(player.playerId),
        this.prisma.battleLog.findMany({
          where: { playerId: player.playerId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);
    const newPlayerRoute = await this.buildNewPlayerRoute(player.playerId, {
      actionState,
      provinces,
      tasks,
    });

    return {
      profile,
      cultivation,
      action_state: actionState,
      provinces,
      tasks,
      cave,
      recent_battles: recentBattles.map((battle) => toBattleSummary(battle)),
      new_player_route: newPlayerRoute,
    };
  }

  async getProvinces(accountId: string): Promise<{ provinces: ProvinceSummary[] }> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    return { provinces: await this.getProvinceSummaries(player.playerId) };
  }

  async getJournal(
    accountId: string,
    input: { limit?: string; before?: string },
  ): Promise<JournalListResponse> {
    const player = await this.requirePlayer(accountId);
    const limit = normalizeListLimit(input.limit, 8, 20);
    const before = normalizeBeforeCursor(input.before);
    const entries = await this.prisma.playerJournalEntry.findMany({
      where: {
        playerId: player.playerId,
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });
    const visibleEntries = entries.slice(0, limit);

    return {
      entries: visibleEntries.map((entry) => ({
        journal_entry_id: entry.journalEntryId,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
        title: entry.title,
        summary: entry.summary,
        delta_summary: stringArrayFromJson(entry.deltaSummary),
        tags: stringArrayFromJson(entry.tags),
        recommendations: stringArrayFromJson(entry.recommendations),
        experience:
          entry.experienceSnapshot && typeof entry.experienceSnapshot === "object"
            ? (entry.experienceSnapshot as unknown as JournalListResponse["entries"][number]["experience"])
            : undefined,
        config_version: entry.configVersion,
        created_at: entry.createdAt.toISOString(),
      })),
      next_cursor:
        entries.length > limit ? (visibleEntries.at(-1)?.createdAt.toISOString() ?? null) : null,
    };
  }

  async getExploreEvents(
    accountId: string,
    input: { status?: string; limit?: string },
  ): Promise<ExploreEventListResponse> {
    const player = await this.requirePlayer(accountId);
    const status = normalizeExploreEventStatusFilter(input.status);
    const limit = normalizeListLimit(input.limit, 10, 20);
    const events = await this.prisma.exploreEventRecord.findMany({
      where: {
        playerId: player.playerId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return { events: events.map(toExploreEventState) };
  }

  async claimCultivation(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<CultivationClaimResponse> {
    const player = await this.requirePlayer(input.accountId);
    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/cultivation/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: {},
      handler: async (tx) => {
        await this.ensureM2State(player.playerId, tx);
        const loaded = await this.requirePlayerInTx(tx, player.playerId);
        const beforeLevel = loaded.currentLevel;
        const gainedCultivation = calculateClaimableCultivation(loaded.progress);
        const totalCultivation = loaded.progress.cultivationValue + gainedCultivation;
        const leveled = applyAutoLevel(loaded, totalCultivation);
        const updatedPlayer =
          leveled.afterLevel === loaded.currentLevel
            ? loaded
            : await tx.player.update({
                where: { playerId: loaded.playerId },
                data: { currentLevel: leveled.afterLevel },
                include: { progress: true, wallet: true },
              });
        const updatedProgress = await tx.playerProgress.update({
          where: { playerId: loaded.playerId },
          data: {
            cultivationValue: leveled.remainingCultivation,
            lastCultivationAt: new Date(),
            dailyActiveScore: { increment: 5 },
            weeklyActiveScore: { increment: 5 },
          },
        });
        const completedTaskIds = await incrementPlayerTasks(tx, loaded.playerId, {
          novice_claim_cultivation: 1,
        });
        const status = toCultivationStatus({
          player: updatedPlayer,
          progress: updatedProgress,
        });
        const response: CultivationClaimResponse = {
          record_id: `cultivation_claim_${randomUUID()}`,
          gained_cultivation: gainedCultivation.toString(),
          before_level: beforeLevel,
          after_level: leveled.afterLevel,
          status,
          completed_task_ids: completedTaskIds,
          experience: buildJournalExperience({
            title: "收束修为",
            summary:
              leveled.afterLevel > beforeLevel
                ? `静坐收益入体，修为 +${gainedCultivation.toString()}，层级提升至第 ${leveled.afterLevel} 层。`
                : `静坐收益入体，修为 +${gainedCultivation.toString()}。`,
            deltas: [
              {
                label: "修为",
                delta: `+${gainedCultivation.toString()}`,
                tone: "success",
              },
              {
                label: "层级",
                before: beforeLevel,
                after: leveled.afterLevel,
                tone: leveled.afterLevel > beforeLevel ? "success" : "neutral",
              },
            ],
            recommendations: [
              {
                label: status.can_breakthrough ? "准备突破" : "继续探索",
                reason: status.can_breakthrough
                  ? "当前境界已经圆满，可以尝试突破。"
                  : "继续探索、服丹或照看洞府，补足下一层修为。",
                priority: status.can_breakthrough ? "high" : "medium",
              },
            ],
            tags: [{ code: "cultivation_gain", label: "修为成长", tone: "success" }],
          }),
        };

        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: loaded.playerId,
          action: "cultivation_claim",
          targetType: "player_progress",
          targetId: loaded.playerId,
          afterSnapshot: response as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return response;
      },
    });
  }

  async breakthrough(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<BreakthroughResponse> {
    const player = await this.requirePlayer(input.accountId);
    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/cultivation/breakthrough",
      idempotencyKey: input.idempotencyKey,
      requestBody: {},
      handler: async (tx) => {
        await this.ensureM2State(player.playerId, tx);
        const loaded = await this.requirePlayerInTx(tx, player.playerId);
        const requirement = BigInt(600);
        const canBreakthrough =
          loaded.currentLevel >= 9 && loaded.progress.cultivationValue >= requirement;

        if (!canBreakthrough) {
          return {
            record_id: `breakthrough_${randomUUID()}`,
            success: false,
            message: "境界尚未圆满，暂不可突破",
            profile: toPlayerProfileResponse({
              player: loaded,
              progress: loaded.progress,
              wallet: loaded.wallet,
            }),
          };
        }

        await tx.player.update({
          where: { playerId: loaded.playerId },
          data: {
            currentRealm: { increment: 1 },
            currentLevel: 1,
          },
        });
        await tx.playerProgress.update({
          where: { playerId: loaded.playerId },
          data: {
            cultivationValue: loaded.progress.cultivationValue - requirement,
            breakthroughFailCount: 0,
          },
        });
        const profile = await this.getProfileByPlayerId(loaded.playerId, tx);
        const afterRealm = loaded.currentRealm + 1;
        const response: BreakthroughResponse = {
          record_id: `breakthrough_${randomUUID()}`,
          success: true,
          message: "突破成功",
          profile,
          experience: buildJournalExperience({
            title: "境界突破",
            summary: `灵机贯通，境界提升至第 ${afterRealm} 境。`,
            deltas: [
              {
                label: "境界",
                before: loaded.currentRealm,
                after: afterRealm,
                tone: "success",
              },
            ],
            recommendations: [
              {
                label: "稳固境界",
                reason: "先领取任务奖励，再继续探索新的成长材料。",
                priority: "high",
              },
            ],
            tags: [{ code: "breakthrough_success", label: "境界突破", tone: "success" }],
          }),
        };

        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: loaded.playerId,
          action: "cultivation_breakthrough",
          targetType: "player",
          targetId: loaded.playerId,
          afterSnapshot: response as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return response;
      },
    });
  }

  async explore(input: {
    accountId: string;
    body: ExploreRequest;
    idempotencyKey: string;
  }): Promise<ExploreResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeExploreRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/explore",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.ensureM2State(player.playerId, tx);
        const loaded = await this.requirePlayerInTx(tx, player.playerId);
        const province = await this.getProvinceForPlayer(tx, loaded.playerId, body.province_id);

        if (!province.unlocked) {
          throw new BadRequestException("该州尚未开放");
        }

        const activeRecord = await this.findActiveExploreRecord(tx, loaded.playerId);
        if (activeRecord) {
          const refreshedRecord = await this.refreshExploreRecordStatus(tx, activeRecord);
          throw new BadRequestException(
            refreshedRecord.status === "completed" ? "已有探索完成待领取" : "已有探索正在进行",
          );
        }

        const actionState = await this.refreshActionState(loaded.playerId, tx);
        if (actionState.action_points < body.count) {
          throw new BadRequestException("行动令不足");
        }

        const afterActionState = await tx.playerActionState.update({
          where: { playerId: loaded.playerId },
          data: { actionPoints: actionState.action_points - body.count },
        });
        const startedAt = new Date();
        const secondsPerExplore = provinceExploreSeconds[province.province_id] ?? 30;
        const totalSeconds = secondsPerExplore * body.count;
        const record = await tx.exploreActionRecord.create({
          data: {
            recordId: `explore_${randomUUID()}`,
            playerId: loaded.playerId,
            eraId: defaultEraId,
            provinceId: province.province_id,
            provinceName: province.name,
            count: body.count,
            secondsPerExplore,
            totalSeconds,
            status: "pending",
            startedAt,
            completesAt: new Date(startedAt.getTime() + totalSeconds * 1000),
            actionStateSnapshot: toActionState(
              afterActionState,
            ) as unknown as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
            configVersion: "m2_core_loop_v2",
            rulesetVersion: "ruleset_p1_6_v1",
            rewardConfigVersion: "reward_p1_6_v1",
          },
        });
        const response = toExploreResponse(record, toActionState(afterActionState));

        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: loaded.playerId,
          action: "explore_start",
          targetType: "province",
          targetId: province.province_id,
          afterSnapshot: response as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return response;
      },
    });
  }

  async getCurrentExplore(accountId: string): Promise<ExploreCurrentResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    const actionState = await this.refreshActionState(player.playerId);
    const activeRecord = await this.findActiveExploreRecord(this.prisma, player.playerId);
    if (activeRecord) {
      const refreshedRecord = await this.refreshExploreRecordStatus(this.prisma, activeRecord);
      return { current: toExploreResponse(refreshedRecord, actionState) };
    }

    const latestRecord = await this.prisma.exploreActionRecord.findFirst({
      where: { playerId: player.playerId },
      orderBy: { createdAt: "desc" },
    });

    return {
      current: latestRecord ? toExploreResponse(latestRecord, actionState) : null,
    };
  }

  async claimExplore(input: {
    accountId: string;
    body: ExploreClaimRequest;
    idempotencyKey: string;
  }): Promise<ExploreResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeExploreClaimRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/explore/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.ensureM2State(player.playerId, tx);
        const loaded = await this.requirePlayerInTx(tx, player.playerId);
        const selectedRecord = body.record_id
          ? await tx.exploreActionRecord.findUnique({
              where: { recordId: body.record_id },
            })
          : await this.findActiveExploreRecord(tx, loaded.playerId);

        if (!selectedRecord || selectedRecord.playerId !== loaded.playerId) {
          throw new BadRequestException("暂无可领取探索");
        }

        const record = await this.refreshExploreRecordStatus(tx, selectedRecord);
        if (record.status === "claimed") {
          throw new BadRequestException("探索奖励已领取");
        }

        if (record.completesAt.getTime() > Date.now()) {
          throw new BadRequestException("探索尚未完成");
        }

        const province = await this.getProvinceForPlayer(tx, loaded.playerId, record.provinceId);
        const actionState = await this.refreshActionState(loaded.playerId, tx);
        const battles: BattleSummary[] = [];
        const rewardTotal: RewardBundle = { cultivation: "0", spirit_stone: "0", items: [] };
        let currentPlayer = loaded;
        let currentProgress = loaded.progress;

        for (let index = 0; index < record.count; index += 1) {
          const battle = await this.resolveExploreBattle(
            tx,
            currentPlayer,
            currentProgress,
            province,
            record.recordId,
            index,
          );
          battles.push(battle.summary);
          currentPlayer = battle.player;
          currentProgress = battle.progress;
          mergeRewards(rewardTotal, battle.summary.rewards);
        }

        await tx.playerProvinceProgress.update({
          where: {
            playerId_provinceId: {
              playerId: loaded.playerId,
              provinceId: province.province_id,
            },
          },
          data: {
            explorationCount: { increment: record.count },
            bestExploreStage: { increment: record.count },
            lastActionAt: new Date(),
          },
        });
        const completedTaskIds = await incrementPlayerTasks(tx, loaded.playerId, {
          novice_explore_ji: province.province_id === "ji" ? record.count : 0,
          daily_explore: record.count,
          weekly_explore_10: record.count,
        });
        const experience = buildExploreExperience({
          provinceName: province.name,
          count: record.count,
          battles,
          rewards: rewardTotal,
          actionPointsAfter: actionState.action_points,
          completedTaskCount: completedTaskIds.length,
        });
        const updatedRecord = await tx.exploreActionRecord.update({
          where: { recordId: record.recordId },
          data: {
            status: "claimed",
            claimedAt: new Date(),
            rewardSnapshot: rewardTotal as unknown as Prisma.InputJsonValue,
            battleSnapshot: battles as unknown as Prisma.InputJsonValue,
            completedTaskIds: completedTaskIds as unknown as Prisma.InputJsonValue,
            experienceSnapshot: experience as unknown as Prisma.InputJsonValue,
            actionStateSnapshot: actionState as unknown as Prisma.InputJsonValue,
          },
        });
        const event = await this.createExploreEvent(tx, {
          playerId: loaded.playerId,
          province,
          record: updatedRecord,
        });
        const response = toExploreResponse(updatedRecord, actionState, event);

        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: loaded.playerId,
          action: "explore_claim",
          targetType: "explore_action",
          targetId: record.recordId,
          afterSnapshot: response as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return response;
      },
    });
  }

  async resolveExploreEvent(input: {
    accountId: string;
    body: ResolveExploreEventRequest;
    idempotencyKey: string;
  }): Promise<ResolveExploreEventResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeResolveExploreEventRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/explore/events/resolve",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const event = await tx.exploreEventRecord.findFirst({
          where: { eventId: body.event_id, playerId: player.playerId },
        });
        if (!event) {
          throw new BadRequestException("探索奇遇不存在");
        }
        if (event.status !== "pending") {
          throw new BadRequestException("探索奇遇已处理");
        }

        const choices = exploreEventChoiceConfigsFromJson(event.choices);
        const choice = choices.find((item) => item.choiceId === body.choice_id);
        if (!choice) {
          throw new BadRequestException("探索奇遇选择不存在");
        }

        await this.applyReward(tx, player.playerId, choice.rewards, {
          sourceType: "explore_event",
          sourceId: event.eventId,
          idempotencyKey: input.idempotencyKey,
        });
        const completedTaskIds = await incrementPlayerTasks(tx, player.playerId, {
          novice_resolve_event: 1,
        });
        const experience = buildExploreEventExperience(event, choice);
        const updatedEvent = await tx.exploreEventRecord.update({
          where: { eventId: event.eventId },
          data: {
            status: "resolved",
            selectedChoiceId: choice.choiceId,
            rewardSnapshot: choice.rewards as unknown as Prisma.InputJsonValue,
            experienceSnapshot: experience as unknown as Prisma.InputJsonValue,
            resolvedIdempotency: input.idempotencyKey,
            resolvedAt: new Date(),
          },
        });
        const response: ResolveExploreEventResponse = {
          event: toExploreEventState(updatedEvent),
          rewards: choice.rewards,
          experience,
        };
        response.experience.delta_summary.push(
          ...completedTaskIds.map((taskId) => ({
            label: "主线推进",
            delta: taskTitleForProgress(taskId),
            tone: "success" as const,
          })),
        );

        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "explore_event_resolve",
          targetType: "explore_event",
          targetId: event.eventId,
          afterSnapshot: response as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return response;
      },
    });
  }

  async getTasks(accountId: string): Promise<TaskSummaryResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    return { tasks: await this.getTasksByPlayerId(player.playerId) };
  }

  async claimTask(input: {
    accountId: string;
    taskId: string;
    idempotencyKey: string;
  }): Promise<TaskClaimResponse> {
    const player = await this.requirePlayer(input.accountId);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/tasks/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: { task_id: input.taskId },
      handler: async (tx) => {
        await this.ensureM2State(player.playerId, tx);
        const task = await tx.playerTaskState.findFirst({
          where: { playerId: player.playerId, taskId: input.taskId, status: "completed" },
          orderBy: { updatedAt: "desc" },
        });

        if (!task) {
          throw new BadRequestException("任务未完成或已领取");
        }

        const rewards = normalizeRewardBundle(task.rewardSnapshot);
        await this.applyReward(tx, player.playerId, rewards, {
          sourceType: "task_claim",
          sourceId: task.taskId,
          idempotencyKey: input.idempotencyKey,
        });
        const claimedTask = await tx.playerTaskState.update({
          where: { taskStateId: task.taskStateId },
          data: { status: "claimed" },
        });
        const profile = await this.getProfileByPlayerId(player.playerId, tx);
        if (!profile.wallet) {
          throw new BadRequestException("玩家钱包数据不完整");
        }
        const actionState = await this.refreshActionState(player.playerId, tx);

        return {
          record_id: `task_claim_${randomUUID()}`,
          task: toTaskState(claimedTask),
          rewards,
          wallet: profile.wallet,
          action_state: actionState,
        };
      },
    });
  }

  async collectCave(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<CaveCollectResponse> {
    const player = await this.requirePlayer(input.accountId);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/cave/collect",
      idempotencyKey: input.idempotencyKey,
      requestBody: {},
      handler: async (tx) => {
        await this.ensureM2State(player.playerId, tx);
        const cave = await tx.playerCaveState.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        const caveState = toCaveState(cave);
        const rewards = caveState.preview_rewards;

        await this.applyReward(tx, player.playerId, rewards, {
          sourceType: "cave_collect",
          sourceId: player.playerId,
          idempotencyKey: input.idempotencyKey,
        });
        const updatedCave = await tx.playerCaveState.update({
          where: { playerId: player.playerId },
          data: { lastCollectedAt: new Date() },
        });
        await tx.caveCollectRecord.create({
          data: {
            recordId: `cave_collect_${randomUUID()}`,
            playerId: player.playerId,
            spiritStone: BigInt(rewards.spirit_stone ?? "0"),
            herbCount: rewards.items?.find((item) => item.item_id === "low_herb")?.count ?? 0,
            oreCount: rewards.items?.find((item) => item.item_id === "raw_iron")?.count ?? 0,
            collectedMinutes: caveState.claimable_minutes,
            rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
          },
        });
        const completedTaskIds = await incrementPlayerTasks(tx, player.playerId, {
          daily_cave_collect: 1,
        });

        const response: CaveCollectResponse = {
          record_id: `cave_collect_${randomUUID()}`,
          cave: toCaveState(updatedCave),
          rewards,
          wallet: await this.getWalletState(player.playerId, tx),
          completed_task_ids: completedTaskIds,
          experience: buildCaveCollectExperience({
            collectedMinutes: caveState.claimable_minutes,
            cave: toCaveState(updatedCave),
            rewards,
          }),
        };

        return response;
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

  private async requirePlayerInTx(tx: DbClient, playerId: string): Promise<PlayerWithCore> {
    const player = await tx.player.findUnique({
      where: { playerId },
      include: { progress: true, wallet: true },
    });

    if (!player?.progress || !player.wallet) {
      throw new BadRequestException("角色基础数据不完整");
    }

    return player as PlayerWithCore;
  }

  private async ensureM2State(playerId: string, tx: DbClient = this.prisma) {
    const now = new Date();
    await this.ensureProvinceStates(tx);
    await tx.playerActionState.upsert({
      where: { playerId },
      create: { playerId, eraId: defaultEraId },
      update: {},
    });
    await tx.playerCaveState.upsert({
      where: { playerId },
      create: { playerId, lastCollectedAt: new Date(now.getTime() - 30 * 60 * 1000) },
      update: {},
    });

    for (const province of provinceConfigs) {
      await tx.playerProvinceProgress.upsert({
        where: { playerId_provinceId: { playerId, provinceId: province.provinceId } },
        create: {
          provinceProgressId: `province_progress_${randomUUID()}`,
          playerId,
          eraId: defaultEraId,
          provinceId: province.provinceId,
          unlocked: province.chapterRequired === 1,
        },
        update: {},
      });
    }

    await ensureInitialPlayerTasks(tx, playerId);
  }

  private async ensureProvinceStates(tx: DbClient = this.prisma) {
    for (const province of provinceConfigs) {
      await tx.provinceState.upsert({
        where: {
          eraId_provinceId: {
            eraId: defaultEraId,
            provinceId: province.provinceId,
          },
        },
        create: {
          provinceStateId: `province_state_${randomUUID()}`,
          eraId: defaultEraId,
          provinceId: province.provinceId,
          name: province.name,
          towerName: province.towerName,
          chapterRequired: province.chapterRequired,
          unlocked: province.chapterRequired === 1,
          factionControl: { immortal: 0, demon: 0, neutral: 100 },
        },
        update: {
          name: province.name,
          towerName: province.towerName,
          chapterRequired: province.chapterRequired,
        },
      });
    }
  }

  private async getProfileByPlayerId(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<PlayerProfileResponse> {
    const player = await tx.player.findUnique({
      where: { playerId },
      include: { progress: true, wallet: true },
    });

    return toPlayerProfileResponse({
      player,
      progress: player?.progress ?? null,
      wallet: player?.wallet ?? null,
    });
  }

  private async getCultivationStatus(playerId: string): Promise<CultivationStatus> {
    const player = await this.requirePlayerInTx(this.prisma, playerId);
    return toCultivationStatus({ player, progress: player.progress });
  }

  private async refreshActionState(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<ActionState> {
    const state = await tx.playerActionState.findUniqueOrThrow({ where: { playerId } });
    const recoveredPoints = calculateRecoveredActionPoints(state);

    if (recoveredPoints === state.actionPoints) {
      return toActionState(state);
    }

    const updated = await tx.playerActionState.update({
      where: { playerId },
      data: {
        actionPoints: recoveredPoints,
        lastRecoveredAt: new Date(),
      },
    });

    return toActionState(updated);
  }

  private async findActiveExploreRecord(
    tx: DbClient,
    playerId: string,
  ): Promise<ExploreActionRecord | null> {
    return tx.exploreActionRecord.findFirst({
      where: {
        playerId,
        claimedAt: null,
        status: { in: ["pending", "completed"] },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async refreshExploreRecordStatus(
    tx: DbClient,
    record: ExploreActionRecord,
  ): Promise<ExploreActionRecord> {
    if (record.status !== "pending" || record.completesAt.getTime() > Date.now()) {
      return record;
    }

    return tx.exploreActionRecord.update({
      where: { recordId: record.recordId },
      data: { status: "completed" },
    });
  }

  private async getProvinceSummaries(playerId: string): Promise<ProvinceSummary[]> {
    const player = await this.prisma.player.findUniqueOrThrow({
      where: { playerId },
      include: { progress: true },
    });
    const states = await this.prisma.provinceState.findMany({
      where: { eraId: defaultEraId },
      orderBy: { chapterRequired: "asc" },
    });
    const progressList = await this.prisma.playerProvinceProgress.findMany({
      where: { playerId },
    });

    return sortProvincesByConfig(states).map((state) => {
      const progress = progressList.find((item) => item.provinceId === state.provinceId);
      if (!progress) {
        throw new Error("玩家州进度缺失");
      }

      return toProvinceSummary({
        state,
        progress,
        playerChapter: player.progress?.chapterId ?? 1,
      });
    });
  }

  private async getProvinceForPlayer(tx: Tx, playerId: string, provinceId: string) {
    const player = await tx.player.findUniqueOrThrow({
      where: { playerId },
      include: { progress: true },
    });
    const state = await tx.provinceState.findUnique({
      where: { eraId_provinceId: { eraId: defaultEraId, provinceId } },
    });
    const progress = await tx.playerProvinceProgress.findUnique({
      where: { playerId_provinceId: { playerId, provinceId } },
    });

    if (!state || !progress) {
      throw new BadRequestException("未知州域");
    }

    return toProvinceSummary({
      state,
      progress,
      playerChapter: player.progress?.chapterId ?? 1,
    });
  }

  private async getTasksByPlayerId(playerId: string): Promise<TaskState[]> {
    await this.ensureM2State(playerId);
    const tasks = await this.prisma.playerTaskState.findMany({
      where: { playerId },
      orderBy: [{ taskType: "asc" }, { createdAt: "asc" }],
    });

    return tasks.map((task) => toTaskState(task));
  }

  private async getCaveByPlayerId(playerId: string): Promise<ReturnType<typeof toCaveState>> {
    const cave = await this.prisma.playerCaveState.findUniqueOrThrow({ where: { playerId } });
    return toCaveState(cave);
  }

  private async getWalletState(playerId: string, tx: DbClient = this.prisma) {
    const profile = await this.getProfileByPlayerId(playerId, tx);
    if (!profile.wallet) {
      throw new BadRequestException("玩家钱包数据不完整");
    }

    return profile.wallet;
  }

  private async resolveExploreBattle(
    tx: Tx,
    player: PlayerWithCore,
    progress: PlayerProgress,
    province: ProvinceSummary,
    exploreRecordId: string,
    battleIndex: number,
  ): Promise<{
    summary: BattleSummary;
    player: PlayerWithCore;
    progress: PlayerProgress;
  }> {
    const config = provinceConfigs.find((item) => item.provinceId === province.province_id);
    if (!config) {
      throw new BadRequestException("未知探索目标");
    }
    const enemy = selectExploreEnemy(province.province_id, exploreRecordId, battleIndex) ?? {
      enemyId: config.enemyId,
      enemyName: config.enemyName,
      enemyPower: config.enemyPower,
      flavor: config.theme,
      provinceId: config.provinceId,
      skillName: "山海妖息",
    };

    const playerPower = player.currentRealm * 120 + player.currentLevel * 45;
    const result: BattleSummary["result"] = playerPower >= enemy.enemyPower ? "win" : "lose";
    const damageDone = result === "win" ? enemy.enemyPower + player.currentLevel * 12 : playerPower;
    const damageTaken =
      result === "win" ? Math.max(8, Math.floor(enemy.enemyPower / 3)) : enemy.enemyPower;
    const rewards: RewardBundle =
      result === "win"
        ? {
            cultivation: "40",
            spirit_stone: "35",
            items: [{ item_id: "low_herb", name: "凝露草", count: 1, bind_type: "bound" }],
          }
        : { cultivation: "10", spirit_stone: "8" };
    const totalCultivation = progress.cultivationValue + BigInt(rewards.cultivation ?? "0");
    const leveled = applyAutoLevel(player, totalCultivation);
    if (leveled.afterLevel !== player.currentLevel) {
      await tx.player.update({
        where: { playerId: player.playerId },
        data: { currentLevel: leveled.afterLevel },
      });
    }
    const updatedProgress = await tx.playerProgress.update({
      where: { playerId: player.playerId },
      data: {
        cultivationValue: leveled.remainingCultivation,
        dailyActiveScore: { increment: 3 },
        weeklyActiveScore: { increment: 3 },
      },
    });

    await this.applyReward(
      tx,
      player.playerId,
      { ...rewards, cultivation: undefined },
      {
        sourceType: "explore",
        sourceId: province.province_id,
      },
    );

    const loadout = await tx.playerSkillLoadout.findUnique({
      where: { playerId: player.playerId },
    });
    const skillNames = getCombatSkillNames(player.route, loadout);
    const battleLog: BattleRoundLog[] = createBattleRoundLog({
      playerName: player.name,
      enemyName: enemy.enemyName,
      damageDone,
      damageTaken,
      result,
      activeSkillName: skillNames.activeSkillName,
      enemySkillName: enemy.skillName,
      treasureSkillName: skillNames.treasureSkillName,
    });
    const battle = await tx.battleLog.create({
      data: {
        battleId: `battle_${randomUUID()}`,
        playerId: player.playerId,
        eraId: defaultEraId,
        battleType: "explore",
        provinceId: province.province_id,
        enemyId: enemy.enemyId,
        enemyName: enemy.enemyName,
        result,
        rounds: battleLog.length,
        damageDone,
        damageTaken,
        rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
        battleLog: battleLog as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      summary: toBattleSummary(battle),
      player: {
        ...player,
        currentLevel: leveled.afterLevel,
        progress: updatedProgress,
      },
      progress: updatedProgress,
    };
  }

  private async buildNewPlayerRoute(
    playerId: string,
    input: {
      actionState: ActionState;
      provinces: ProvinceSummary[];
      tasks: TaskState[];
    },
  ): Promise<NewPlayerRouteState> {
    const jiProvince = input.provinces.find((province) => province.province_id === "ji");
    const [pendingEventCount, resolvedEventCount, alchemyCount, forgeCount, towerActionCount] =
      await Promise.all([
        this.prisma.exploreEventRecord.count({ where: { playerId, status: "pending" } }),
        this.prisma.exploreEventRecord.count({ where: { playerId, status: "resolved" } }),
        this.prisma.alchemyRecord.count({ where: { playerId } }),
        this.prisma.equipmentOperationRecord.count({
          where: { playerId, operationType: "forge" },
        }),
        this.prisma.towerActionRecord.count({
          where: { playerId, towerId: "tower_xuantie" },
        }),
      ]);
    const taskMap = new Map(input.tasks.map((task) => [task.task_id, task]));
    const isTaskDone = (taskId: string) => {
      const task = taskMap.get(taskId);
      return Boolean(task && task.status !== "in_progress");
    };
    const hasExploredJi =
      (jiProvince?.exploration_count ?? 0) > 0 || isTaskDone("novice_explore_ji");
    const hasResolvedEvent = resolvedEventCount > 0 || isTaskDone("novice_resolve_event");
    const hasAlchemy = alchemyCount > 0 || isTaskDone("novice_craft_alchemy");
    const hasTower = towerActionCount > 0 || isTaskDone("novice_tower_xuantie");
    const chapterTask = taskMap.get("chapter_first_30_minutes");
    const canClaimChapterReward = chapterTask?.status === "completed";
    const hasClaimedChapterReward = chapterTask?.status === "claimed";

    const steps: NewPlayerRouteStepState[] = [
      {
        action_hint: "overview",
        action_label: "查看冀州",
        detail: "角色已落在冀州，先确认行动令、今日主线和推荐行动。",
        status: "done",
        step_id: "enter_ji",
        title: "初入冀州",
      },
      {
        action_hint: "explore",
        action_label: input.actionState.action_points > 0 ? "开始探索" : "等待行动令",
        detail: hasExploredJi
          ? `已完成冀州探索 ${jiProvince?.exploration_count ?? 1} 次。`
          : `消耗行动令探索冀州，完成后领取战报和普通材料。行动令 ${input.actionState.action_points}/${input.actionState.action_point_cap}。`,
        status: hasExploredJi ? "done" : "active",
        step_id: "first_explore",
        title: "第一次探索",
        unlock_hint: "需要至少 1 枚行动令。",
      },
      {
        action_hint: "explore_event",
        action_label: pendingEventCount > 0 ? "处理奇遇" : "继续探索",
        detail: hasResolvedEvent
          ? "已处理途中见闻，少量普通奖励已入账。"
          : pendingEventCount > 0
            ? "已有探索奇遇待处理，选择一个方式领取普通奖励。"
            : "领取探索后会出现轻选择奇遇。",
        status: hasResolvedEvent ? "done" : hasExploredJi ? "active" : "pending",
        step_id: "resolve_event",
        title: "处理奇遇",
        unlock_hint: "完成一次探索并领取后出现。",
      },
      {
        action_hint: "growth",
        action_label: hasAlchemy ? "查看生产" : "炼第一炉丹",
        detail: hasAlchemy
          ? "已完成一次炼丹，可继续服丹或准备炼器。"
          : "根据路线选择聚灵丹或沸血丹，材料不足时先回到探索或洞府。",
        status: hasAlchemy ? "done" : hasResolvedEvent ? "active" : "pending",
        step_id: "craft_alchemy",
        title: "炼第一炉丹",
        unlock_hint: "需要凝露草和少量灵石。",
      },
      {
        action_hint: "multiplayer",
        action_label: hasTower ? "查看九塔" : "镇封玄铁塔",
        detail: hasTower
          ? "玄铁塔已有你的镇封记录。"
          : "提交一次玄铁塔镇封或补给，理解九州对应九塔的全服目标。",
        status: hasTower ? "done" : hasAlchemy || forgeCount > 0 ? "active" : "pending",
        step_id: "seal_xuantie",
        title: "镇封玄铁塔",
        unlock_hint: "需要行动令，奖励只给普通材料和贡献。",
      },
      {
        action_hint: "task",
        action_label: hasClaimedChapterReward ? "查看下一章" : "领取章节奖励",
        detail: hasClaimedChapterReward
          ? "冀州初定章节奖励已领取，下一步可补洞府、炼器和 7 日目标。"
          : canClaimChapterReward
            ? "冀州初定已达成，先领取首章奖励。"
            : "前 30 分钟节点完成后领取首章奖励。",
        status: hasClaimedChapterReward ? "done" : hasTower ? "active" : "pending",
        step_id: "claim_chapter_reward",
        title: "领取章节奖励",
        unlock_hint: "完成探索、奇遇、炼丹和玄铁塔行动。",
      },
    ];
    const activeStep =
      steps.find((step) => step.status === "active") ??
      steps.find((step) => step.status === "pending") ??
      steps.at(-1);
    const doneCount = steps.filter((step) => step.status === "done").length;
    const progressPercent = Math.round((doneCount / steps.length) * 100);

    return {
      config_version: "new_player_route_p1_9_v1",
      primary_action_hint: activeStep?.action_hint ?? "overview",
      primary_step_id: activeStep?.step_id ?? "enter_ji",
      progress_percent: progressPercent,
      progress_text: `${doneCount}/${steps.length}`,
      route_id: "first_30_minutes_ji",
      steps,
      subtitle: "按顺序完成探索、奇遇、炼丹、玄铁塔和章节奖励。",
      title: "冀州初定",
    };
  }

  private async applyReward(
    tx: Tx,
    playerId: string,
    rewards: RewardBundle,
    source: { sourceType: string; sourceId?: string; idempotencyKey?: string },
  ) {
    const spiritStone = BigInt(rewards.spirit_stone ?? "0");

    if (spiritStone > 0n) {
      const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
      await tx.playerWallet.update({
        where: { playerId },
        data: { spiritStone: { increment: spiritStone } },
      });
      await tx.walletLog.create({
        data: {
          logId: `wallet_${randomUUID()}`,
          playerId,
          currencyType: "spirit_stone",
          changeAmount: spiritStone,
          beforeAmount: wallet.spiritStone,
          afterAmount: wallet.spiritStone + spiritStone,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          idempotencyKey: source.idempotencyKey,
        },
      });
    }

    if (rewards.action_points && rewards.action_points > 0) {
      const action = await tx.playerActionState.findUniqueOrThrow({ where: { playerId } });
      await tx.playerActionState.update({
        where: { playerId },
        data: {
          actionPoints: Math.min(
            action.actionPointCap,
            action.actionPoints + rewards.action_points,
          ),
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
          playerId,
          itemId: item.item_id,
          count: BigInt(item.count),
          bindType: item.bind_type,
          sourceType: source.sourceType,
        },
      });
    }
  }

  private async createExploreEvent(
    tx: Tx,
    input: {
      playerId: string;
      province: ProvinceSummary;
      record: ExploreActionRecord;
    },
  ): Promise<ExploreEventRecord> {
    const existing = await tx.exploreEventRecord.findUnique({
      where: { exploreRecordId: input.record.recordId },
    });
    if (existing) {
      return existing;
    }

    const config = pickExploreEventConfig(input.record.recordId, input.province.province_id);
    return tx.exploreEventRecord.create({
      data: {
        eventId: `explore_event_${randomUUID()}`,
        playerId: input.playerId,
        eraId: defaultEraId,
        exploreRecordId: input.record.recordId,
        provinceId: input.province.province_id,
        provinceName: input.province.name,
        eventType: config.eventType,
        title: config.title,
        description: `${input.province.name}途中，${config.description}`,
        choices: config.choices as unknown as Prisma.InputJsonValue,
        status: "pending",
        configVersion: "p1_7_explore_event_v1",
        rulesetVersion: "ruleset_p1_7_v1",
        rewardConfigVersion: "reward_p1_7_v1",
      },
    });
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
        configVersion: "m2_core_loop_v1",
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

function toCultivationStatus(input: {
  player: Pick<Player, "currentRealm" | "currentStage" | "currentLevel">;
  progress: PlayerProgress;
}): CultivationStatus {
  return {
    cultivation_value: input.progress.cultivationValue.toString(),
    current_realm: input.player.currentRealm,
    current_stage: input.player.currentStage,
    current_level: input.player.currentLevel,
    current_level_required: getLevelRequirement(input.player.currentLevel).toString(),
    claimable_cultivation: calculateClaimableCultivation(input.progress).toString(),
    catchup_bonus_rate: input.progress.catchupBonusRate,
    last_cultivation_at: input.progress.lastCultivationAt.toISOString(),
    can_breakthrough:
      input.player.currentLevel >= 9 && input.progress.cultivationValue >= BigInt(600),
  };
}

function calculateClaimableCultivation(progress: PlayerProgress): bigint {
  const elapsedHours = Math.min(
    maxOfflineCultivationHours,
    Math.max(0, (Date.now() - progress.lastCultivationAt.getTime()) / (60 * 60 * 1000)),
  );
  const base = BigInt(Math.floor(elapsedHours * progress.cultivationRatePerHour));
  const bonus = (base * BigInt(progress.catchupBonusRate)) / 100n;
  return base + bonus;
}

function applyAutoLevel(
  player: Pick<Player, "currentLevel">,
  cultivationValue: bigint,
): { afterLevel: number; remainingCultivation: bigint } {
  let level = player.currentLevel;
  let remainingCultivation = cultivationValue;

  while (level < 9) {
    const requirement = getLevelRequirement(level);
    if (remainingCultivation < requirement) {
      break;
    }
    remainingCultivation -= requirement;
    level += 1;
  }

  return { afterLevel: level, remainingCultivation };
}

function getLevelRequirement(level: number): bigint {
  return BigInt(level * 100);
}

function calculateRecoveredActionPoints(state: PlayerActionState): number {
  const elapsedHours = Math.max(
    0,
    (Date.now() - state.lastRecoveredAt.getTime()) / (60 * 60 * 1000),
  );
  const recovered = Math.floor(elapsedHours * state.actionPointRestorePerHour);
  return Math.min(state.actionPointCap, state.actionPoints + recovered);
}

function normalizeExploreRequest(body: ExploreRequest): Required<ExploreRequest> {
  const provinceId = body?.province_id?.trim();
  const count = Math.floor(Number(body?.count ?? 1));

  if (!provinceId) {
    throw new BadRequestException("请选择探索州域");
  }

  if (!Number.isFinite(count) || count < 1 || count > maxExploreBatch) {
    throw new BadRequestException(`单次探索次数需为 1-${maxExploreBatch}`);
  }

  return { province_id: provinceId, count };
}

function normalizeExploreClaimRequest(body: ExploreClaimRequest): ExploreClaimRequest {
  const recordId = body?.record_id?.trim();
  return recordId ? { record_id: recordId } : {};
}

function normalizeResolveExploreEventRequest(
  body: ResolveExploreEventRequest,
): Required<ResolveExploreEventRequest> {
  const eventId = body?.event_id?.trim();
  const choiceId = body?.choice_id?.trim();
  if (!eventId) {
    throw new BadRequestException("请选择探索奇遇");
  }
  if (!choiceId) {
    throw new BadRequestException("请选择处理方式");
  }

  return { event_id: eventId, choice_id: choiceId };
}

function normalizeListLimit(input: string | undefined, fallback: number, max: number): number {
  const limit = Math.floor(Number(input ?? fallback));
  if (!Number.isFinite(limit) || limit < 1) {
    return fallback;
  }

  return Math.min(limit, max);
}

function normalizeBeforeCursor(input: string | undefined): Date | undefined {
  if (!input) {
    return undefined;
  }
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeExploreEventStatusFilter(input: string | undefined): string | undefined {
  if (!input) {
    return undefined;
  }
  if (input === "pending" || input === "resolved" || input === "expired") {
    return input;
  }

  throw new BadRequestException("探索奇遇状态无效");
}

function toExploreResponse(
  record: ExploreActionRecord,
  actionState: ActionState,
  event?: ExploreEventRecord | null,
): ExploreResponse {
  const rewards =
    record.rewardSnapshot && typeof record.rewardSnapshot === "object"
      ? (record.rewardSnapshot as unknown as RewardBundle)
      : ({ cultivation: "0", spirit_stone: "0", items: [] } satisfies RewardBundle);
  const battles = Array.isArray(record.battleSnapshot)
    ? (record.battleSnapshot as unknown as BattleSummary[])
    : [];
  const completedTaskIds = Array.isArray(record.completedTaskIds)
    ? (record.completedTaskIds as unknown as string[])
    : [];
  const experience =
    record.experienceSnapshot && typeof record.experienceSnapshot === "object"
      ? (record.experienceSnapshot as unknown as ExploreResponse["experience"])
      : undefined;

  return {
    record_id: record.recordId,
    province_id: record.provinceId,
    province_name: record.provinceName,
    count: record.count,
    status: normalizeExploreStatus(record.status),
    seconds_per_explore: record.secondsPerExplore,
    total_seconds: record.totalSeconds,
    started_at: record.startedAt.toISOString(),
    completes_at: record.completesAt.toISOString(),
    claimed_at: record.claimedAt?.toISOString() ?? null,
    can_claim: record.status === "completed" && !record.claimedAt,
    action_state: actionState,
    battles,
    rewards,
    completed_task_ids: completedTaskIds,
    experience,
    event: event ? toExploreEventState(event) : null,
  };
}

function toExploreEventState(record: ExploreEventRecord): ExploreEventState {
  const choices = exploreEventChoiceConfigsFromJson(record.choices);
  const config = exploreEventConfigs.find((item) => item.eventType === record.eventType);
  const rewards =
    record.rewardSnapshot && typeof record.rewardSnapshot === "object"
      ? (record.rewardSnapshot as unknown as RewardBundle)
      : ({ cultivation: "0", spirit_stone: "0", items: [] } satisfies RewardBundle);
  const experience =
    record.experienceSnapshot && typeof record.experienceSnapshot === "object"
      ? (record.experienceSnapshot as unknown as ExploreEventState["experience"])
      : undefined;

  return {
    event_id: record.eventId,
    explore_record_id: record.exploreRecordId,
    province_id: record.provinceId,
    province_name: record.provinceName,
    event_type: record.eventType,
    rarity: config?.rarity ?? "common",
    title: record.title,
    description: record.description,
    prerequisite_hint: config?.prerequisiteHint ?? "完成探索后出现。",
    route_step_hint: config?.routeStepHint ?? "处理后可继续推进今日修行。",
    status: normalizeExploreEventStatus(record.status),
    choices: choices.map((choice) => ({
      choice_id: choice.choiceId,
      description: choice.description,
      label: choice.label,
      outcome_hint: choice.outcomeHint,
      reward_preview: choice.rewardPreview,
    })),
    selected_choice_id: record.selectedChoiceId,
    rewards,
    experience,
    created_at: record.createdAt.toISOString(),
    resolved_at: record.resolvedAt?.toISOString() ?? null,
  };
}

function normalizeExploreEventStatus(status: string): ExploreEventState["status"] {
  if (status === "pending" || status === "resolved" || status === "expired") {
    return status;
  }

  return "pending";
}

function exploreEventChoiceConfigsFromJson(value: Prisma.JsonValue): ExploreEventChoiceConfig[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return (value as unknown[]).filter(isExploreEventChoiceConfig);
}

function isExploreEventChoiceConfig(value: unknown): value is ExploreEventChoiceConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Partial<ExploreEventChoiceConfig>;
  return (
    typeof item.choiceId === "string" &&
    typeof item.label === "string" &&
    typeof item.description === "string" &&
    typeof item.rewardPreview === "string" &&
    (item.outcomeHint === undefined || typeof item.outcomeHint === "string") &&
    typeof item.rewards === "object" &&
    item.rewards !== null
  );
}

function pickExploreEventConfig(seed: string, provinceId: string): ExploreEventConfig {
  const candidates = exploreEventConfigs.filter(
    (config) => !config.provinceIds || config.provinceIds.includes(provinceId),
  );
  const eventPool = candidates.length ? candidates : exploreEventConfigs;
  const sum = Array.from(seed).reduce((value, char) => value + char.charCodeAt(0), 0);
  return eventPool[sum % eventPool.length] ?? exploreEventConfigs[0];
}

function buildExploreEventExperience(
  event: ExploreEventRecord,
  choice: ExploreEventChoiceConfig,
): ResolveExploreEventResponse["experience"] {
  return buildJournalExperience({
    title: `${event.title}处理完成`,
    summary: `${choice.label}：${choice.description}`,
    deltas: [rewardDeltaForEvent(choice.rewards)].filter(
      Boolean,
    ) as ResolveExploreEventResponse["experience"]["delta_summary"],
    tags: [{ code: "event_choice", label: "奇遇选择", tone: "success" }],
    recommendations: [
      {
        action_hint: "explore",
        label: "继续游历",
        priority: "medium",
        reason: "探索奇遇已处理，可继续安排下一次州域探索。",
      },
    ],
  });
}

function rewardDeltaForEvent(rewards: RewardBundle) {
  const parts: string[] = [];
  if (rewards.cultivation && BigInt(rewards.cultivation) > 0n) {
    parts.push(`修为 ${rewards.cultivation}`);
  }
  if (rewards.spirit_stone && BigInt(rewards.spirit_stone) > 0n) {
    parts.push(`灵石 ${rewards.spirit_stone}`);
  }
  for (const item of rewards.items ?? []) {
    if (item.count > 0) {
      parts.push(`${item.name} x${item.count}`);
    }
  }

  return parts.length
    ? {
        delta: parts.join("，"),
        label: "奇遇奖励",
      }
    : null;
}

function taskTitleForProgress(taskId: string): string {
  const labels: Record<string, string> = {
    chapter_first_30_minutes: "冀州初定可领奖",
    novice_craft_alchemy: "第一炉丹完成",
    novice_resolve_event: "途中见闻完成",
    novice_tower_xuantie: "玄铁塔镇封完成",
  };
  return labels[taskId] ?? taskId;
}

function stringArrayFromJson(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeExploreStatus(status: string): ExploreResponse["status"] {
  if (
    status === "pending" ||
    status === "completed" ||
    status === "claimed" ||
    status === "expired"
  ) {
    return status;
  }

  return "pending";
}

function mergeRewards(target: RewardBundle, source: RewardBundle) {
  target.cultivation = (
    BigInt(target.cultivation ?? "0") + BigInt(source.cultivation ?? "0")
  ).toString();
  target.spirit_stone = (
    BigInt(target.spirit_stone ?? "0") + BigInt(source.spirit_stone ?? "0")
  ).toString();
  target.items = [...(target.items ?? []), ...(source.items ?? [])];
}

function createBattleRoundLog(input: {
  playerName: string;
  enemyName: string;
  damageDone: number;
  damageTaken: number;
  result: BattleSummary["result"];
  activeSkillName: string;
  enemySkillName: string;
  treasureSkillName: string;
}): BattleRoundLog[] {
  const enemyRemainingHp = Math.max(0, input.result === "win" ? 0 : input.damageTaken);

  return [
    {
      round: 1,
      actor: input.playerName,
      skill: input.activeSkillName,
      damage: Math.floor(input.damageDone * 0.55),
      target_hp: Math.max(0, input.damageDone - Math.floor(input.damageDone * 0.55)),
    },
    {
      round: 2,
      actor: input.enemyName,
      skill: input.enemySkillName,
      damage: input.damageTaken,
      target_hp: Math.max(0, 100 - input.damageTaken),
    },
    {
      round: 3,
      actor: input.playerName,
      skill: input.treasureSkillName,
      damage: Math.ceil(input.damageDone * 0.45),
      target_hp: enemyRemainingHp,
    },
  ];
}

function getCombatSkillNames(
  route: string,
  loadout: PlayerSkillLoadout | null,
): { activeSkillName: string; treasureSkillName: string } {
  const fallback = getDefaultSkillLoadout(route as CultivationRoute);
  const activeSkillIds = normalizeStringArray(loadout?.activeSkillIds) ?? fallback.active_skill_ids;
  const autoPriority = normalizeStringArray(loadout?.autoPriority) ?? fallback.auto_priority;
  const treasureSkillId = loadout?.treasureSkillId ?? fallback.treasure_skill_id;
  const activeSkillId =
    autoPriority.find((skillId) => activeSkillIds.includes(skillId)) ?? activeSkillIds[0];

  return {
    activeSkillName: getSkillName(activeSkillId),
    treasureSkillName: getSkillName(treasureSkillId),
  };
}

function normalizeStringArray(value: Prisma.JsonValue | undefined): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const items = value.filter((item): item is string => typeof item === "string");
  return items.length ? items : null;
}

function sortProvincesByConfig<T extends { provinceId: string }>(items: T[]): T[] {
  const order = new Map(provinceConfigs.map((province, index) => [province.provinceId, index]));
  return [...items].sort((left, right) => {
    const leftIndex = order.get(left.provinceId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.provinceId) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}
