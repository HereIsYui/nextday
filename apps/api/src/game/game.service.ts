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
  ExploreRequest,
  ExploreResponse,
  GameOverviewResponse,
  PlayerProfileResponse,
  ProvinceSummary,
  RewardBundle,
  TaskClaimResponse,
  TaskState,
  TaskSummaryResponse,
} from "@nextday/shared";
import type {
  Player,
  PlayerActionState,
  PlayerCaveState,
  PlayerProgress,
  PlayerSkillLoadout,
  PlayerWallet,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { buildCaveCollectExperience, buildExploreExperience } from "../platform/experience";
import { hashRequestBody } from "../platform/utils/hash";
import { toPlayerProfileResponse } from "../player/player.mapper";
import { getDefaultSkillLoadout, getSkillName } from "../production/production.constants";
import {
  createInitialTaskRows,
  defaultEraId,
  getTaskDefinitions,
  maxExploreBatch,
  maxOfflineCultivationHours,
  provinceConfigs,
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

  async getProvinces(accountId: string): Promise<{ provinces: ProvinceSummary[] }> {
    const player = await this.requirePlayer(accountId);
    await this.ensureM2State(player.playerId);
    return { provinces: await this.getProvinceSummaries(player.playerId) };
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
        const completedTaskIds = await this.incrementTasks(tx, loaded.playerId, {
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
        const response: BreakthroughResponse = {
          record_id: `breakthrough_${randomUUID()}`,
          success: true,
          message: "突破成功",
          profile,
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

        const actionState = await this.refreshActionState(loaded.playerId, tx);
        if (actionState.action_points < body.count) {
          throw new BadRequestException("行动令不足");
        }

        const afterActionState = await tx.playerActionState.update({
          where: { playerId: loaded.playerId },
          data: { actionPoints: actionState.action_points - body.count },
        });
        const battles: BattleSummary[] = [];
        const rewardTotal: RewardBundle = { cultivation: "0", spirit_stone: "0", items: [] };
        let currentPlayer = loaded;
        let currentProgress = loaded.progress;

        for (let index = 0; index < body.count; index += 1) {
          const battle = await this.resolveExploreBattle(
            tx,
            currentPlayer,
            currentProgress,
            province,
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
            explorationCount: { increment: body.count },
            bestExploreStage: { increment: body.count },
            lastActionAt: new Date(),
          },
        });
        const completedTaskIds = await this.incrementTasks(tx, loaded.playerId, {
          novice_explore_ji: province.province_id === "ji" ? body.count : 0,
          daily_explore: body.count,
          weekly_explore_10: body.count,
        });
        const response: ExploreResponse = {
          record_id: `explore_${randomUUID()}`,
          action_state: toActionState(afterActionState),
          battles,
          rewards: rewardTotal,
          completed_task_ids: completedTaskIds,
          experience: buildExploreExperience({
            provinceName: province.name,
            count: body.count,
            battles,
            rewards: rewardTotal,
            actionPointsAfter: afterActionState.actionPoints,
            completedTaskCount: completedTaskIds.length,
          }),
        };

        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: loaded.playerId,
          action: "explore",
          targetType: "province",
          targetId: province.province_id,
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
        const completedTaskIds = await this.incrementTasks(tx, player.playerId, {
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

    for (const task of createInitialTaskRows(playerId)) {
      await tx.playerTaskState.upsert({
        where: {
          playerId_taskId_resetKey: {
            playerId,
            taskId: task.taskId,
            resetKey: task.resetKey ?? "permanent",
          },
        },
        create: task,
        update: {},
      });
    }
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
  ): Promise<{
    summary: BattleSummary;
    player: PlayerWithCore;
    progress: PlayerProgress;
  }> {
    const config = provinceConfigs.find((item) => item.provinceId === province.province_id);
    if (!config) {
      throw new BadRequestException("未知探索目标");
    }

    const playerPower = player.currentRealm * 120 + player.currentLevel * 45;
    const result: BattleSummary["result"] = playerPower >= config.enemyPower ? "win" : "lose";
    const damageDone =
      result === "win" ? config.enemyPower + player.currentLevel * 12 : playerPower;
    const damageTaken =
      result === "win" ? Math.max(8, Math.floor(config.enemyPower / 3)) : config.enemyPower;
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
      enemyName: config.enemyName,
      damageDone,
      damageTaken,
      result,
      activeSkillName: skillNames.activeSkillName,
      treasureSkillName: skillNames.treasureSkillName,
    });
    const battle = await tx.battleLog.create({
      data: {
        battleId: `battle_${randomUUID()}`,
        playerId: player.playerId,
        eraId: defaultEraId,
        battleType: "explore",
        provinceId: province.province_id,
        enemyId: config.enemyId,
        enemyName: config.enemyName,
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

  private async incrementTasks(
    tx: Tx,
    playerId: string,
    increments: Record<string, number>,
  ): Promise<string[]> {
    const completedTaskIds: string[] = [];

    for (const [taskId, increment] of Object.entries(increments)) {
      if (increment <= 0) {
        continue;
      }

      const tasks = await tx.playerTaskState.findMany({
        where: { playerId, taskId, status: "in_progress" },
      });

      for (const task of tasks) {
        const nextValue = Math.min(task.targetValue, task.progressValue + increment);
        const nextStatus = nextValue >= task.targetValue ? "completed" : "in_progress";
        await tx.playerTaskState.update({
          where: { taskStateId: task.taskStateId },
          data: {
            progressValue: nextValue,
            status: nextStatus,
          },
        });

        if (nextStatus === "completed") {
          completedTaskIds.push(task.taskId);
        }
      }
    }

    return completedTaskIds;
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
      skill: "山海妖息",
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
