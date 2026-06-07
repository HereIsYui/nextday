import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  BagSummaryResponse,
  ExperiencePayload,
  InnerWorldAssignmentListResponse,
  InnerWorldClaimRequest,
  InnerWorldClaimResponse,
  InnerWorldDispatchRequest,
  InnerWorldDispatchResponse,
  InnerWorldStateSummary,
  InnerWorldSummaryResponse,
  InnerWorldSupportRequest,
  InnerWorldSupportResponse,
  InnerWorldSupportType,
  InnerWorldUpgradeRequest,
  InnerWorldUpgradeResponse,
  RewardBundle,
} from "@nextday/shared";
import type {
  InnerWorldAssignment,
  InnerWorldCreature,
  InnerWorldState,
  Player,
  PlayerProgress,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId, provinceConfigs } from "../game/game.constants";
import { towerConfigs } from "../multiplayer/multiplayer.constants";
import { hashRequestBody } from "../platform/utils/hash";
import { toBagItemState } from "../production/production.mappers";
import {
  getInnerWorldLevelConfig,
  getInnerWorldProvinceReward,
  innerWorldConfigVersion,
  innerWorldCreatureConfigs,
  innerWorldCreatureUpgradeCost,
  innerWorldDailySupportLimit,
  innerWorldDefaultAssignmentMinutes,
  innerWorldRewardConfigVersion,
  innerWorldSupportConfigs,
  innerWorldUnlockChapter,
  innerWorldUnlockRealm,
} from "./inner-world.constants";
import {
  toInnerWorldAssignmentState,
  toInnerWorldCreatureState,
  toInnerWorldLawRecordState,
  toInnerWorldStateSummary,
  toInnerWorldSupportRecordState,
} from "./inner-world.mappers";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type PlayerWithProgress = Player & { progress: PlayerProgress | null };

@Injectable()
export class InnerWorldService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSummary(accountId: string): Promise<InnerWorldSummaryResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureInnerWorldState(player.playerId);
    return this.buildSummary(player.playerId);
  }

  async getAssignments(accountId: string): Promise<InnerWorldAssignmentListResponse> {
    const player = await this.requirePlayer(accountId);
    await this.ensureInnerWorldState(player.playerId);
    const [assignments, supports] = await Promise.all([
      this.prisma.innerWorldAssignment.findMany({
        where: { playerId: player.playerId },
        include: { creature: true },
        orderBy: { startedAt: "desc" },
        take: 12,
      }),
      this.prisma.innerWorldSupportRecord.findMany({
        where: { playerId: player.playerId },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
    ]);

    return {
      assignments: assignments.map((assignment) =>
        toInnerWorldAssignmentState(assignment, assignment.creature),
      ),
      support_records: supports.map(toInnerWorldSupportRecordState),
    };
  }

  async dispatch(input: {
    accountId: string;
    body: InnerWorldDispatchRequest;
    idempotencyKey: string;
  }): Promise<InnerWorldDispatchResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeDispatchRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/inner-world/dispatch",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const context = await this.ensureInnerWorldState(player.playerId, tx);
        this.assertUnlocked(context.player);
        await this.assertProvinceOpened(tx, context.player, body.province_id);

        const activeCount = await tx.innerWorldAssignment.count({
          where: { playerId: player.playerId, status: "active" },
        });
        if (activeCount >= context.state.assignmentLimit) {
          throw new BadRequestException("内天地派驻队列已满，请先收取已完成派驻");
        }

        const creature = body.creature_id
          ? await tx.innerWorldCreature.findFirst({
              where: { playerId: player.playerId, creatureId: body.creature_id },
            })
          : await tx.innerWorldCreature.findFirst({
              where: { playerId: player.playerId, status: "idle" },
              orderBy: [{ level: "desc" }, { createdAt: "asc" }],
            });
        if (!creature || creature.status !== "idle") {
          throw new BadRequestException("暂无可派驻的空闲生灵");
        }

        const rewardConfig = getInnerWorldProvinceReward(body.province_id);
        const rewards = scaleAssignmentReward(rewardConfig.reward, creature, body.province_id);
        const lawExpGain =
          rewardConfig.lawExpGain + creature.level * 2 + affinityBonus(creature, body.province_id);
        const now = new Date();
        const assignment = await tx.innerWorldAssignment.create({
          data: {
            assignmentId: `inner_assignment_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            creatureId: creature.creatureId,
            provinceId: body.province_id,
            status: "active",
            startedAt: now,
            endsAt: new Date(now.getTime() + innerWorldDefaultAssignmentMinutes * 60 * 1000),
            rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
            lawExpGain,
            configVersion: innerWorldConfigVersion,
            rewardConfigVersion: innerWorldRewardConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        const updatedCreature = await tx.innerWorldCreature.update({
          where: { creatureId: creature.creatureId },
          data: { status: "assigned" },
        });
        const summary = await this.buildStateSummary(tx, player.playerId);

        return {
          record_id: assignment.assignmentId,
          state: summary,
          assignment: toInnerWorldAssignmentState(assignment, updatedCreature),
          creatures: (await this.getCreatures(tx, player.playerId)).map(toInnerWorldCreatureState),
          experience: buildInnerWorldExperience({
            title: "内天地派驻回放",
            summary: `${updatedCreature.name} 已派驻 ${provinceName(body.province_id)}，完成后可收取绑定材料和法则经验。`,
            rewards,
            lawExp: lawExpGain,
            tags: ["async_assignment", "bound_only"],
          }),
        };
      },
    });
  }

  async claim(input: {
    accountId: string;
    body: InnerWorldClaimRequest;
    idempotencyKey: string;
  }): Promise<InnerWorldClaimResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeClaimRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/inner-world/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const context = await this.ensureInnerWorldState(player.playerId, tx);
        this.assertUnlocked(context.player);
        const now = new Date();
        const where: Prisma.InnerWorldAssignmentWhereInput = {
          playerId: player.playerId,
          status: "active",
          endsAt: { lte: now },
        };
        if (body.assignment_id) {
          where.assignmentId = body.assignment_id;
        }
        const assignments = await tx.innerWorldAssignment.findMany({
          where,
          include: { creature: true },
          orderBy: { endsAt: "asc" },
        });
        if (assignments.length === 0) {
          throw new BadRequestException("暂无可收取的内天地派驻");
        }

        const rewards: RewardBundle = { items: [] };
        const lawExpGained = assignments.reduce((sum, assignment) => {
          mergeRewards(rewards, assignment.rewardSnapshot as unknown as RewardBundle);
          return sum + assignment.lawExpGain;
        }, 0);
        await this.grantBoundRewards(tx, player.playerId, rewards, "inner_world_assignment");

        const stateBefore = await tx.innerWorldState.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        const lawBefore = stateBefore.lawExp;
        const lawAfter = lawBefore + lawExpGained;
        const lawLevelAfter = Math.max(stateBefore.lawLevel, calculateLawLevel(lawAfter));
        await tx.innerWorldState.update({
          where: { playerId: player.playerId },
          data: { lawExp: lawAfter, lawLevel: lawLevelAfter },
        });
        for (const assignment of assignments) {
          await tx.innerWorldAssignment.update({
            where: { assignmentId: assignment.assignmentId },
            data: { status: "claimed", claimedAt: now },
          });
          await tx.innerWorldCreature.update({
            where: { creatureId: assignment.creatureId },
            data: { status: "idle" },
          });
          await tx.innerWorldLawRecord.create({
            data: {
              lawRecordId: `inner_law_${randomUUID()}`,
              playerId: player.playerId,
              eraId: defaultEraId,
              lawType: "五行",
              expDelta: assignment.lawExpGain,
              sourceType: "assignment",
              sourceId: assignment.assignmentId,
              beforeLevel: stateBefore.lawLevel,
              afterLevel: lawLevelAfter,
              beforeExp: lawBefore,
              afterExp: lawAfter,
              configVersion: innerWorldConfigVersion,
            },
          });
        }

        return {
          record_id: `inner_claim_${randomUUID()}`,
          state: await this.buildStateSummary(tx, player.playerId),
          assignments: assignments.map((assignment) =>
            toInnerWorldAssignmentState(
              { ...assignment, status: "claimed", claimedAt: now },
              assignment.creature,
            ),
          ),
          rewards,
          law_exp_gained: lawExpGained,
          bag: await this.getBagByPlayerId(tx, player.playerId),
          experience: buildInnerWorldExperience({
            title: "内天地收取回放",
            summary: `收取 ${assignments.length} 条派驻，法则经验 +${lawExpGained}。`,
            rewards,
            lawExp: lawExpGained,
            tags: ["async_claim", "bound_only"],
          }),
        };
      },
    });
  }

  async upgrade(input: {
    accountId: string;
    body: InnerWorldUpgradeRequest;
    idempotencyKey: string;
  }): Promise<InnerWorldUpgradeResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeUpgradeRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/inner-world/upgrade",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const context = await this.ensureInnerWorldState(player.playerId, tx);
        this.assertUnlocked(context.player);

        if (body.target_type === "world") {
          const levelConfig = getInnerWorldLevelConfig(context.state.worldLevel);
          const nextConfig = getInnerWorldLevelConfig(context.state.worldLevel + 1);
          if (nextConfig.level === context.state.worldLevel) {
            throw new BadRequestException("内天地已达到当前版本等级上限");
          }
          if (context.state.lawExp < levelConfig.nextLawExpRequired) {
            throw new BadRequestException("法则经验不足，无法升级内天地");
          }
          await this.consumeCost(tx, player.playerId, levelConfig.upgradeCost);
          await tx.innerWorldState.update({
            where: { playerId: player.playerId },
            data: {
              worldLevel: nextConfig.level,
              lawExp: context.state.lawExp - levelConfig.nextLawExpRequired,
              creatureCapacity: nextConfig.creatureCapacity,
              assignmentLimit: nextConfig.assignmentLimit,
            },
          });

          return {
            record_id: `inner_upgrade_${randomUUID()}`,
            state: await this.buildStateSummary(tx, player.playerId),
            cost: levelConfig.upgradeCost,
            experience: buildInnerWorldExperience({
              title: "内天地升级回放",
              summary: `内天地升至 ${nextConfig.level} 级，派驻队列和生灵容量提升。`,
              rewards: {},
              lawExp: -levelConfig.nextLawExpRequired,
              tags: ["growth_upgrade", "no_paid_output"],
            }),
          };
        }

        const creature = await tx.innerWorldCreature.findFirst({
          where: { playerId: player.playerId, creatureId: body.creature_id },
        });
        if (!creature || creature.status !== "idle") {
          throw new BadRequestException("只能培养空闲生灵");
        }
        await this.consumeCost(tx, player.playerId, innerWorldCreatureUpgradeCost);
        const updatedCreature = await tx.innerWorldCreature.update({
          where: { creatureId: creature.creatureId },
          data: { level: { increment: 1 } },
        });

        return {
          record_id: `inner_creature_upgrade_${randomUUID()}`,
          state: await this.buildStateSummary(tx, player.playerId),
          creature: toInnerWorldCreatureState(updatedCreature),
          cost: innerWorldCreatureUpgradeCost,
          experience: buildInnerWorldExperience({
            title: "生灵培养回放",
            summary: `${updatedCreature.name} 升至 ${updatedCreature.level} 级，派驻效率提高。`,
            rewards: {},
            lawExp: 0,
            tags: ["creature_growth", "no_paid_output"],
          }),
        };
      },
    });
  }

  async support(input: {
    accountId: string;
    body: InnerWorldSupportRequest;
    idempotencyKey: string;
  }): Promise<InnerWorldSupportResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeSupportRequest(input.body);
    const supportConfig = innerWorldSupportConfigs[body.support_type];

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/inner-world/support",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const context = await this.ensureInnerWorldState(player.playerId, tx);
        this.assertUnlocked(context.player);
        await this.assertProvinceOpened(tx, context.player, body.province_id);
        const state = await this.refreshDailySupport(tx, context.state);
        if (state.supportCountToday >= innerWorldDailySupportLimit) {
          throw new BadRequestException("今日九州支援次数已用完");
        }
        if (state.lawExp < supportConfig.lawExpCost) {
          throw new BadRequestException("法则经验不足，无法发起九州支援");
        }

        await this.grantBoundRewards(
          tx,
          player.playerId,
          supportConfig.reward,
          "inner_world_support",
        );
        const provinceDelta = getSupportProvinceDelta(
          body.support_type,
          supportConfig.contribution,
        );
        await tx.provinceState.update({
          where: { eraId_provinceId: { eraId: defaultEraId, provinceId: body.province_id } },
          data: provinceDelta,
        });
        await tx.innerWorldState.update({
          where: { playerId: player.playerId },
          data: {
            lawExp: { decrement: supportConfig.lawExpCost },
            supportCountToday: { increment: 1 },
          },
        });
        const towerId =
          body.support_type === "tower_supply"
            ? (towerConfigs.find((tower) => tower.provinceId === body.province_id)?.towerId ?? null)
            : null;
        const support = await tx.innerWorldSupportRecord.create({
          data: {
            supportRecordId: `inner_support_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            provinceId: body.province_id,
            towerId,
            supportType: body.support_type,
            costSummary: { law_exp: supportConfig.lawExpCost } as Prisma.InputJsonValue,
            rewardSummary: supportConfig.reward as unknown as Prisma.InputJsonValue,
            contributionSummary: {
              contribution: supportConfig.contribution,
              effect: body.support_type,
            } as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
            configVersion: innerWorldConfigVersion,
            rewardConfigVersion: innerWorldRewardConfigVersion,
          },
        });

        return {
          record_id: support.supportRecordId,
          state: await this.buildStateSummary(tx, player.playerId),
          support: toInnerWorldSupportRecordState(support),
          bag: await this.getBagByPlayerId(tx, player.playerId),
          experience: buildInnerWorldExperience({
            title: "九州支援回放",
            summary: `${supportConfig.label}已提交至${provinceName(body.province_id)}，只产出绑定材料和个人贡献摘要。`,
            rewards: supportConfig.reward,
            lawExp: -supportConfig.lawExpCost,
            tags: ["province_support", "bound_only"],
          }),
        };
      },
    });
  }

  private async buildSummary(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<InnerWorldSummaryResponse> {
    const [state, player, creatures, assignments, lawRecords, supportRecords] = await Promise.all([
      tx.innerWorldState.findUniqueOrThrow({ where: { playerId } }),
      tx.player.findUniqueOrThrow({ where: { playerId }, include: { progress: true } }),
      this.getCreatures(tx, playerId),
      tx.innerWorldAssignment.findMany({
        where: { playerId },
        include: { creature: true },
        orderBy: { startedAt: "desc" },
        take: 12,
      }),
      tx.innerWorldLawRecord.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      tx.innerWorldSupportRecord.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    return {
      state: this.toStateSummary(state, player as PlayerWithProgress, assignments),
      creatures: creatures.map(toInnerWorldCreatureState),
      assignments: assignments.map((assignment) =>
        toInnerWorldAssignmentState(assignment, assignment.creature),
      ),
      recent_law_records: lawRecords.map(toInnerWorldLawRecordState),
      recent_support_records: supportRecords.map(toInnerWorldSupportRecordState),
    };
  }

  private async buildStateSummary(tx: DbClient, playerId: string): Promise<InnerWorldStateSummary> {
    const [state, player, assignments] = await Promise.all([
      tx.innerWorldState.findUniqueOrThrow({ where: { playerId } }),
      tx.player.findUniqueOrThrow({ where: { playerId }, include: { progress: true } }),
      tx.innerWorldAssignment.findMany({ where: { playerId, status: "active" } }),
    ]);

    return this.toStateSummary(state, player as PlayerWithProgress, assignments);
  }

  private toStateSummary(
    state: InnerWorldState,
    player: PlayerWithProgress,
    assignments: InnerWorldAssignment[],
  ): InnerWorldStateSummary {
    const now = Date.now();
    return toInnerWorldStateSummary({
      state,
      playerRealm: player.currentRealm,
      playerChapter: player.progress?.chapterId ?? 1,
      activeAssignmentCount: assignments.length,
      claimableAssignmentCount: assignments.filter(
        (assignment) => assignment.endsAt.getTime() <= now,
      ).length,
    });
  }

  private async ensureInnerWorldState(playerId: string, tx: DbClient = this.prisma) {
    const player = (await tx.player.findUniqueOrThrow({
      where: { playerId },
      include: { progress: true },
    })) as PlayerWithProgress;
    const levelConfig = getInnerWorldLevelConfig(1);
    const state = await tx.innerWorldState.upsert({
      where: { playerId },
      create: {
        playerId,
        eraId: defaultEraId,
        worldLevel: 1,
        lawLevel: 1,
        lawExp: 0,
        creatureCapacity: levelConfig.creatureCapacity,
        assignmentLimit: levelConfig.assignmentLimit,
        supportResetKey: getDailyResetKey(),
        configVersion: innerWorldConfigVersion,
        rewardConfigVersion: innerWorldRewardConfigVersion,
      },
      update: {
        configVersion: innerWorldConfigVersion,
        rewardConfigVersion: innerWorldRewardConfigVersion,
      },
    });

    const creatures = await this.getCreatures(tx, playerId);
    if (creatures.length === 0) {
      for (const config of innerWorldCreatureConfigs) {
        await tx.innerWorldCreature.create({
          data: {
            creatureId: `inner_creature_${randomUUID()}`,
            playerId,
            eraId: defaultEraId,
            creatureType: config.creatureType,
            name: config.name,
            affinityProvinceId: config.affinityProvinceId,
            assignmentBonusSummary: config.bonusSummary as Prisma.InputJsonValue,
            configVersion: innerWorldConfigVersion,
          },
        });
      }
    }

    return { player, state };
  }

  private assertUnlocked(player: PlayerWithProgress) {
    const chapter = player.progress?.chapterId ?? 1;
    if (player.currentRealm < innerWorldUnlockRealm && chapter < innerWorldUnlockChapter) {
      throw new BadRequestException("内天地需化神 / 神躯或第四章后开启");
    }
  }

  private async assertProvinceOpened(tx: DbClient, player: PlayerWithProgress, provinceId: string) {
    const province = await tx.provinceState.findUnique({
      where: { eraId_provinceId: { eraId: defaultEraId, provinceId } },
    });
    if (
      !province ||
      !province.unlocked ||
      (player.progress?.chapterId ?? 1) < province.chapterRequired
    ) {
      throw new BadRequestException("该州尚未开放，不能派驻内天地生灵");
    }
  }

  private async refreshDailySupport(
    tx: DbClient,
    state: InnerWorldState,
  ): Promise<InnerWorldState> {
    const resetKey = getDailyResetKey();
    if (state.supportResetKey === resetKey) {
      return state;
    }

    return tx.innerWorldState.update({
      where: { playerId: state.playerId },
      data: { supportResetKey: resetKey, supportCountToday: 0 },
    });
  }

  private async getCreatures(tx: DbClient, playerId: string): Promise<InnerWorldCreature[]> {
    return tx.innerWorldCreature.findMany({
      where: { playerId },
      orderBy: [{ status: "asc" }, { level: "desc" }, { createdAt: "asc" }],
    });
  }

  private async getBagByPlayerId(tx: DbClient, playerId: string): Promise<BagSummaryResponse> {
    const items = await tx.playerItem.findMany({
      where: { playerId, count: { gt: 0 } },
      orderBy: [{ locked: "desc" }, { createdAt: "asc" }],
    });

    return { items: items.map((item) => toBagItemState(item)) };
  }

  private async grantBoundRewards(
    tx: Tx,
    playerId: string,
    rewards: RewardBundle,
    sourceType: string,
  ) {
    rejectForbiddenRewards(rewards);
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
          bindType: "bound",
          sourceType,
        },
      });
    }
  }

  private async consumeCost(tx: Tx, playerId: string, cost: RewardBundle) {
    const spiritStone = BigInt(cost.spirit_stone ?? "0");
    if (spiritStone > 0n) {
      const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
      if (wallet.spiritStone < spiritStone) {
        throw new BadRequestException("灵石不足");
      }
      await tx.playerWallet.update({
        where: { playerId },
        data: { spiritStone: { decrement: spiritStone } },
      });
      await tx.walletLog.create({
        data: {
          logId: `wallet_${randomUUID()}`,
          playerId,
          currencyType: "spirit_stone",
          changeAmount: -spiritStone,
          beforeAmount: wallet.spiritStone,
          afterAmount: wallet.spiritStone - spiritStone,
          sourceType: "inner_world_upgrade",
          sourceId: playerId,
        },
      });
    }

    for (const item of cost.items ?? []) {
      await consumeItem(tx, playerId, item.item_id, item.count);
    }
  }

  private async requirePlayer(accountId: string): Promise<Player> {
    const player = await this.prisma.player.findUnique({ where: { accountId } });
    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
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

function normalizeDispatchRequest(
  body: InnerWorldDispatchRequest,
): Required<InnerWorldDispatchRequest> {
  const provinceId = body?.province_id?.trim();
  if (!provinceId || !provinceConfigs.some((province) => province.provinceId === provinceId)) {
    throw new BadRequestException("请选择有效派驻州");
  }

  return { province_id: provinceId, creature_id: body.creature_id?.trim() ?? "" };
}

function normalizeClaimRequest(body: InnerWorldClaimRequest): InnerWorldClaimRequest {
  return { assignment_id: body?.assignment_id?.trim() || undefined };
}

function normalizeUpgradeRequest(
  body: InnerWorldUpgradeRequest,
): Required<InnerWorldUpgradeRequest> {
  if (!body || !["world", "creature"].includes(body.target_type)) {
    throw new BadRequestException("请选择内天地升级目标");
  }
  if (body.target_type === "creature" && !body.creature_id?.trim()) {
    throw new BadRequestException("请选择需要培养的生灵");
  }

  return { target_type: body.target_type, creature_id: body.creature_id?.trim() ?? "" };
}

function normalizeSupportRequest(body: InnerWorldSupportRequest): {
  province_id: string;
  support_type: InnerWorldSupportType;
} {
  const provinceId = body?.province_id?.trim();
  const supportType = body?.support_type;
  if (!provinceId || !provinceConfigs.some((province) => province.provinceId === provinceId)) {
    throw new BadRequestException("请选择有效支援州");
  }
  if (!["spirit_vein", "tower_supply", "secret_realm"].includes(supportType)) {
    throw new BadRequestException("请选择有效九州支援类型");
  }

  return { province_id: provinceId, support_type: supportType as InnerWorldSupportType };
}

async function consumeItem(tx: Tx, playerId: string, itemId: string, count: number) {
  let remaining = BigInt(count);
  const rows = await tx.playerItem.findMany({
    where: {
      playerId,
      itemId,
      locked: false,
      count: { gt: 0 },
      OR: [{ expireAt: null }, { expireAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
  });
  const total = rows.reduce((sum, row) => sum + row.count, 0n);
  if (total < remaining) {
    throw new BadRequestException("材料不足");
  }

  for (const row of rows) {
    if (remaining <= 0n) {
      break;
    }
    const used = row.count >= remaining ? remaining : row.count;
    const nextCount = row.count - used;
    if (nextCount <= 0n) {
      await tx.playerItem.delete({ where: { itemInstanceId: row.itemInstanceId } });
    } else {
      await tx.playerItem.update({
        where: { itemInstanceId: row.itemInstanceId },
        data: { count: nextCount },
      });
    }
    remaining -= used;
  }
}

function rejectForbiddenRewards(rewards: RewardBundle) {
  if (BigInt(rewards.jade_paid ?? "0") > 0n || BigInt(rewards.jade_bound ?? "0") > 0n) {
    throw new BadRequestException("内天地不能产出仙玉");
  }
  for (const item of rewards.items ?? []) {
    if (
      item.bind_type !== "bound" ||
      item.item_id.includes("ancient") ||
      item.item_id.includes("gubao") ||
      item.item_id.includes("limited")
    ) {
      throw new BadRequestException("内天地只能产出绑定普通材料");
    }
  }
}

function scaleAssignmentReward(
  reward: RewardBundle,
  creature: InnerWorldCreature,
  provinceId: string,
): RewardBundle {
  const bonusCount = creature.affinityProvinceId === provinceId ? 1 : 0;
  return {
    items: reward.items?.map((item) => ({
      ...item,
      bind_type: "bound",
      count: item.count + bonusCount + Math.floor((creature.level - 1) / 2),
    })),
  };
}

function affinityBonus(creature: InnerWorldCreature, provinceId: string): number {
  return creature.affinityProvinceId === provinceId ? 4 : 0;
}

function mergeRewards(target: RewardBundle, source: RewardBundle) {
  target.items = [...(target.items ?? []), ...(source.items ?? [])];
}

function calculateLawLevel(lawExp: number): number {
  return Math.max(1, Math.min(9, 1 + Math.floor(lawExp / 100)));
}

function getSupportProvinceDelta(
  supportType: InnerWorldSupportType,
  contribution: number,
): Prisma.ProvinceStateUpdateInput {
  if (supportType === "spirit_vein") {
    return { spiritVeinLevel: { increment: 1 } };
  }
  if (supportType === "tower_supply") {
    return { towerIntegrity: { increment: contribution } };
  }

  return { corruption: { decrement: Math.min(5, contribution) } };
}

function provinceName(provinceId: string): string {
  return provinceConfigs.find((province) => province.provinceId === provinceId)?.name ?? provinceId;
}

function getDailyResetKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function buildInnerWorldExperience(input: {
  title: string;
  summary: string;
  rewards: RewardBundle;
  lawExp: number;
  tags: string[];
}): ExperiencePayload {
  return {
    title: input.title,
    summary: input.summary,
    timeline: [
      {
        step: 1,
        title: "服务端异步结算",
        description: "内天地派驻、收取和支援都由服务端按配置与幂等键结算。",
        tone: "neutral",
      },
      {
        step: 2,
        title: "奖励边界校验",
        description: "本系统只产出绑定材料和法则经验，不产出付费货币、九大古宝或限定法宝。",
        tone: "success",
      },
      {
        step: 3,
        title: "结果记录",
        description: formatInnerWorldResult(input.rewards, input.lawExp),
        tone: "success",
      },
    ],
    delta_summary: [
      {
        label: "法则经验",
        delta: input.lawExp >= 0 ? `+${input.lawExp}` : `${input.lawExp}`,
        tone: "success",
      },
      { label: "绑定产出", after: formatRewardItems(input.rewards), tone: "neutral" },
    ],
    next_recommendations: [
      {
        label: "查看内天地",
        reason: "派驻队列、法则经验和九州支援会影响后续长期养成。",
        action_hint: "inner_world",
        priority: "medium",
      },
    ],
    reason_tags: input.tags.map((tag) => ({
      code: tag,
      label: innerWorldTagLabel(tag),
      description: innerWorldTagDescription(tag),
      tone: "neutral",
    })),
  };
}

function formatInnerWorldResult(rewards: RewardBundle, lawExp: number): string {
  const parts = [formatRewardItems(rewards), `法则经验 ${lawExp >= 0 ? "+" : ""}${lawExp}`].filter(
    Boolean,
  );
  return parts.join("，") || "无额外产出";
}

function formatRewardItems(rewards: RewardBundle): string {
  const items = rewards.items ?? [];
  if (items.length === 0) {
    return "无材料";
  }

  return items.map((item) => `${item.name ?? item.item_id} x${item.count}`).join("，");
}

function innerWorldTagLabel(tag: string): string {
  const labels: Record<string, string> = {
    async_assignment: "异步派驻",
    async_claim: "异步收取",
    bound_only: "绑定产出",
    no_paid_output: "无付费产出",
    growth_upgrade: "长期成长",
    creature_growth: "生灵培养",
    province_support: "九州支援",
  };
  return labels[tag] ?? tag;
}

function innerWorldTagDescription(tag: string): string {
  const descriptions: Record<string, string> = {
    async_assignment: "派驻完成后可任意时间收取，不要求固定时间在线。",
    async_claim: "已完成派驻不会因错过时间点丢失收益。",
    bound_only: "奖励只进入个人绑定材料循环，不能交易套利。",
    no_paid_output: "不会发放付费仙玉、九大古宝本体或限定法宝。",
    growth_upgrade: "升级只提高队列、容量和长期效率，不提高全服贡献倍率。",
    creature_growth: "生灵等级影响派驻效率，不造成 PVP 直接碾压。",
    province_support: "支援影响州域状态摘要，不跳过九塔和主线结算。",
  };
  return descriptions[tag] ?? tag;
}
