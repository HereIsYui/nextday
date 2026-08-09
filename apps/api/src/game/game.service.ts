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
  ActionCurrentResponse,
  ActionMutationResponse,
  ActionStartRequest,
  ActionOfflineRewardResponse,
  OfflineActionReward,
  BattleListResponse,
  BattleRoundLog,
  BattleSummary,
  BreakthroughResponse,
  CaveCollectResponse,
  CultivationClaimResponse,
  CultivationStatus,
  ExploreEventListResponse,
  ExploreEventState,
  ExploreRequest,
  GameOverviewResponse,
  JournalListResponse,
  PlayerProfileResponse,
  ProvinceSummary,
  RealmProgressionResponse,
  ResolveExploreEventRequest,
  ResolveExploreEventResponse,
  RewardBundle,
  TaskClaimResponse,
  TaskState,
  TaskSummaryResponse,
} from "@nextday/shared";
import {
  Prisma,
  type ExploreActionRecord,
  type ExploreEventRecord,
  type Player,
  type PlayerActionState,
  type PlayerCaveState,
  type PlayerProductionEffect,
  type PlayerProgress,
  type PlayerWallet,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { lockAccountForTransaction, lockPlayerForTransaction } from "../database/player-transaction";
import { buildJournalExperience, writeJournalFromResponse } from "../journal/journal.utils";
import { buildCaveCollectExperience } from "../platform/experience";
import { hashRequestBody } from "../platform/utils/hash";
import { toPlayerProfileResponse } from "../player/player.mapper";
import {
  allocateCultivation,
  calculateCultivationPower,
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
import { calculateUnifiedCombatPower, getCombatSkillSnapshot } from "./combat-skills";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type PlayerWithCore = Player & { progress: PlayerProgress; wallet: PlayerWallet };

interface LongExploreSettlement {
  record: ExploreActionRecord;
  rewards: RewardBundle;
  battles: BattleSummary[];
}

const exploreEventTriggerChancePercent = 35;
const exploreEventAutoResolveMilliseconds = 5 * 60 * 1000;
const exploreEventLifecycleIntervalMilliseconds = 5 * 1000;
const longActionHeartbeatGraceMilliseconds = 2 * 60 * 1000;
const longExploreSettlementMinutes = 60;
const longActionOfflineCapMinutes = 8 * 60;
const standardDailyExploreBattles = 21;
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
        this.getSettledActionState(player.playerId),
        this.getProvinceSummaries(player.playerId),
        this.getTasksByPlayerId(player.playerId),
        this.getCaveByPlayerId(player.playerId),
        this.prisma.battleLog.findMany({
          where: { playerId: player.playerId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);
    return {
      profile,
      cultivation,
      action_state: actionState,
      provinces,
      tasks,
      cave,
      recent_battles: recentBattles.map((battle) => toBattleSummary(battle)),
    };
  }

  async getCurrentAction(accountId: string): Promise<ActionCurrentResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    return this.prisma.$transaction(async (tx) => {
      await lockPlayerForTransaction(tx, player.playerId);
      await this.settleLongExplore(tx, player.playerId, new Date(), "status");
      const state = await tx.playerActionState.findUniqueOrThrow({
        where: { playerId: player.playerId },
      });
      return { action: await this.toLongActionState(tx, state) };
    });
  }

  private async getSettledActionState(playerId: string): Promise<ActionState> {
    return this.prisma.$transaction(async (tx) => {
      await lockPlayerForTransaction(tx, playerId);
      await this.settleLongExplore(tx, playerId, new Date(), "status");
      const actionState = await this.refreshActionState(playerId, tx);
      const state = await tx.playerActionState.findUniqueOrThrow({ where: { playerId } });
      const activeAction = await this.toLongActionState(tx, state);
      return { ...actionState, active_action: activeAction };
    });
  }

  async getOfflineActionReward(accountId: string): Promise<ActionOfflineRewardResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    return this.prisma.$transaction(async (tx) => {
      await lockPlayerForTransaction(tx, player.playerId);
      await this.settleLongExplore(tx, player.playerId, new Date(), "status");
      const state = await tx.playerActionState.findUniqueOrThrow({
        where: { playerId: player.playerId },
      });
      const snapshot = state.activeActionOfflineSnapshot;
      return {
        reward: snapshot && typeof snapshot === "object"
          ? (snapshot as unknown as OfflineActionReward)
          : null,
      };
    });
  }

  async claimOfflineAction(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<ActionMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/actions/offline-reward/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: {},
      handler: async (tx) => {
        const state = await tx.playerActionState.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        if (state.activeActionType !== "explore" || !state.activeActionId) {
          throw new BadRequestException("当前没有待领取的离线探索收益");
        }
        const snapshot = state.activeActionOfflineSnapshot;
        if (!snapshot || typeof snapshot !== "object") {
          throw new BadRequestException("当前没有待领取的离线探索收益");
        }
        const record = await tx.exploreActionRecord.findUniqueOrThrow({
          where: { recordId: state.activeActionId },
        });
        const minutes = normalizeOfflineSnapshotMinutes(snapshot);
        const settled = await this.settleExploreWindow(tx, player.playerId, record, minutes);
        const now = new Date();
        const updatedRecord = await tx.exploreActionRecord.update({
          where: { recordId: record.recordId },
          data: {
            lastSettledAt: now,
            lastActiveAt: now,
            offlineSnapshot: Prisma.JsonNull,
            offlineSnapshotAt: null,
            offlineSnapshotClaimedAt: now,
          },
        });
        const updatedState = await tx.playerActionState.update({
          where: { playerId: player.playerId },
          data: {
            activeActionLastActiveAt: now,
            activeActionSettledUntil: now,
            activeActionOfflineSnapshot: Prisma.JsonNull,
            activeActionOfflineSnapshotAt: null,
          },
        });
        const action = await this.toLongActionState(tx, updatedState, updatedRecord.provinceName);
        return {
          action,
          action_state: toActionState(updatedState, updatedRecord.provinceName),
          rewards: settled.rewards,
        };
      },
    });
  }

  private async settleLongExplore(
    tx: Tx,
    playerId: string,
    now: Date,
    mode: "status" | "end",
  ): Promise<LongExploreSettlement | null> {
    const state = await tx.playerActionState.findUnique({ where: { playerId } });
    if (state?.activeActionType !== "explore" || !state.activeActionId) {
      return null;
    }
    const record = await tx.exploreActionRecord.findUnique({
      where: { recordId: state.activeActionId },
    });
    if (!record || record.actionMode !== "long_term" || record.status === "ended") {
      return null;
    }
    // 状态查询在发现离线快照后必须保持幂等：快照等待领取期间，前端仍会
    // 轮询当前行动和离线收益接口，不能因为重复查询而返回 400。
    // 真正需要切换或结束行动的写操作会在各自入口阻止未领取快照。
    if (record.offlineSnapshot) {
      if (mode === "status") {
        return null;
      }
      throw new BadRequestException("请先领取离线行动收益");
    }

    const lastSettledAt = record.lastSettledAt ?? record.startedAt;
    const lastActiveAt = record.lastActiveAt ?? state.activeActionLastActiveAt ?? record.startedAt;
    const elapsedMinutes = Math.max(
      0,
      Math.floor((now.getTime() - lastSettledAt.getTime()) / 60_000),
    );
    const inactive = now.getTime() - lastActiveAt.getTime() > longActionHeartbeatGraceMilliseconds;

    if (mode === "status" && inactive) {
      const offlineMinutes = Math.min(longActionOfflineCapMinutes, elapsedMinutes);
      if (offlineMinutes <= 0) {
        await tx.exploreActionRecord.update({
          where: { recordId: record.recordId },
          data: { lastActiveAt: now },
        });
        await tx.playerActionState.update({
          where: { playerId },
          data: { activeActionLastActiveAt: now },
        });
        return null;
      }
      const loaded = await this.requirePlayerInTx(tx, playerId);
      const province = await this.getProvinceForPlayer(tx, playerId, record.provinceId);
      const snapshot = buildOfflineActionReward(
        record,
        offlineMinutes,
        lastSettledAt,
        now,
        loaded,
        province,
      );
      await tx.exploreActionRecord.update({
        where: { recordId: record.recordId },
        data: {
          offlineSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          offlineSnapshotAt: now,
        },
      });
      await tx.playerActionState.update({
        where: { playerId },
        data: {
          activeActionOfflineSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          activeActionOfflineSnapshotAt: now,
        },
      });
      return null;
    }

    const minutesToSettle = mode === "end"
      ? elapsedMinutes
      : elapsedMinutes >= longExploreSettlementMinutes
        ? elapsedMinutes
        : 0;
    let settled: LongExploreSettlement | null = null;
    if (minutesToSettle > 0) {
      settled = await this.settleExploreWindow(tx, playerId, record, minutesToSettle);
    }
    const nextSettledAt = minutesToSettle > 0
      ? new Date(lastSettledAt.getTime() + minutesToSettle * 60_000)
      : lastSettledAt;
    await tx.exploreActionRecord.update({
      where: { recordId: record.recordId },
      data: { lastSettledAt: nextSettledAt, lastActiveAt: now },
    });
    await tx.playerActionState.update({
      where: { playerId },
      data: {
        activeActionLastActiveAt: now,
        activeActionSettledUntil: nextSettledAt,
      },
    });
    return settled;
  }

  private async settleExploreWindow(
    tx: Tx,
    playerId: string,
    record: ExploreActionRecord,
    additionalMinutes: number,
  ): Promise<LongExploreSettlement> {
    const safeMinutes = Math.max(0, Math.floor(additionalMinutes));
    const previousMinutes = record.settledMinutes ?? 0;
    const previousBattles = record.settledBattleCount ?? record.count ?? 0;
    const totalMinutes = previousMinutes + safeMinutes;
    const targetBattles = Math.floor((totalMinutes * standardDailyExploreBattles) / 1_440);
    const newBattles = Math.max(0, targetBattles - previousBattles);
    const province = await this.getProvinceForPlayer(tx, playerId, record.provinceId);
    const loaded = await this.requirePlayerInTx(tx, playerId);
    const battles: BattleSummary[] = [];
    const rewardTotal: RewardBundle = { cultivation: "0", spirit_stone: "0", items: [] };
    let currentPlayer = loaded;
    let currentProgress = loaded.progress;
    for (let index = 0; index < newBattles; index += 1) {
      const battle = await this.resolveExploreBattle(
        tx,
        currentPlayer,
        currentProgress,
        province,
        record.recordId,
        previousBattles + index,
        record.exploreBoostPercent,
      );
      battles.push(battle.summary);
      currentPlayer = battle.player;
      currentProgress = battle.progress;
      mergeRewards(rewardTotal, battle.summary.rewards);
    }
    if (newBattles > 0) {
      await tx.playerProvinceProgress.update({
        where: { playerId_provinceId: { playerId, provinceId: province.province_id } },
        data: {
          explorationCount: { increment: newBattles },
          bestExploreStage: { increment: newBattles },
          lastActionAt: new Date(),
        },
      });
      await incrementPlayerTasks(tx, playerId, {
        novice_explore_ji: province.province_id === "ji" ? newBattles : 0,
        daily_explore: newBattles,
        weekly_explore_10: newBattles,
      });
    }
    const previousRewards = normalizeRewardBundle(record.rewardSnapshot);
    mergeRewards(previousRewards, rewardTotal);
    const updated = await tx.exploreActionRecord.update({
      where: { recordId: record.recordId },
      data: {
        settledMinutes: totalMinutes,
        settledBattleCount: targetBattles,
        count: targetBattles,
        rewardSnapshot: previousRewards as unknown as Prisma.InputJsonValue,
        battleSnapshot: battles.length
          ? ([...(Array.isArray(record.battleSnapshot) ? record.battleSnapshot : []), ...battles] as unknown as Prisma.InputJsonValue)
          : record.battleSnapshot ?? Prisma.JsonNull,
      },
    });
    return { record: updated, rewards: rewardTotal, battles };
  }

  async startAction(input: {
    accountId: string;
    body: ActionStartRequest;
    idempotencyKey: string;
  }): Promise<ActionMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const actionType = input.body?.action_type;
    if (actionType !== "cultivation" && actionType !== "explore") {
      throw new BadRequestException("行动类型只能是 cultivation 或 explore");
    }
    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/actions/start",
      idempotencyKey: input.idempotencyKey,
      requestBody: input.body,
      handler: async (tx) => {
        await this.ensureM2State(player.playerId, tx);
        await this.settleLongExplore(tx, player.playerId, new Date(), "status");
        const state = await tx.playerActionState.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        if (state.activeActionType && !state.activeActionEndedAt) {
          throw new BadRequestException("已有进行中的长期行动，请先手动结束");
        }
        if (state.activeActionType && state.activeActionEndedAt) {
          throw new BadRequestException("有待领取的长期行动收益，请先领取");
        }
        if (state.activeActionOfflineSnapshot) {
          throw new BadRequestException("有待领取的离线行动收益，请先领取");
        }
        const now = new Date();
        const actionId = `${actionType}_${randomUUID()}`;
        let provinceId: string | null = null;
        let provinceName: string | null = null;
        if (actionType === "explore") {
          const province = await this.getProvinceForPlayer(
            tx,
            player.playerId,
            input.body.province_id ?? "ji",
          );
          if (!province.unlocked) throw new BadRequestException("该州尚未开放");
          provinceId = province.province_id;
          provinceName = province.name;
          const existing = await this.findActiveExploreRecord(tx, player.playerId);
          if (existing) throw new BadRequestException("已有探索记录，请先结束或领取");
          const secondsPerExplore = provinceExploreSeconds[province.province_id] ?? 30;
          const totalSeconds = 0;
          await tx.exploreActionRecord.create({
            data: {
              recordId: actionId,
              playerId: player.playerId,
              eraId: defaultEraId,
              provinceId: province.province_id,
              provinceName: province.name,
              count: 0,
              actionMode: "long_term",
              settledMinutes: 0,
              settledBattleCount: 0,
              lastSettledAt: now,
              lastActiveAt: now,
              secondsPerExplore,
              totalSeconds,
              status: "active",
              startedAt: now,
              completesAt: now,
              eventTriggerAt: new Date(now.getTime() + 10 * 60 * 1000),
              eventContextSnapshot: buildPlannedExploreEventLinkContext(
                province.province_id,
                actionId,
                1,
              ) as unknown as Prisma.InputJsonValue,
              idempotencyKey: input.idempotencyKey,
              configVersion: "long_action_v1",
              rulesetVersion: "long_action_v1",
              rewardConfigVersion: "reward_p1_7_v1",
            },
          });
        }
        const updated = await tx.playerActionState.update({
          where: { playerId: player.playerId },
          data: {
            activeActionType: actionType,
            activeActionId: actionId,
            activeActionProvinceId: provinceId,
            activeActionStartedAt: now,
            activeActionEndedAt: null,
            activeActionRewardSnapshot: Prisma.JsonNull,
            activeActionLastActiveAt: now,
            activeActionSettledUntil: now,
            activeActionOfflineSnapshot: Prisma.JsonNull,
            activeActionOfflineSnapshotAt: null,
          },
        });
        const action = await this.toLongActionState(tx, updated, provinceName);
        if (!action) throw new Error("长期行动状态写入失败");
        return { action, action_state: toActionState(updated, provinceName), rewards: {} };
      },
    });
  }

  async endAction(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<ActionMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/actions/end",
      idempotencyKey: input.idempotencyKey,
      requestBody: {},
      handler: async (tx) => {
        // 结束行动也必须先走一次状态结算，确保页面关闭期间先生成离线快照，
        // 不会绕过 8 小时上限直接把整段离线时间当作在线收益发放。
        await this.settleLongExplore(tx, player.playerId, new Date(), "status");
        const state = await tx.playerActionState.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        if (!state.activeActionType || !state.activeActionId || !state.activeActionStartedAt) {
          throw new BadRequestException("当前没有进行中的长期行动");
        }
        if (state.activeActionOfflineSnapshot) {
          throw new BadRequestException("请先领取离线行动收益");
        }
        if (state.activeActionEndedAt) {
          const action = await this.toLongActionState(tx, state);
          if (!action) throw new Error("长期行动状态缺失");
          return { action, action_state: toActionState(state), rewards: {} };
        }
        const endedAt = new Date();
        let rewards: RewardBundle = {};
        let provinceName: string | null = null;
        if (state.activeActionType === "cultivation") {
          const loaded = await this.requirePlayerInTx(tx, player.playerId);
          const elapsedHours = Math.min(
            maxOfflineCultivationHours,
            Math.max(0, (endedAt.getTime() - state.activeActionStartedAt.getTime()) / 3_600_000),
          );
          const base = BigInt(Math.floor(elapsedHours * loaded.progress.cultivationRatePerHour));
          const bonus = (base * BigInt(loaded.progress.catchupBonusRate)) / 100n;
          rewards = { cultivation: (base + bonus).toString() };
        } else {
          const record = await tx.exploreActionRecord.findUniqueOrThrow({
            where: { recordId: state.activeActionId },
          });
          provinceName = record.provinceName;
          const settled = await this.settleLongExplore(tx, player.playerId, endedAt, "end");
          rewards = settled?.rewards ?? {};
          await tx.exploreActionRecord.update({
            where: { recordId: record.recordId },
            data: { status: "ended", completesAt: endedAt, lastActiveAt: endedAt },
          });
          const cleared = await tx.playerActionState.update({
            where: { playerId: player.playerId },
            data: {
              activeActionType: null,
              activeActionId: null,
              activeActionProvinceId: null,
              activeActionStartedAt: null,
              activeActionEndedAt: null,
              activeActionRewardSnapshot: Prisma.JsonNull,
              activeActionLastActiveAt: null,
              activeActionSettledUntil: null,
              activeActionOfflineSnapshot: Prisma.JsonNull,
              activeActionOfflineSnapshotAt: null,
            },
          });
          const actionState = toActionState(cleared);
          return { action: null, action_state: actionState, rewards };
        }
        const updated = await tx.playerActionState.update({
          where: { playerId: player.playerId },
          data: {
            activeActionEndedAt: endedAt,
            activeActionRewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
          },
        });
        const action = await this.toLongActionState(tx, updated, provinceName);
        if (!action) throw new Error("长期行动状态写入失败");
        return { action, action_state: toActionState(updated, provinceName), rewards };
      },
    });
  }

  async claimAction(input: {
    accountId: string;
    idempotencyKey: string;
  }): Promise<ActionMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const currentState = await this.prisma.playerActionState.findUniqueOrThrow({
      where: { playerId: player.playerId },
    });
    if (currentState.activeActionType === "explore") {
      throw new BadRequestException("探索在线收益会自动结算，结束探索时无需领取行动收益");
    }
    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/game/actions/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: {},
      handler: async (tx) => {
        const state = await tx.playerActionState.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        if (!state.activeActionType || !state.activeActionId || !state.activeActionEndedAt) {
          throw new BadRequestException("行动尚未结束");
        }
        const loaded = await this.requirePlayerInTx(tx, player.playerId);
        let rewards =
          state.activeActionRewardSnapshot && typeof state.activeActionRewardSnapshot === "object"
            ? normalizeRewardBundle(state.activeActionRewardSnapshot)
            : {};
        if (state.activeActionType === "cultivation") {
          const gained = BigInt(rewards.cultivation ?? "0");
          const granted = await this.grantCultivation(tx, loaded, gained, {
            lastCultivationAt: new Date(),
          });
          rewards = { ...rewards, cultivation: gained.toString() };
          const updatedState = await tx.playerActionState.update({
            where: { playerId: player.playerId },
            data: {
              activeActionType: null,
              activeActionId: null,
              activeActionProvinceId: null,
              activeActionStartedAt: null,
              activeActionEndedAt: null,
              activeActionRewardSnapshot: Prisma.JsonNull,
              activeActionLastActiveAt: null,
              activeActionSettledUntil: null,
              activeActionOfflineSnapshot: Prisma.JsonNull,
              activeActionOfflineSnapshotAt: null,
            },
          });
          const action = await this.toLongActionState(tx, updatedState);
          return { action, action_state: toActionState(updatedState), rewards };
        }
        throw new BadRequestException("探索行动请先结束并领取");
      },
    });
  }

  private async toLongActionState(
    tx: DbClient,
    state: PlayerActionState,
    provinceName?: string | null,
  ) {
    if (!state.activeActionType || !state.activeActionId || !state.activeActionStartedAt)
      return null;
    let resolvedProvinceName = provinceName ?? null;
    if (!resolvedProvinceName && state.activeActionProvinceId) {
      const province = await tx.provinceState.findFirst({
        where: { eraId: defaultEraId, provinceId: state.activeActionProvinceId },
        select: { name: true },
      });
      resolvedProvinceName = province?.name ?? null;
    }
    const exploreRecord = state.activeActionType === "explore"
      ? await tx.exploreActionRecord.findUnique({ where: { recordId: state.activeActionId } })
      : null;
    const offlineReward = exploreRecord?.offlineSnapshot && typeof exploreRecord.offlineSnapshot === "object"
      ? (exploreRecord.offlineSnapshot as unknown as OfflineActionReward)
      : state.activeActionOfflineSnapshot && typeof state.activeActionOfflineSnapshot === "object"
        ? (state.activeActionOfflineSnapshot as unknown as OfflineActionReward)
        : null;
    return {
      action_id: state.activeActionId,
      action_type: state.activeActionType as "cultivation" | "explore",
      status: state.activeActionEndedAt ? ("claimable" as const) : ("active" as const),
      province_id: state.activeActionProvinceId,
      province_name: resolvedProvinceName,
      started_at: state.activeActionStartedAt.toISOString(),
      ended_at: state.activeActionEndedAt?.toISOString() ?? null,
      can_end: !state.activeActionEndedAt,
      can_claim: Boolean(state.activeActionEndedAt),
      rewards:
        state.activeActionRewardSnapshot && typeof state.activeActionRewardSnapshot === "object"
          ? normalizeRewardBundle(state.activeActionRewardSnapshot)
          : null,
      settled_minutes: exploreRecord?.settledMinutes ?? 0,
      settled_battle_count: exploreRecord?.settledBattleCount ?? 0,
      last_settled_at:
        exploreRecord?.lastSettledAt?.toISOString() ?? state.activeActionSettledUntil?.toISOString() ?? null,
      last_active_at:
        exploreRecord?.lastActiveAt?.toISOString() ?? state.activeActionLastActiveAt?.toISOString() ?? null,
      offline_reward: offlineReward,
    };
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
        const actionState = await tx.playerActionState.findUniqueOrThrow({
          where: { playerId: loaded.playerId },
        });
        if (actionState.activeActionType) {
          throw new BadRequestException("当前有长期行动，请先结束并领取行动收益");
        }
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
        const actionState = await tx.playerActionState.findUniqueOrThrow({
          where: { playerId: loaded.playerId },
        });
        if (actionState.activeActionType) {
          throw new BadRequestException("当前有长期行动，请先结束并领取行动收益");
        }
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
  }): Promise<ActionMutationResponse> {
    if (Object.prototype.hasOwnProperty.call(input.body ?? {}, "count")) {
      throw new BadRequestException("探索已改为长期行动，不再接受探索次数");
    }
    return this.startAction({
      accountId: input.accountId,
      body: { action_type: "explore", province_id: input.body?.province_id },
      idempotencyKey: input.idempotencyKey,
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

        const claimed = await tx.playerTaskState.updateMany({
          where: { taskStateId: task.taskStateId, status: "completed" },
          data: { status: "claimed" },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException("任务未完成或已领取");
        }

        const rewards = normalizeRewardBundle(task.rewardSnapshot);
        await this.applyReward(tx, player.playerId, rewards, {
          sourceType: "task_claim",
          sourceId: task.taskId,
          idempotencyKey: input.idempotencyKey,
        });
        const claimedTask = await tx.playerTaskState.findUniqueOrThrow({
          where: { taskStateId: task.taskStateId },
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

        const claimed = await tx.playerCaveState.updateMany({
          where: { playerId: player.playerId, lastCollectedAt: cave.lastCollectedAt },
          data: { lastCollectedAt: new Date() },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException("洞府收益已领取");
        }

        await this.applyReward(tx, player.playerId, rewards, {
          sourceType: "cave_collect",
          sourceId: player.playerId,
          idempotencyKey: input.idempotencyKey,
        });
        const updatedCave = await tx.playerCaveState.findUniqueOrThrow({
          where: { playerId: player.playerId },
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

    if (recoveredPoints === state.actionPoints && recoveredPoints < state.actionPointCap) {
      return toActionState(state, await this.actionProvinceName(tx, state.activeActionProvinceId));
    }

    const updated = await tx.playerActionState.update({
      where: { playerId },
      data: {
        actionPoints: recoveredPoints,
        lastRecoveredAt: new Date(),
      },
    });

    return toActionState(
      updated,
      await this.actionProvinceName(tx, updated.activeActionProvinceId),
    );
  }

  private async actionProvinceName(
    tx: DbClient,
    provinceId: string | null,
  ): Promise<string | null> {
    if (!provinceId) return null;
    const province = await tx.provinceState.findFirst({
      where: { eraId: defaultEraId, provinceId },
      select: { name: true },
    });
    return province?.name ?? null;
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
            eventRecord: { is: null },
            eventTriggerAt: { lte: now },
            actionMode: "long_term",
            status: { in: ["active", "pending"] },
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
      const record = activeRecord;

      if (
        record &&
        ["active", "pending"].includes(record.status) &&
        (record.settledBattleCount ?? 0) > 0 &&
        record.eventTriggerAt &&
        record.eventTriggerAt.getTime() <= now.getTime()
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
        actionMode: "long_term",
        status: { in: ["active", "offline_claimable", "pending"] },
      },
      orderBy: { createdAt: "desc" },
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

    const equipped = await tx.equipmentInstance.findMany({
      where: { playerId: player.playerId, status: "active", equippedSlot: { not: null } },
      include: { affixes: true },
    });
    const equipmentPower = equipped.reduce(
      (sum, item) => sum + item.affixes.reduce((affixSum, affix) => affixSum + affix.value, 0),
      0,
    );
    const loadout = await tx.playerSkillLoadout.findUnique({
      where: { playerId: player.playerId },
    });
    const skillSnapshot = getCombatSkillSnapshot({
      route: player.route,
      loadout,
      enemyTraits: enemy.traits,
    });
    const basePower = calculateCultivationPower(
      player.currentRealm,
      player.currentStage,
      player.currentLevel,
    );
    const playerPower = calculateUnifiedCombatPower({
      basePower,
      equipmentPower: Math.floor(equipmentPower / 4),
      skillSnapshot,
    });
    const result: BattleSummary["result"] = playerPower >= enemy.enemyPower ? "win" : "lose";
    const damageDone = result === "win" ? enemy.enemyPower + player.currentLevel * 12 : playerPower;
    const damageTaken =
      result === "win"
        ? Math.max(8, Math.floor(enemy.enemyPower / 3 * skillSnapshot.defenseMultiplier))
        : Math.max(1, Math.floor(enemy.enemyPower * skillSnapshot.defenseMultiplier));
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

    const battleLog: BattleRoundLog[] = createBattleRoundLog({
      playerName: player.name,
      enemyName: enemy.enemyName,
      damageDone,
      damageTaken,
      result,
      activeSkillName: skillSnapshot.activeSkillName,
      activeSkillId: skillSnapshot.activeSkillId,
      enemySkillName: enemy.skillName,
      treasureSkillName: skillSnapshot.treasureSkillName,
      treasureSkillId: skillSnapshot.treasureSkillId,
      skillEffect: skillSnapshot.reason,
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
        reason_summary: [
          ...(summary.reason_summary ?? []),
          skillSnapshot.reason,
        ],
        battle_hint: buildExploreBattleHint({
          enemyName: enemy.enemyName,
          enemyTraits: enemy.traits,
          loot: loot ?? undefined,
          result,
        }) + `；${skillSnapshot.activeSkillName}与${skillSnapshot.treasureSkillName}已生效`,
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
        await lockAccountForTransaction(tx, input.accountId);
        const concurrentRecord = await tx.idempotencyRecord.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (concurrentRecord) {
          if (
            concurrentRecord.accountId !== input.accountId ||
            concurrentRecord.endpoint !== input.endpoint ||
            concurrentRecord.requestHash !== requestHash
          ) {
            throw new BadRequestException("幂等键已被其他请求使用");
          }
          return concurrentRecord.responseData as unknown as TResponse;
        }
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

function buildOfflineActionReward(
  record: ExploreActionRecord,
  offlineMinutes: number,
  fromAt: Date,
  now: Date,
  player: Pick<Player, "currentRealm" | "currentStage" | "currentLevel">,
  province: ProvinceSummary,
): OfflineActionReward {
  const previousMinutes = record.settledMinutes ?? 0;
  const previousBattles = record.settledBattleCount ?? record.count ?? 0;
  const totalMinutes = previousMinutes + offlineMinutes;
  const estimatedBattleCount = Math.max(
    0,
    Math.floor((totalMinutes * standardDailyExploreBattles) / 1_440) - previousBattles,
  );
  const rewards: RewardBundle = { cultivation: "0", spirit_stone: "0", items: [] };
  const config = provinceConfigs.find((item) => item.provinceId === province.province_id);
  for (let index = 0; index < estimatedBattleCount; index += 1) {
    const battleIndex = previousBattles + index;
    const enemy = selectExploreEnemy(province.province_id, record.recordId, battleIndex) ?? {
      enemyPower: config?.enemyPower ?? 0,
      enemyId: config?.enemyId ?? "unknown",
    };
    const result =
      calculateCultivationPower(
        player.currentRealm,
        player.currentStage,
        player.currentLevel,
      ) >= enemy.enemyPower
        ? "win"
        : "lose";
    const loot =
      result === "win"
        ? selectExploreLoot(province.province_id, record.recordId, battleIndex, enemy.enemyId)
        : null;
    mergeRewards(rewards, {
      cultivation: String(getExploreCultivationReward(player.currentRealm, result)),
      spirit_stone: result === "win" ? "35" : "8",
      items: loot ? [{ item_id: loot.itemId, name: loot.name, count: 1, bind_type: "bound" }] : [],
    });
  }
  return {
    action_id: record.recordId,
    action_type: "explore",
    province_name: record.provinceName,
    offline_minutes: offlineMinutes,
    from_at: fromAt.toISOString(),
    to_at: new Date(Math.min(now.getTime(), fromAt.getTime() + offlineMinutes * 60_000)).toISOString(),
    estimated_battle_count: estimatedBattleCount,
    rewards,
    claimable: true,
  };
}

function normalizeOfflineSnapshotMinutes(value: Prisma.JsonValue): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }
  const minutes = Number((value as Record<string, unknown>).offline_minutes ?? 0);
  return Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
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


function getActiveTaskResetKeys(): string[] {
  return [...new Set(getTaskDefinitions().map((definition) => definition.resetKey))];
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
  activeSkillId: string;
  enemySkillName: string;
  treasureSkillName: string;
  treasureSkillId: string;
  skillEffect: string;
}): BattleRoundLog[] {
  const enemyRemainingHp = Math.max(0, input.result === "win" ? 0 : input.damageTaken);

  return [
    {
      round: 1,
      actor: input.playerName,
      skill: input.activeSkillName,
      skill_id: input.activeSkillId,
      skill_effect: input.skillEffect,
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
      skill_id: input.treasureSkillId,
      skill_effect: input.skillEffect,
      damage: Math.ceil(input.damageDone * 0.45),
      target_hp: enemyRemainingHp,
    },
  ];
}


function sortProvincesByConfig<T extends { provinceId: string }>(items: T[]): T[] {
  const order = new Map(provinceConfigs.map((province, index) => [province.provinceId, index]));
  return [...items].sort((left, right) => {
    const leftIndex = order.get(left.provinceId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.provinceId) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}
