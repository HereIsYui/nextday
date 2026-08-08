import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import type {
  ActionState,
  BattleListResponse,
  BattleRoundLog,
  BattleSummary,
  BreakthroughResponse,
  CaveCollectResponse,
  CultivationClaimResponse,
  CultivationRoute,
  CultivationStatus,
  DailyRouteResponse,
  DailyRouteStepState,
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
  RealmProgressionResponse,
  ResolveExploreEventRequest,
  ResolveExploreEventResponse,
  RewardBundle,
  RouteStepViewState,
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
  PlayerProductionEffect,
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
  allocateCultivation,
  getCultivationRatePerHour,
  getEventCultivationReward,
  getExploreCultivationReward,
} from "./cultivation-progress";
import {
  type ExploreEventChoiceConfig,
  type ExploreEventConfig,
  buildExploreBattleHint,
  defaultEraId,
  exploreEventConfigs,
  getTaskDefinitions,
  maxExploreBatch,
  maxOfflineCultivationHours,
  provinceConfigs,
  provinceExploreSeconds,
  selectExploreEnemy,
  selectExploreLoot,
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
import {
  getLevelRequirement,
  getRealmConfig,
  getRealmName,
  getRealmProgression,
  getRealmStageConfig,
  getRealmUnlockStates,
  getStageLevelCount,
  maximumRealm,
  stagesPerRealm,
} from "./realm-progression.constants";
import { ensureInitialPlayerTasks, incrementPlayerTasks } from "./task-progress.utils";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type PlayerWithCore = Player & { progress: PlayerProgress; wallet: PlayerWallet };

const exploreEventTriggerChancePercent = 35;
const exploreEventAutoResolveMilliseconds = 5 * 60 * 1000;
const exploreEventLifecycleIntervalMilliseconds = 5 * 1000;
const chapterTaskChapterTargets: Record<string, number> = {
  chapter_first_30_minutes: 2,
};

interface ExploreEventPlan {
  triggerAt: Date;
}

@Injectable()
export class GameService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private exploreEventLifecycleTimer: ReturnType<typeof setInterval> | null = null;
  private isRefreshingDueExploreEvents = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.refreshDueExploreEventLifecycles();
    this.exploreEventLifecycleTimer = setInterval(() => {
      void this.refreshDueExploreEventLifecycles();
    }, exploreEventLifecycleIntervalMilliseconds);
  }

  onModuleDestroy() {
    if (this.exploreEventLifecycleTimer) {
      clearInterval(this.exploreEventLifecycleTimer);
      this.exploreEventLifecycleTimer = null;
    }
  }

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

  async getDailyRoute(accountId: string): Promise<DailyRouteResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    await this.refreshExploreEventLifecycle({ accountId, playerId: player.playerId });
    const todayStart = startOfDay();
    const [
      actionState,
      provinces,
      tasks,
      cave,
      activeRecord,
      pendingEvent,
      recentBattleCount,
      alchemyCountToday,
      towerActionCountToday,
    ] = await Promise.all([
      this.refreshActionState(player.playerId),
      this.getProvinceSummaries(player.playerId),
      this.getTasksByPlayerId(player.playerId),
      this.getCaveByPlayerId(player.playerId),
      this.findActiveExploreRecord(this.prisma, player.playerId),
      this.prisma.exploreEventRecord.findFirst({
        where: { playerId: player.playerId, status: "pending" },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.battleLog.count({
        where: { playerId: player.playerId, battleType: "explore", createdAt: { gte: todayStart } },
      }),
      this.prisma.alchemyRecord.count({
        where: { playerId: player.playerId, createdAt: { gte: todayStart } },
      }),
      this.prisma.towerActionRecord.count({
        where: { playerId: player.playerId, createdAt: { gte: todayStart } },
      }),
    ]);
    const exploreRecord = activeRecord
      ? await this.refreshExploreRecordStatus(this.prisma, activeRecord)
      : null;

    return buildDailyRouteState({
      actionState,
      alchemyCountToday,
      cave,
      exploreRecord,
      pendingEvent,
      provinces,
      recentBattleCount,
      tasks,
      towerActionCountToday,
    });
  }

  async getRealmProgression(accountId: string): Promise<RealmProgressionResponse> {
    const player = await this.requirePlayer(accountId);
    return getRealmProgression(player.route === "body" ? "body" : "qi");
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

  async getBattles(
    accountId: string,
    input: {
      provinceId?: string;
      result?: string;
      enemyTrait?: string;
      battleType?: string;
      limit?: string;
      before?: string;
    },
  ): Promise<BattleListResponse> {
    const player = await this.requirePlayer(accountId);
    const limit = normalizeListLimit(input.limit, 10, 30);
    const before = normalizeBeforeCursor(input.before);
    const result = normalizeBattleResultFilter(input.result);
    const battleType = normalizeOptionalTextFilter(input.battleType);
    const provinceId = normalizeOptionalTextFilter(input.provinceId);
    const enemyTrait = normalizeOptionalTextFilter(input.enemyTrait);

    const rows = await this.prisma.battleLog.findMany({
      where: {
        playerId: player.playerId,
        ...(battleType ? { battleType } : {}),
        ...(provinceId ? { provinceId } : {}),
        ...(result ? { result } : {}),
        ...(before ? { createdAt: { lt: before } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: enemyTrait ? Math.max(limit * 4, 30) : limit + 1,
    });
    const filtered = rows
      .map((battle) => toBattleSummary(battle))
      .filter((battle) => !enemyTrait || battle.enemy_traits?.includes(enemyTrait));
    const visibleBattles = filtered.slice(0, limit);

    return {
      battles: visibleBattles,
      filters: {
        ...(battleType ? { battle_type: battleType } : {}),
        ...(enemyTrait ? { enemy_trait: enemyTrait } : {}),
        ...(provinceId ? { province_id: provinceId } : {}),
        ...(result ? { result } : {}),
      },
      next_cursor: filtered.length > limit ? (visibleBattles.at(-1)?.created_at ?? null) : null,
    };
  }

  async getExploreEvents(
    accountId: string,
    input: { status?: string; limit?: string },
  ): Promise<ExploreEventListResponse> {
    const player = await this.requirePlayer(accountId);
    await this.refreshExploreEventLifecycle({ accountId, playerId: player.playerId });
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
        const beforeStage = loaded.currentStage;
        const beforeLevel = loaded.currentLevel;
        const gainedCultivation = calculateClaimableCultivation(loaded.progress);
        const granted = await this.grantCultivation(tx, loaded, gainedCultivation, {
          lastCultivationAt: new Date(),
          dailyActiveScore: { increment: 5 },
          weeklyActiveScore: { increment: 5 },
        });
        const updatedPlayer = granted.player;
        const updatedProgress = granted.progress;
        const completedTaskIds = await incrementPlayerTasks(tx, loaded.playerId, {
          novice_claim_cultivation: 1,
        });
        const breakthroughEffect = await this.findActiveProductionEffect(
          tx,
          loaded.playerId,
          "breakthrough_support",
        );
        const status = toCultivationStatus({
          player: updatedPlayer,
          progress: updatedProgress,
          breakthroughSupportValue: breakthroughEffect?.effectValue ?? 0,
        });
        const response: CultivationClaimResponse = {
          record_id: `cultivation_claim_${randomUUID()}`,
          gained_cultivation: gainedCultivation.toString(),
          before_level: beforeLevel,
          after_level: granted.allocation.currentLevel,
          before_stage: beforeStage,
          after_stage: granted.allocation.currentStage,
          status,
          completed_task_ids: completedTaskIds,
          experience: buildJournalExperience({
            title: "收束修为",
            summary:
              granted.allocation.currentLevel !== beforeLevel ||
              granted.allocation.currentStage !== beforeStage
                ? `静坐收益入体，修为 +${gainedCultivation.toString()}，修行进度有所提升。`
                : `静坐收益入体，修为 +${gainedCultivation.toString()}。`,
            deltas: [
              {
                label: "修为",
                delta: `+${gainedCultivation.toString()}`,
                tone: "success",
              },
              {
                label: "修行等级",
                before: `${beforeStage}-${beforeLevel}`,
                after: `${granted.allocation.currentStage}-${granted.allocation.currentLevel}`,
                tone:
                  granted.allocation.currentLevel !== beforeLevel ||
                  granted.allocation.currentStage !== beforeStage
                    ? "success"
                    : "neutral",
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
        const realmConfig = getRealmConfig(loaded.currentRealm);
        const requirement = BigInt(realmConfig.breakthroughCultivation);
        const breakthroughEffect = await this.findActiveProductionEffect(
          tx,
          loaded.playerId,
          "breakthrough_support",
        );
        const supportValue = BigInt(
          Math.min(Math.max(0, breakthroughEffect?.effectValue ?? 0), Number(requirement)),
        );
        const potentialRequirement = requirement > supportValue ? requirement - supportValue : 0n;
        const canBreakthrough =
          loaded.currentRealm < maximumRealm &&
          loaded.currentStage >= stagesPerRealm &&
          loaded.currentLevel >= getStageLevelCount(loaded.currentRealm) &&
          loaded.progress.cultivationValue >= potentialRequirement;

        if (!canBreakthrough) {
          return {
            record_id: `breakthrough_${randomUUID()}`,
            success: false,
            message:
              loaded.currentRealm >= maximumRealm
                ? "已达当前纪元最高境界"
                : "境界尚未圆满，暂不可突破",
            profile: toPlayerProfileResponse({
              player: loaded,
              progress: loaded.progress,
              wallet: loaded.wallet,
            }),
          };
        }

        const supportApplied = breakthroughEffect
          ? await this.consumeProductionEffect(tx, breakthroughEffect)
          : false;
        const appliedSupportValue = supportApplied ? supportValue : 0n;
        const effectiveRequirement =
          requirement > appliedSupportValue ? requirement - appliedSupportValue : 0n;
        if (loaded.progress.cultivationValue < effectiveRequirement) {
          return {
            record_id: `breakthrough_${randomUUID()}`,
            success: false,
            message: "突破辅助已失效，当前修为尚不足以突破",
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
            currentStage: 1,
            currentLevel: 1,
          },
        });
        await tx.playerProgress.update({
          where: { playerId: loaded.playerId },
          data: {
            cultivationValue: loaded.progress.cultivationValue - effectiveRequirement,
            breakthroughFailCount: 0,
            cultivationRatePerHour: getCultivationRatePerHour(loaded.currentRealm + 1),
          },
        });
        const profile = await this.getProfileByPlayerId(loaded.playerId, tx);
        const afterRealm = loaded.currentRealm + 1;
        const afterRealmName = getRealmName(afterRealm, loaded.route);
        const newlyUnlocked = getRealmUnlockStates(afterRealm).filter(
          (feature) => feature.required_realm === afterRealm,
        );
        const response: BreakthroughResponse = {
          record_id: `breakthrough_${randomUUID()}`,
          success: true,
          message: `突破成功，踏入${afterRealmName}${appliedSupportValue > 0n ? `。破障丹助你抵消了 ${appliedSupportValue} 点突破所需修为` : ""}`,
          profile,
          experience: buildJournalExperience({
            title: "境界突破",
            summary: `灵机贯通，踏入${afterRealmName}。${newlyUnlocked.length ? `新解锁：${newlyUnlocked.map((feature) => feature.label).join("、")}。` : ""}`,
            deltas: [
              {
                label: "境界",
                before: getRealmName(loaded.currentRealm, loaded.route),
                after: afterRealmName,
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

        await this.lockPlayerExploreQueue(tx, loaded.playerId);
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

        const exploreEffect = await this.findActiveProductionEffect(
          tx,
          loaded.playerId,
          "explore_boost",
        );
        const candidateExploreBoostPercent = Math.min(
          100,
          Math.max(0, exploreEffect?.effectValue ?? 0),
        );
        const exploreBoostApplied = exploreEffect
          ? await this.consumeProductionEffect(tx, exploreEffect)
          : false;
        const exploreBoostPercent = exploreBoostApplied ? candidateExploreBoostPercent : 0;

        const afterActionState = await tx.playerActionState.update({
          where: { playerId: loaded.playerId },
          data: { actionPoints: actionState.action_points - body.count },
        });
        const startedAt = new Date();
        const secondsPerExplore = provinceExploreSeconds[province.province_id] ?? 30;
        const totalSeconds = secondsPerExplore * body.count;
        const recordId = `explore_${randomUUID()}`;
        const guaranteeNoviceEvent = await this.shouldGuaranteeNoviceExploreEvent(
          tx,
          loaded.playerId,
          province.province_id,
        );
        const eventPlan = planExploreEvent(recordId, startedAt, totalSeconds, guaranteeNoviceEvent);
        const eventContext = eventPlan
          ? buildPlannedExploreEventLinkContext(province.province_id, recordId, body.count)
          : null;
        const record = await tx.exploreActionRecord.create({
          data: {
            recordId,
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
            exploreBoostPercent,
            eventTriggerAt: eventPlan?.triggerAt ?? null,
            ...(eventContext
              ? { eventContextSnapshot: eventContext as unknown as Prisma.InputJsonValue }
              : {}),
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
    await this.refreshExploreEventLifecycle({ accountId, playerId: player.playerId });
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
    await this.refreshExploreEventLifecycle({
      accountId: input.accountId,
      playerId: player.playerId,
    });

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
        if (record.status === "claimed" || record.claimedAt) {
          throw new BadRequestException("探索奖励已领取");
        }

        if (record.status !== "completed" || record.completesAt.getTime() > Date.now()) {
          throw new BadRequestException("探索尚未完成");
        }

        const claimedAt = new Date();
        const reservation = await tx.exploreActionRecord.updateMany({
          where: {
            claimedAt: null,
            playerId: loaded.playerId,
            recordId: record.recordId,
            status: "completed",
          },
          data: { claimedAt, status: "claimed" },
        });
        if (reservation.count === 0) {
          throw new BadRequestException("探索奖励已领取");
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
            record.exploreBoostPercent,
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
            rewardSnapshot: rewardTotal as unknown as Prisma.InputJsonValue,
            battleSnapshot: battles as unknown as Prisma.InputJsonValue,
            completedTaskIds: completedTaskIds as unknown as Prisma.InputJsonValue,
            experienceSnapshot: experience as unknown as Prisma.InputJsonValue,
            actionStateSnapshot: actionState as unknown as Prisma.InputJsonValue,
          },
        });
        const response = toExploreResponse(updatedRecord, actionState);

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
    await this.refreshExploreEventLifecycle({
      accountId: input.accountId,
      playerId: player.playerId,
    });

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

        const response = await this.settleExploreEvent(tx, {
          accountId: input.accountId,
          automatic: false,
          choice,
          event,
          idempotencyKey: input.idempotencyKey,
          playerId: player.playerId,
        });
        if (!response) {
          throw new BadRequestException("探索奇遇已处理");
        }
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
        const activeResetKeys = getActiveTaskResetKeys();
        const task = await tx.playerTaskState.findFirst({
          where: {
            playerId: player.playerId,
            resetKey: { in: activeResetKeys },
            status: "completed",
            taskId: input.taskId,
          },
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
        await this.advanceChapterForClaimedTask(tx, player.playerId, claimedTask.taskId);
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
        if (caveState.claimable_minutes <= 0) {
          throw new BadRequestException("洞府暂无可领取收益");
        }
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
            herbCount:
              rewards.items?.find((item) => item.item_id === "alch_spirit_resin")?.count ?? 0,
            oreCount:
              rewards.items?.find((item) => item.item_id === "forge_spiritwood_core")?.count ?? 0,
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

    await tx.playerProvinceProgress.createMany({
      data: provinceConfigs.map((province) => ({
        provinceProgressId: `province_progress_${randomUUID()}`,
        playerId,
        eraId: defaultEraId,
        provinceId: province.provinceId,
        unlocked: province.chapterRequired === 1,
      })),
      skipDuplicates: true,
    });

    await ensureInitialPlayerTasks(tx, playerId);
    await this.syncClaimedChapterProgress(tx, playerId);
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
    const breakthroughEffect = await this.findActiveProductionEffect(
      this.prisma,
      playerId,
      "breakthrough_support",
    );
    return toCultivationStatus({
      player,
      progress: player.progress,
      breakthroughSupportValue: breakthroughEffect?.effectValue ?? 0,
    });
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

  private async shouldGuaranteeNoviceExploreEvent(
    tx: Tx,
    playerId: string,
    provinceId: string,
  ): Promise<boolean> {
    if (provinceId !== "ji") {
      return false;
    }

    const eventTask = await tx.playerTaskState.findFirst({
      where: { playerId, taskId: "novice_resolve_event" },
      select: { status: true },
    });

    // 新手主线尚未处理奇遇时，每次冀州探索都预定一次途中奇遇。
    // 若此前探索因服务离线错过触发窗口，不会回补旧记录；下一次探索仍可获得保底。
    return eventTask?.status === "in_progress";
  }

  private async advanceChapterForClaimedTask(tx: Tx, playerId: string, taskId: string) {
    const targetChapter = chapterTaskChapterTargets[taskId];
    if (!targetChapter) {
      return;
    }

    await this.applyChapterProgress(tx, playerId, targetChapter);
  }

  private async syncClaimedChapterProgress(tx: DbClient, playerId: string) {
    const claimedChapterTasks = await tx.playerTaskState.findMany({
      where: {
        playerId,
        status: "claimed",
        taskId: { in: Object.keys(chapterTaskChapterTargets) },
      },
      select: { taskId: true },
    });
    const targetChapter = claimedChapterTasks.reduce(
      (highestChapter, task) =>
        Math.max(highestChapter, chapterTaskChapterTargets[task.taskId] ?? 0),
      0,
    );

    if (targetChapter > 0) {
      await this.applyChapterProgress(tx, playerId, targetChapter);
    }
  }

  private async applyChapterProgress(tx: DbClient, playerId: string, targetChapter: number) {
    const progress = await tx.playerProgress.findUniqueOrThrow({ where: { playerId } });
    const currentChapter = Math.max(progress.chapterId, targetChapter);
    const unlockedProvinceIds = provinceConfigs
      .filter((province) => province.chapterRequired <= currentChapter)
      .map((province) => province.provinceId);

    if (progress.chapterId < currentChapter) {
      await tx.playerProgress.update({
        where: { playerId },
        data: { chapterId: currentChapter },
      });
    }
    await Promise.all([
      tx.playerProvinceProgress.updateMany({
        where: { playerId, provinceId: { in: unlockedProvinceIds }, unlocked: false },
        data: { unlocked: true },
      }),
      tx.provinceState.updateMany({
        where: {
          eraId: defaultEraId,
          provinceId: { in: unlockedProvinceIds },
          unlocked: false,
        },
        data: { unlocked: true },
      }),
    ]);
  }

  private async refreshDueExploreEventLifecycles() {
    if (this.isRefreshingDueExploreEvents) {
      return;
    }

    this.isRefreshingDueExploreEvents = true;
    try {
      const now = new Date();
      const [dueRecords, overdueEvents] = await Promise.all([
        this.prisma.exploreActionRecord.findMany({
          where: {
            completesAt: { gt: now },
            eventRecord: { is: null },
            eventTriggerAt: { lte: now },
            status: "pending",
          },
          orderBy: { eventTriggerAt: "asc" },
          select: {
            player: { select: { accountId: true } },
            playerId: true,
          },
          take: 100,
        }),
        this.prisma.exploreEventRecord.findMany({
          where: {
            autoResolveAt: { lte: now },
            status: "pending",
          },
          orderBy: { autoResolveAt: "asc" },
          select: {
            player: { select: { accountId: true } },
            playerId: true,
          },
          take: 100,
        }),
      ]);
      const duePlayers = new Map<string, string>();
      for (const item of [...dueRecords, ...overdueEvents]) {
        duePlayers.set(item.playerId, item.player.accountId);
      }

      for (const [playerId, accountId] of duePlayers) {
        try {
          await this.refreshExploreEventLifecycle({ accountId, playerId });
        } catch (error) {
          this.logger.error(
            `刷新玩家 ${playerId} 的探索奇遇生命周期失败`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.error(
        "扫描待触发或待自动结算的探索奇遇失败",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRefreshingDueExploreEvents = false;
    }
  }

  private async refreshExploreEventLifecycle(input: { accountId: string; playerId: string }) {
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const activeRecord = await this.findActiveExploreRecord(tx, input.playerId);
      const record = activeRecord ? await this.refreshExploreRecordStatus(tx, activeRecord) : null;

      if (
        record?.status === "pending" &&
        record.eventTriggerAt &&
        record.eventTriggerAt.getTime() <= now.getTime() &&
        record.completesAt.getTime() > now.getTime()
      ) {
        const province = await this.getProvinceForPlayer(tx, input.playerId, record.provinceId);
        await this.createExploreEvent(tx, {
          context: exploreEventLinkContextFromJson(record.eventContextSnapshot),
          playerId: input.playerId,
          province,
          record,
          triggeredAt: now,
        });
      }

      const overdueEvents = await tx.exploreEventRecord.findMany({
        where: {
          autoResolveAt: { lte: now },
          playerId: input.playerId,
          status: "pending",
        },
        orderBy: { autoResolveAt: "asc" },
        take: 20,
      });

      for (const event of overdueEvents) {
        const choices = exploreEventChoiceConfigsFromJson(event.choices);
        const choice = pickAutomaticExploreEventChoice(choices);
        if (!choice) {
          continue;
        }
        const response = await this.settleExploreEvent(tx, {
          accountId: input.accountId,
          automatic: true,
          choice,
          event,
          idempotencyKey: `auto_explore_event_${event.eventId}`,
          playerId: input.playerId,
        });
        if (!response) {
          continue;
        }
        await writeJournalFromResponse(tx, {
          accountId: input.accountId,
          endpoint: "POST /api/game/explore/events/resolve",
          response,
          idempotencyKey: `auto_explore_event_${event.eventId}`,
        });
      }
    });
  }

  private async settleExploreEvent(
    tx: Tx,
    input: {
      accountId: string;
      automatic: boolean;
      choice: ExploreEventChoiceConfig;
      event: ExploreEventRecord;
      idempotencyKey: string;
      playerId: string;
    },
  ): Promise<ResolveExploreEventResponse | null> {
    const claimed = await tx.exploreEventRecord.updateMany({
      where: { eventId: input.event.eventId, status: "pending" },
      data: { status: "expired" },
    });
    if (claimed.count === 0) {
      if (input.automatic) {
        return null;
      }
      throw new BadRequestException("探索奇遇已处理");
    }

    const eventPlayer = await this.requirePlayerInTx(tx, input.playerId);
    const eventRewards = {
      ...input.choice.rewards,
      cultivation:
        BigInt(input.choice.rewards.cultivation ?? "0") > 0n
          ? String(getEventCultivationReward(eventPlayer.currentRealm))
          : input.choice.rewards.cultivation,
    };
    const eventChoice = { ...input.choice, rewards: eventRewards };
    await this.grantCultivation(tx, eventPlayer, BigInt(eventRewards.cultivation ?? "0"));
    await this.applyReward(
      tx,
      input.playerId,
      { ...eventRewards, cultivation: undefined },
      {
        sourceType: "explore_event",
        sourceId: input.event.eventId,
        idempotencyKey: input.idempotencyKey,
      },
    );
    const completedTaskIds = await incrementPlayerTasks(tx, input.playerId, {
      novice_resolve_event: 1,
    });
    const experience = buildExploreEventExperience(input.event, eventChoice, input.automatic);
    const updatedEvent = await tx.exploreEventRecord.update({
      where: { eventId: input.event.eventId },
      data: {
        status: "resolved",
        selectedChoiceId: input.choice.choiceId,
        rewardSnapshot: eventRewards as unknown as Prisma.InputJsonValue,
        experienceSnapshot: experience as unknown as Prisma.InputJsonValue,
        resolvedIdempotency: input.idempotencyKey,
        resolutionMode: input.automatic ? "auto" : "manual",
        resolvedAt: new Date(),
      },
    });
    const response: ResolveExploreEventResponse = {
      event: toExploreEventState(updatedEvent),
      rewards: eventRewards,
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
      playerId: input.playerId,
      action: input.automatic ? "explore_event_auto_resolve" : "explore_event_resolve",
      targetType: "explore_event",
      targetId: input.event.eventId,
      afterSnapshot: response as unknown as Prisma.InputJsonValue,
      idempotencyKey: input.idempotencyKey,
    });

    return response;
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

  private async lockPlayerExploreQueue(tx: Tx, playerId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${playerId}))`;
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

  private async findActiveProductionEffect(
    tx: Tx,
    playerId: string,
    effectType: "breakthrough_support" | "explore_boost",
  ): Promise<PlayerProductionEffect | null> {
    return tx.playerProductionEffect.findFirst({
      where: {
        playerId,
        effectType,
        remainingUses: { gt: 0 },
        consumedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
    });
  }

  private async consumeProductionEffect(tx: Tx, effect: PlayerProductionEffect): Promise<boolean> {
    const consumed = await tx.playerProductionEffect.updateMany({
      where: {
        effectId: effect.effectId,
        remainingUses: { gt: 0 },
        consumedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { remainingUses: { decrement: 1 } },
    });
    if (consumed.count === 0) {
      return false;
    }

    const updated = await tx.playerProductionEffect.findUniqueOrThrow({
      where: { effectId: effect.effectId },
    });
    if (updated.remainingUses <= 0) {
      await tx.playerProductionEffect.update({
        where: { effectId: effect.effectId },
        data: { consumedAt: new Date() },
      });
    }
    return true;
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
    const activeResetKeys = getActiveTaskResetKeys();
    const tasks = await this.prisma.playerTaskState.findMany({
      where: { playerId, resetKey: { in: activeResetKeys } },
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
    exploreBoostPercent: number,
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
      traits: ["均衡"],
    };

    const playerPower = player.currentRealm * 120 + player.currentLevel * 45;
    const result: BattleSummary["result"] = playerPower >= enemy.enemyPower ? "win" : "lose";
    const damageDone = result === "win" ? enemy.enemyPower + player.currentLevel * 12 : playerPower;
    const damageTaken =
      result === "win" ? Math.max(8, Math.floor(enemy.enemyPower / 3)) : enemy.enemyPower;
    const loot =
      result === "win"
        ? selectExploreLoot(province.province_id, exploreRecordId, battleIndex, enemy.enemyId)
        : null;
    const baseRewards: RewardBundle =
      result === "win"
        ? {
            cultivation: String(getExploreCultivationReward(player.currentRealm, result)),
            spirit_stone: "35",
            items: loot
              ? [{ item_id: loot.itemId, name: loot.name, count: 1, bind_type: "bound" }]
              : undefined,
          }
        : {
            cultivation: String(getExploreCultivationReward(player.currentRealm, result)),
            spirit_stone: "8",
          };
    const rewards = applyExploreRewardBoost(baseRewards, exploreBoostPercent);
    const granted = await this.grantCultivation(
      tx,
      { ...player, progress },
      BigInt(rewards.cultivation ?? "0"),
      {
        dailyActiveScore: { increment: 3 },
        weeklyActiveScore: { increment: 3 },
      },
    );
    const updatedProgress = granted.progress;

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
    const summary = toBattleSummary(battle);

    return {
      summary: {
        ...summary,
        battle_hint: buildExploreBattleHint({
          enemyName: enemy.enemyName,
          enemyTraits: enemy.traits,
          loot: loot ?? undefined,
          result,
        }),
        enemy_traits: enemy.traits,
        loot_highlights: loot ? [`${loot.name} x1 · ${loot.usageHint}`] : [],
      },
      player: {
        ...player,
        currentRealm: granted.allocation.currentRealm,
        currentStage: granted.allocation.currentStage,
        currentLevel: granted.allocation.currentLevel,
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
            : "探索进行中有概率触发轻选择奇遇。",
        status: hasResolvedEvent ? "done" : hasExploredJi ? "active" : "pending",
        step_id: "resolve_event",
        title: "处理奇遇",
        unlock_hint: "探索进行中概率触发。",
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
        action_label: hasTower ? "查看九塔" : "支援玄铁塔",
        detail: hasTower
          ? "玄铁塔已有你的支援记录。"
          : "提交一次玄铁塔补给或守卫，理解九州对应九塔的全服目标。",
        status: hasTower ? "done" : hasAlchemy || forgeCount > 0 ? "active" : "pending",
        step_id: "seal_xuantie",
        title: "支援玄铁塔",
        unlock_hint: "需要行动令；仙魔抉择后可分别镇封或破阵。",
      },
      {
        action_hint: "task",
        action_label: hasClaimedChapterReward
          ? "查看下一章"
          : canClaimChapterReward
            ? "领取章节奖励"
            : "查看章节任务",
        detail: hasClaimedChapterReward
          ? "冀州初定章节奖励已领取，下一步可补洞府、炼器和 7 日目标。"
          : canClaimChapterReward
            ? "冀州初定已达成，先领取首章奖励。"
            : "前 30 分钟节点完成后领取首章奖励。",
        status: hasClaimedChapterReward ? "done" : canClaimChapterReward ? "active" : "pending",
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

  private async grantCultivation(
    tx: Tx,
    player: PlayerWithCore,
    gain: bigint,
    progressData: Prisma.PlayerProgressUpdateInput = {},
  ) {
    const allocation = allocateCultivation(
      {
        currentRealm: player.currentRealm,
        currentStage: player.currentStage,
        currentLevel: player.currentLevel,
        cultivationValue: player.progress.cultivationValue,
      },
      gain,
    );
    const playerChanged =
      allocation.currentRealm !== player.currentRealm ||
      allocation.currentStage !== player.currentStage ||
      allocation.currentLevel !== player.currentLevel;
    const updatedPlayer = playerChanged
      ? await tx.player.update({
          where: { playerId: player.playerId },
          data: {
            currentRealm: allocation.currentRealm,
            currentStage: allocation.currentStage,
            currentLevel: allocation.currentLevel,
          },
          include: { progress: true, wallet: true },
        })
      : player;
    const updatedProgress = await tx.playerProgress.update({
      where: { playerId: player.playerId },
      data: {
        ...progressData,
        cultivationValue: allocation.cultivationValue,
      },
    });
    return {
      allocation,
      progress: updatedProgress,
      player: {
        ...updatedPlayer,
        currentRealm: allocation.currentRealm,
        currentStage: allocation.currentStage,
        currentLevel: allocation.currentLevel,
        progress: updatedProgress,
      } as PlayerWithCore,
    };
  }

  private async applyReward(
    tx: Tx,
    playerId: string,
    rewards: RewardBundle,
    source: { sourceType: string; sourceId?: string; idempotencyKey?: string },
  ) {
    const cultivation = BigInt(rewards.cultivation ?? "0");
    if (cultivation > 0n) {
      const player = await this.requirePlayerInTx(tx, playerId);
      await this.grantCultivation(tx, player, cultivation);
    }
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
      context: ExploreEventLinkContext;
      playerId: string;
      province: ProvinceSummary;
      record: ExploreActionRecord;
      triggeredAt: Date;
    },
  ): Promise<ExploreEventRecord> {
    const existing = await tx.exploreEventRecord.findUnique({
      where: { exploreRecordId: input.record.recordId },
    });
    if (existing) {
      return existing;
    }

    const config = pickExploreEventConfig(
      input.record.recordId,
      input.province.province_id,
      input.context,
    );
    const linkHint = formatExploreEventLinkHint(input.context);
    const eventPlayer = await tx.player.findUniqueOrThrow({ where: { playerId: input.playerId } });
    const choices = config.choices.map((choice) => {
      if (BigInt(choice.rewards.cultivation ?? "0") <= 0n) return choice;
      const cultivation = getEventCultivationReward(eventPlayer.currentRealm);
      return {
        ...choice,
        rewardPreview: `修为 ${cultivation}`,
        rewards: { ...choice.rewards, cultivation: String(cultivation) },
      };
    });
    return tx.exploreEventRecord.upsert({
      where: { exploreRecordId: input.record.recordId },
      create: {
        eventId: `explore_event_${randomUUID()}`,
        playerId: input.playerId,
        eraId: defaultEraId,
        exploreRecordId: input.record.recordId,
        provinceId: input.province.province_id,
        provinceName: input.province.name,
        eventType: config.eventType,
        title: config.title,
        description: `${input.province.name}途中，${config.description}${linkHint}`,
        choices: choices as unknown as Prisma.InputJsonValue,
        status: "pending",
        triggeredAt: input.triggeredAt,
        autoResolveAt: new Date(input.triggeredAt.getTime() + exploreEventAutoResolveMilliseconds),
        configVersion: "p3_explore_event_link_v2",
        rulesetVersion: "ruleset_p3_exploration_v1",
        rewardConfigVersion: "reward_p1_7_v1",
      },
      update: {},
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

    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const replay = await this.prisma.idempotencyRecord.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!replay) {
        throw error;
      }
      if (
        replay.accountId !== input.accountId ||
        replay.endpoint !== input.endpoint ||
        replay.requestHash !== requestHash
      ) {
        throw new BadRequestException("幂等键已被其他请求使用");
      }
      return replay.responseData as unknown as TResponse;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function toCultivationStatus(input: {
  player: Pick<Player, "route" | "currentRealm" | "currentStage" | "currentLevel">;
  progress: PlayerProgress;
  breakthroughSupportValue?: number;
}): CultivationStatus {
  const realmConfig = getRealmConfig(input.player.currentRealm);
  const breakthroughRequirement = BigInt(realmConfig.breakthroughCultivation);
  const breakthroughSupport = BigInt(
    Math.min(
      Math.max(0, Math.trunc(input.breakthroughSupportValue ?? 0)),
      Number(breakthroughRequirement),
    ),
  );
  const effectiveBreakthroughRequirement =
    breakthroughRequirement > breakthroughSupport
      ? breakthroughRequirement - breakthroughSupport
      : 0n;
  const nextRealm =
    input.player.currentRealm < maximumRealm ? getRealmConfig(input.player.currentRealm + 1) : null;
  const unlocks = getRealmUnlockStates(input.player.currentRealm);
  const stageConfig = getRealmStageConfig(
    input.player.currentRealm,
    input.player.currentStage,
    input.player.route === "body" ? "body" : "qi",
  );
  const stageLevelCount = getStageLevelCount(input.player.currentRealm);
  const currentLevelRequired = getLevelRequirement(
    input.player.currentRealm,
    input.player.currentStage,
    input.player.currentLevel,
  );
  const cultivationToNextLevel =
    currentLevelRequired > input.progress.cultivationValue
      ? currentLevelRequired - input.progress.cultivationValue
      : 0n;
  return {
    cultivation_value: input.progress.cultivationValue.toString(),
    current_realm: input.player.currentRealm,
    current_realm_name: getRealmName(input.player.currentRealm, input.player.route),
    next_realm_name: nextRealm
      ? input.player.route === "body"
        ? nextRealm.bodyName
        : nextRealm.qiName
      : null,
    maximum_realm: maximumRealm,
    realm_power_bonus_percent: realmConfig.powerBonusPercent,
    current_stage: input.player.currentStage,
    current_stage_name: stageConfig.qiName,
    current_stage_level_count: stageLevelCount,
    current_level: input.player.currentLevel,
    current_level_required: currentLevelRequired.toString(),
    cultivation_to_next_level: cultivationToNextLevel.toString(),
    current_stage_progress: `${input.player.currentLevel}/${stageLevelCount}`,
    claimable_cultivation: calculateClaimableCultivation(input.progress).toString(),
    catchup_bonus_rate: input.progress.catchupBonusRate,
    last_cultivation_at: input.progress.lastCultivationAt.toISOString(),
    can_breakthrough:
      input.player.currentRealm < maximumRealm &&
      input.player.currentStage >= stagesPerRealm &&
      input.player.currentLevel >= stageLevelCount &&
      input.progress.cultivationValue >= effectiveBreakthroughRequirement,
    breakthrough_required: breakthroughRequirement.toString(),
    breakthrough_support: breakthroughSupport.toString(),
    effective_breakthrough_required: effectiveBreakthroughRequirement.toString(),
    unlocked_features: unlocks.filter((feature) => feature.unlocked),
    next_unlock_features: unlocks.filter(
      (feature) => feature.required_realm === input.player.currentRealm + 1,
    ),
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

function normalizeBattleResultFilter(
  input: string | undefined,
): BattleSummary["result"] | undefined {
  if (!input) {
    return undefined;
  }
  if (input === "win" || input === "lose") {
    return input;
  }

  throw new BadRequestException("战报结果筛选无效");
}

function normalizeOptionalTextFilter(input: string | undefined): string | undefined {
  const value = input?.trim();
  return value ? value : undefined;
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
    event_trigger_at: record.eventTriggerAt?.toISOString() ?? null,
    completes_at: record.completesAt.toISOString(),
    claimed_at: record.claimedAt?.toISOString() ?? null,
    can_claim: record.status === "completed" && !record.claimedAt,
    explore_boost_percent: record.exploreBoostPercent,
    action_state: actionState,
    battles,
    rewards,
    completed_task_ids: completedTaskIds,
    experience,
    event: event ? toExploreEventState(event) : null,
    linked_event_hint: event ? `${event.title}已出现，可在今日修行的探索奇遇中处理。` : null,
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
    prerequisite_hint: config?.prerequisiteHint ?? "探索进行中可能出现。",
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
    triggered_at: record.triggeredAt?.toISOString() ?? null,
    auto_resolve_at: record.autoResolveAt?.toISOString() ?? null,
    resolution_mode:
      record.resolutionMode === "manual" || record.resolutionMode === "auto"
        ? record.resolutionMode
        : null,
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

export function planExploreEvent(
  recordId: string,
  startedAt: Date,
  totalSeconds: number,
  forceTrigger = false,
): ExploreEventPlan | null {
  const chance = stableExploreEventNumber(`${recordId}:chance`) % 100;
  if (!forceTrigger && chance >= exploreEventTriggerChancePercent) {
    return null;
  }

  const durationMilliseconds = Math.max(1_000, totalSeconds * 1_000);
  const timingPercent = 35 + (stableExploreEventNumber(`${recordId}:timing`) % 31);
  const triggerOffset = Math.round((durationMilliseconds * timingPercent) / 100);
  return { triggerAt: new Date(startedAt.getTime() + triggerOffset) };
}

function stableExploreEventNumber(seed: string): number {
  return createHash("sha256").update(seed).digest().readUInt32BE(0);
}

export function pickAutomaticExploreEventChoice(
  choices: ExploreEventChoiceConfig[],
): ExploreEventChoiceConfig | null {
  return (
    choices.find((choice) => {
      try {
        return BigInt(choice.rewards.cultivation ?? "0") > 0n;
      } catch {
        return false;
      }
    }) ??
    choices[0] ??
    null
  );
}

function pickExploreEventConfig(
  seed: string,
  provinceId: string,
  context: ExploreEventLinkContext = { itemIds: [], traits: [] },
): ExploreEventConfig {
  const candidates = exploreEventConfigs.filter(
    (config) => !config.provinceIds || config.provinceIds.includes(provinceId),
  );
  const eventPool = candidates.length ? candidates : exploreEventConfigs;
  const weightedPool = eventPool.flatMap((config) => {
    const weight = getExploreEventLinkWeight(config.eventType, context);
    return Array.from({ length: weight }, () => config);
  });
  const sum = Array.from(`${seed}:${context.traits.join(",")}:${context.itemIds.join(",")}`).reduce(
    (value, char) => value + char.charCodeAt(0),
    0,
  );
  return (
    weightedPool[sum % weightedPool.length] ??
    eventPool[sum % eventPool.length] ??
    exploreEventConfigs[0]
  );
}

interface ExploreEventLinkContext {
  traits: string[];
  itemIds: string[];
}

function buildPlannedExploreEventLinkContext(
  provinceId: string,
  recordId: string,
  count: number,
): ExploreEventLinkContext {
  const traits = new Set<string>();
  const itemIds = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const enemy = selectExploreEnemy(provinceId, recordId, index);
    if (!enemy) {
      continue;
    }
    for (const trait of enemy.traits) {
      traits.add(trait);
    }
    itemIds.add(selectExploreLoot(provinceId, recordId, index, enemy.enemyId).itemId);
  }

  return { itemIds: [...itemIds], traits: [...traits] };
}

function exploreEventLinkContextFromJson(value: Prisma.JsonValue | null): ExploreEventLinkContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { itemIds: [], traits: [] };
  }
  const context = value as Partial<ExploreEventLinkContext>;
  return {
    itemIds: Array.isArray(context.itemIds)
      ? context.itemIds.filter((item): item is string => typeof item === "string")
      : [],
    traits: Array.isArray(context.traits)
      ? context.traits.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function getExploreEventLinkWeight(eventType: string, context: ExploreEventLinkContext): number {
  let weight = 1;
  const itemIds = new Set(context.itemIds);
  const traits = new Set(context.traits);

  if (
    eventType === "herb_trace" &&
    (itemIds.has("low_herb") || itemIds.has("pill_dust") || traits.has("毒蚀"))
  ) {
    weight += 3;
  }
  if (
    eventType === "ruin_echo" &&
    (itemIds.has("raw_iron") ||
      itemIds.has("artifact_soul") ||
      itemIds.has("inscription_rune") ||
      traits.has("高防"))
  ) {
    weight += 3;
  }
  if (
    eventType === "tower_rift" &&
    (itemIds.has("tower_sigil") || itemIds.has("array_sand") || traits.has("阵痕"))
  ) {
    weight += 4;
  }
  if (
    eventType === "wandering_caravan" &&
    (itemIds.has("spirit_wood") || itemIds.has("battle_mark") || traits.has("灵敏"))
  ) {
    weight += 2;
  }

  return weight;
}

function formatExploreEventLinkHint(context: ExploreEventLinkContext): string {
  const parts: string[] = [];
  if (context.traits.length) {
    parts.push(`受途中${context.traits.slice(0, 2).join("、")}气息牵引`);
  }
  if (context.itemIds.length) {
    parts.push("与前方材料线索相互呼应");
  }

  return parts.length ? ` ${parts.join("，")}。` : "";
}

function buildExploreEventExperience(
  event: ExploreEventRecord,
  choice: ExploreEventChoiceConfig,
  automatic = false,
): ResolveExploreEventResponse["experience"] {
  return buildJournalExperience({
    title: automatic ? `${event.title}已自动处理` : `${event.title}处理完成`,
    summary: automatic
      ? `久未选择，已代为择取“${choice.label}”：${choice.description}`
      : `${choice.label}：${choice.description}`,
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

function buildDailyRouteState(input: {
  actionState: ActionState;
  alchemyCountToday: number;
  cave: ReturnType<typeof toCaveState>;
  exploreRecord: ExploreActionRecord | null;
  pendingEvent: ExploreEventRecord | null;
  provinces: ProvinceSummary[];
  recentBattleCount: number;
  tasks: TaskState[];
  towerActionCountToday: number;
}): DailyRouteResponse {
  const claimableTasks = input.tasks.filter((task) => task.status === "completed");
  const unlockedProvince = input.provinces.find((province) => province.unlocked);
  const exploreStatus = input.exploreRecord
    ? normalizeExploreStatus(input.exploreRecord.status)
    : null;
  const canClaimExplore = exploreStatus === "completed" && !input.exploreRecord?.claimedAt;
  const hasRunningExplore = exploreStatus === "pending";
  const canExplore =
    Boolean(unlockedProvince) && !input.exploreRecord && input.actionState.action_points > 0;
  const hasRecentBattle = input.recentBattleCount > 0;
  const hasProducedToday = input.alchemyCountToday > 0;
  const hasTowerToday = input.towerActionCountToday > 0;

  const steps: DailyRouteStepState[] = [
    {
      action_hint: "task",
      action_label: claimableTasks.length ? "领取任务" : "查看任务",
      detail: claimableTasks.length
        ? `${claimableTasks
            .map((task) => task.title)
            .slice(0, 2)
            .join("、")} 等待领取。`
        : "任务会记录今日探索、奇遇、生产和九塔进度。",
      priority: 100,
      reason_tags: claimableTasks.length ? ["可领取"] : ["路线记录"],
      state_detail: claimableTasks.length
        ? "先领取已完成任务，收益入账后路线会继续向下推进。"
        : "当前没有可领取任务，查看任务进度不会阻塞今日路线。",
      state_label: claimableTasks.length ? "可领取" : "查看进度",
      source_detail: "来自今日任务与章节任务状态",
      status: claimableTasks.length ? "active" : "pending",
      step_id: "claim_task",
      target_tab: "overview",
      title: "先领已完成目标",
      view_state: claimableTasks.length ? "ready" : "jump",
    },
    {
      action_hint: "claim_explore",
      action_label: canClaimExplore ? "领取探索" : hasRunningExplore ? "等待探索完成" : "查看探索",
      detail: canClaimExplore
        ? `${input.exploreRecord?.provinceName ?? "州域"}探索已完成，可以领取战报与掉落。`
        : hasRunningExplore
          ? `${input.exploreRecord?.provinceName ?? "州域"}探索正在进行，完成后再领取奖励。`
          : "暂无待领取探索。",
      priority: canClaimExplore ? 96 : hasRunningExplore ? 60 : 20,
      reason_tags: canClaimExplore ? ["可领取", "战报"] : hasRunningExplore ? ["进行中"] : [],
      state_detail: canClaimExplore
        ? "领取后会写入战报、掉落和修行日志；途中触发的奇遇会独立提醒。"
        : hasRunningExplore
          ? "探索正在路上，倒计时结束后回到这里领取结果。"
          : "当前没有待领取探索，可从州域探索开始下一轮。",
      state_label: canClaimExplore ? "可领取" : hasRunningExplore ? "等待完成" : "已收束",
      source_detail: "来自当前探索队列",
      status: canClaimExplore ? "active" : hasRunningExplore ? "pending" : "done",
      step_id: "claim_explore",
      target_tab: "battle",
      title: canClaimExplore ? "领取探索战报" : "探索队列",
      view_state: canClaimExplore ? "ready" : hasRunningExplore ? "waiting" : "done",
    },
    {
      action_hint: "explore_event",
      action_label: input.pendingEvent ? "处理奇遇" : "等待奇遇",
      detail: input.pendingEvent
        ? `${input.pendingEvent.title}仍待选择，处理后会获得少量普通奖励。`
        : "探索进行中有概率出现轻选择奇遇。",
      priority: input.pendingEvent ? 94 : 28,
      reason_tags: input.pendingEvent ? ["可选择", "普通奖励"] : ["途中概率出现"],
      state_detail: input.pendingEvent
        ? "选择处理方式后会给少量普通奖励，并刷新今日下一步。"
        : "没有待处理奇遇时，这一步只作为探索途中的提醒。",
      state_label: input.pendingEvent ? "可处理" : "途中概率出现",
      source_detail: "来自探索事件链",
      status: input.pendingEvent ? "active" : "pending",
      step_id: "resolve_explore_event",
      target_tab: "overview",
      title: "处理探索奇遇",
      view_state: input.pendingEvent ? "ready" : "jump",
    },
    {
      action_hint: "collect_cave",
      action_label: input.cave.claimable_minutes > 0 ? "收取洞府" : "查看洞府",
      detail:
        input.cave.claimable_minutes > 0
          ? `洞府已有 ${input.cave.claimable_minutes} 分钟产出，可补灵石和普通材料。`
          : "洞府产出仍在积累，不需要卡点在线。",
      priority: input.cave.claimable_minutes > 0 ? 86 : 24,
      reason_tags: input.cave.claimable_minutes > 0 ? ["可收取"] : ["积累中"],
      state_detail:
        input.cave.claimable_minutes > 0
          ? "收取后可补充灵石和普通材料。"
          : "洞府还在积累，不需要停在页面等待。",
      state_label: input.cave.claimable_minutes > 0 ? "可收取" : "积累中",
      source_detail: "来自洞府离线产出",
      status: input.cave.claimable_minutes > 0 ? "active" : "pending",
      step_id: "collect_cave",
      target_tab: "growth",
      title: "收束洞府产出",
      view_state: input.cave.claimable_minutes > 0 ? "ready" : "jump",
    },
    {
      action_hint: "explore",
      action_label: canExplore ? "开始探索" : hasRunningExplore ? "探索进行中" : "等待行动令",
      detail: canExplore
        ? `${unlockedProvince?.name ?? "已开放州域"}可探索，行动令 ${input.actionState.action_points}/${input.actionState.action_point_cap}。`
        : hasRunningExplore
          ? "同一时间只能有一个探索队列，先等待当前探索完成。"
          : "行动令不足或州域尚未读取，先处理可领取收益。",
      priority: canExplore ? 82 : 22,
      reason_tags: canExplore ? ["可行动", "材料来源"] : ["条件不足"],
      state_detail: canExplore
        ? "开始探索会扣行动令，完成后手动领取战报和奖励。"
        : hasRunningExplore
          ? "当前探索完成前不能开启第二条队列。"
          : "行动令不足或州域未开放时，先处理可领取收益和任务进度。",
      state_label: canExplore ? "可出发" : hasRunningExplore ? "队列进行中" : "缺条件",
      source_detail: "来自行动令和州域开放状态",
      status: canExplore ? "active" : "pending",
      step_id: "start_explore",
      target_tab: "overview",
      title: "推进州域探索",
      view_state: canExplore ? "ready" : hasRunningExplore ? "waiting" : "blocked",
    },
    {
      action_hint: "growth",
      action_label: hasProducedToday ? "查看成长" : "炼丹炼器",
      detail: hasProducedToday
        ? "今日已完成生产，可继续服丹、看技能预设或准备九塔。"
        : hasRecentBattle
          ? "近期战报和掉落已产生，适合检查丹方、器方和技能预设。"
          : "完成探索后再根据材料缺口选择炼丹或炼器。",
      priority: hasRecentBattle && !hasProducedToday ? 76 : hasProducedToday ? 46 : 18,
      reason_tags: hasRecentBattle ? ["战报衔接"] : ["等待材料"],
      state_detail:
        hasRecentBattle && !hasProducedToday
          ? "战报和掉落已产生，适合查看丹方、器方和技能预设。"
          : hasProducedToday
            ? "今日生产已完成，可继续服丹、看技能或准备九塔。"
            : "还没有足够战报线索时，先完成探索获取材料。",
      state_label:
        hasRecentBattle && !hasProducedToday ? "可成长" : hasProducedToday ? "已完成" : "等材料",
      source_detail: "来自今日战报和生产记录",
      status:
        hasRecentBattle && !hasProducedToday ? "active" : hasProducedToday ? "done" : "pending",
      step_id: "production_growth",
      target_tab: "growth",
      title: "补生产与技能",
      view_state:
        hasRecentBattle && !hasProducedToday ? "ready" : hasProducedToday ? "done" : "jump",
    },
    {
      action_hint: "multiplayer",
      action_label: hasTowerToday ? "查看九塔" : "提交九塔",
      detail: hasTowerToday
        ? "今日已有九塔贡献，可回看塔状态或准备下一轮。"
        : "探索和生产后，把行动令投入对应州域九塔，理解自己改变了什么。",
      priority: hasTowerToday ? 42 : hasRecentBattle || hasProducedToday ? 70 : 16,
      reason_tags: hasTowerToday ? ["已完成"] : ["全服目标"],
      state_detail: hasTowerToday
        ? "今日已有九塔贡献，可回看本州塔状态。"
        : hasRecentBattle || hasProducedToday
          ? "探索或生产后可以提交一次九塔补给或守卫，留下公共目标贡献。"
          : "先完成探索或成长后再提交九塔，更容易理解贡献来源。",
      state_label: hasTowerToday
        ? "已贡献"
        : hasRecentBattle || hasProducedToday
          ? "可提交"
          : "稍后",
      source_detail: "来自九塔行动记录和今日战斗状态",
      status: hasTowerToday ? "done" : hasRecentBattle || hasProducedToday ? "active" : "pending",
      step_id: "tower_action",
      target_tab: "multiplayer",
      title: "九塔留痕",
      view_state: hasTowerToday ? "done" : hasRecentBattle || hasProducedToday ? "ready" : "jump",
    },
  ];
  const sortedSteps = steps.sort(
    (left, right) =>
      dailyRouteViewStateWeight(right.view_state) - dailyRouteViewStateWeight(left.view_state) ||
      right.priority - left.priority,
  );
  const primaryStep =
    sortedSteps.find((step) => step.view_state === "ready") ??
    sortedSteps.find((step) => step.view_state === "waiting") ??
    sortedSteps.find((step) => step.view_state === "jump") ??
    sortedSteps.find((step) => step.view_state === "blocked") ??
    sortedSteps[0];
  const doneCount = sortedSteps.filter((step) => step.status === "done").length;

  return {
    config_version: "daily_route_p3_v1",
    generated_at: new Date().toISOString(),
    next_refresh_hint: "完成任一行动后刷新路线；不需要固定时间在线。",
    primary_action_hint: primaryStep.action_hint,
    primary_step_id: primaryStep.step_id,
    progress_percent: Math.round((doneCount / sortedSteps.length) * 100),
    progress_text: `${doneCount}/${sortedSteps.length}`,
    route_id: "daily_practice_p3",
    steps: sortedSteps,
    subtitle: "按当前状态把可领取、可处理、可推进的行动排成一条路线。",
    title: "今日修行路线",
  };
}

function dailyRouteViewStateWeight(state: RouteStepViewState | undefined): number {
  const weights: Record<RouteStepViewState, number> = {
    blocked: 2,
    done: 1,
    jump: 3,
    ready: 5,
    waiting: 4,
  };
  return state ? weights[state] : 1;
}

function getActiveTaskResetKeys(): string[] {
  return [...new Set(getTaskDefinitions().map((definition) => definition.resetKey))];
}

function startOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
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

function applyExploreRewardBoost(rewards: RewardBundle, boostPercent: number): RewardBundle {
  const normalizedBoostPercent = BigInt(Math.max(0, Math.min(100, Math.trunc(boostPercent))));
  const boost = (value: string | undefined): string | undefined =>
    value === undefined
      ? undefined
      : ((BigInt(value) * (100n + normalizedBoostPercent)) / 100n).toString();

  return {
    ...rewards,
    cultivation: boost(rewards.cultivation),
    spirit_stone: boost(rewards.spirit_stone),
  };
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
