import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ActionState,
  BattleRoundLog,
  ClaimRankTitleRequest,
  ClaimRankTitleResponse,
  CreateSectRequest,
  JoinSectRequest,
  PvpAttackRequest,
  PvpBattleResponse,
  RankEntryState,
  RankListResponse,
  RankTargetType,
  RankTitleRewardState,
  RankType,
  ResourcePointListResponse,
  ResourcePointSummary,
  RewardBundle,
  SectDetailResponse,
  SectListResponse,
  SectMutationResponse,
  SectTaskResponse,
  SectWarehouseDepositRequest,
  SectWarehouseResponse,
  SectWarehouseWithdrawRequest,
  SettlementStatus,
  TitleCollectionResponse,
  TowerActionRequest,
  TowerActionResponse,
  TowerActionType,
  TowerListResponse,
  TowerStateSummary,
  WorldBossChallengeRequest,
  WorldBossChallengeResponse,
  WorldBossResponse,
  WorldBossStateSummary,
} from "@nextday/shared";
import type { Player, PlayerActionState, Prisma, SectMember } from "@prisma/client";
import { toAppearanceState } from "../commerce/commerce.mappers";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId, maxOfflineCultivationHours } from "../game/game.constants";
import { toActionState } from "../game/game.mappers";
import { incrementPlayerTasks } from "../game/task-progress.utils";
import { writeJournalFromResponse } from "../journal/journal.utils";
import {
  buildBossExperience,
  buildPvpExperience,
  buildSectTaskExperience,
  buildSectWarehouseExperience,
  buildTowerExperience,
} from "../platform/experience";
import { hashRequestBody } from "../platform/utils/hash";
import { getItemMeta } from "../production/production.constants";
import { toBagItemState } from "../production/production.mappers";
import { RiskService } from "../risk/risk.service";
import {
  bossConfig,
  eraBlessingCapPercent,
  getCurrentWeekKey,
  maxTowerActionBatch,
  multiplayerConfigVersion,
  multiplayerRewardConfigVersion,
  pvpActionPointCost,
  rankAntiBrushRule,
  rankConfigVersion,
  rankRewardBoundary,
  rankRewardConfigVersion,
  rankRewardPreview,
  rankRulesetVersion,
  rankTitleRewards,
  resourcePointConfigs,
  sectCreateCost,
  sectTaskConfigs,
  sectWarehouseWhitelist,
  supportedRankTypes,
  towerActionConfigs,
  towerConfigs,
  validSectAlignments,
} from "./multiplayer.constants";
import {
  toBossStateSummary,
  toRankEntryState,
  toResourcePointSummary,
  toSectDetailResponse,
  toSectSummary,
  toSectWarehouseItemState,
  toTowerStateSummary,
} from "./multiplayer.mappers";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type RankScoreMap = Map<string, bigint>;

interface RankBuildResult {
  rankType: RankType;
  periodKey: string;
  targetType: RankTargetType;
  scoreMap: RankScoreMap;
  displayNameMap?: Map<string, string>;
  excludedDelayedCount: number;
}

@Injectable()
export class MultiplayerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RiskService) private readonly riskService: RiskService,
  ) {}

  async getTowers(): Promise<TowerListResponse> {
    await this.ensureTowerStates();
    const towers = await this.prisma.towerState.findMany({
      where: { eraId: defaultEraId },
    });

    return { towers: sortTowersByConfig(towers).map(toTowerStateSummary) };
  }

  async submitTowerAction(input: {
    accountId: string;
    body: TowerActionRequest;
    idempotencyKey: string;
  }): Promise<TowerActionResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeTowerActionRequest(input.body);
    const actionConfig = towerActionConfigs[body.action_type];

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/towers/action",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.ensureTowerStates(tx);
        const tower = await tx.towerState.findUnique({
          where: { eraId_towerId: { eraId: defaultEraId, towerId: body.tower_id } },
        });
        if (!tower) {
          throw new BadRequestException("未知封印塔");
        }

        const repeatedTowerCount = await tx.towerActionRecord.count({
          where: {
            playerId: player.playerId,
            towerId: body.tower_id,
            actionType: body.action_type,
            createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
          },
        });
        const risk = await this.riskService.evaluateAndRecord(
          {
            accountId: input.accountId,
            playerId: player.playerId,
            riskDomain: "tower",
            actionType: body.action_type,
            targetType: "tower",
            targetId: body.tower_id,
            path: "/api/multiplayer/towers/action",
            targetRepeatCount: repeatedTowerCount,
            requestedCount: body.count,
            acceptedCount: body.count,
            highImpact: true,
            idempotencyKey: input.idempotencyKey,
            metadata: { tower_id: body.tower_id, count: body.count },
          },
          tx,
        );
        const actionPointCost = actionConfig.actionPointCost * body.count;
        const actionState = await this.consumeActionPoints(tx, player.playerId, actionPointCost);
        const contribution = actionConfig.contribution * body.count;
        const rewards = multiplyReward(actionConfig.reward, body.count);
        if (risk.settlement_status === "delayed") {
          const sectMember = await this.getSectMemberByPlayer(tx, player.playerId);
          const record = await tx.towerActionRecord.create({
            data: {
              recordId: `tower_action_${randomUUID()}`,
              playerId: player.playerId,
              sectId: sectMember?.sectId,
              eraId: defaultEraId,
              towerId: body.tower_id,
              actionType: body.action_type,
              count: body.count,
              contribution,
              actionPointCost,
              rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
              settlementStatus: "delayed",
              configVersion: multiplayerConfigVersion,
              idempotencyKey: input.idempotencyKey,
            },
          });
          await this.riskService.attachSourceRecord(tx, risk.risk_record_id, record.recordId);
          await this.riskService.createDelayedSettlement(tx, {
            playerId: player.playerId,
            sourceType: "tower_action",
            sourceId: body.tower_id,
            sourceRecordId: record.recordId,
            riskRecordId: risk.risk_record_id,
            amountSnapshot: {
              source_record_id: record.recordId,
              tower_id: body.tower_id,
              action_type: body.action_type,
              contribution,
              rewards,
            },
            configVersion: multiplayerConfigVersion,
            rewardConfigVersion: multiplayerRewardConfigVersion,
            idempotencyKey: `${input.idempotencyKey}:delayed`,
          });
          await this.writeAudit(tx, {
            accountId: input.accountId,
            playerId: player.playerId,
            action: "tower_action_delayed",
            targetType: "tower_state",
            targetId: body.tower_id,
            afterSnapshot: {
              record_id: record.recordId,
              contribution,
              risk_record_id: risk.risk_record_id,
            } as unknown as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
          });
          const completedTaskIds =
            body.tower_id === "tower_xuantie"
              ? await incrementPlayerTasks(tx, player.playerId, {
                  novice_tower_xuantie: 1,
                })
              : [];

          const towerInsight = buildTowerBattleInsight({
            towerBefore: toTowerStateSummary(tower),
            towerAfter: toTowerStateSummary(tower),
            actionType: body.action_type,
            contribution,
            settlementStatus: "delayed",
          });

          return {
            record_id: record.recordId,
            tower: toTowerStateSummary(tower),
            contribution,
            rewards,
            action_state: actionState,
            risk_status: risk.risk_status,
            risk_record_id: risk.risk_record_id,
            settlement_status: "delayed",
            completed_task_ids: completedTaskIds,
            ...towerInsight,
            experience: buildTowerExperience({
              towerBefore: toTowerStateSummary(tower),
              towerAfter: toTowerStateSummary(tower),
              actionType: body.action_type,
              count: body.count,
              contribution,
              rewards,
              riskStatus: risk.risk_status,
              settlementStatus: "delayed",
            }),
          };
        }

        const updatedTower = await tx.towerState.update({
          where: { eraId_towerId: { eraId: defaultEraId, towerId: body.tower_id } },
          data: getTowerUpdate(body.action_type, contribution),
        });
        const sectMember = await this.getSectMemberByPlayer(tx, player.playerId);
        if (sectMember) {
          await this.incrementSectContribution(tx, sectMember, Math.floor(contribution * 0.5), 0n);
        }
        await this.applyReward(tx, player.playerId, rewards, {
          sourceType: "tower_action",
          sourceId: body.tower_id,
          idempotencyKey: `${input.idempotencyKey}:reward`,
        });
        const record = await tx.towerActionRecord.create({
          data: {
            recordId: `tower_action_${randomUUID()}`,
            playerId: player.playerId,
            sectId: sectMember?.sectId,
            eraId: defaultEraId,
            towerId: body.tower_id,
            actionType: body.action_type,
            count: body.count,
            contribution,
            actionPointCost,
            rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
            settlementStatus: "settled",
            configVersion: multiplayerConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.riskService.attachSourceRecord(tx, risk.risk_record_id, record.recordId);
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "tower_action",
          targetType: "tower_state",
          targetId: body.tower_id,
          afterSnapshot: {
            record_id: record.recordId,
            contribution,
            tower: toTowerStateSummary(updatedTower),
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });
        const completedTaskIds =
          body.tower_id === "tower_xuantie"
            ? await incrementPlayerTasks(tx, player.playerId, {
                novice_tower_xuantie: 1,
              })
            : [];

        const towerInsight = buildTowerBattleInsight({
          towerBefore: toTowerStateSummary(tower),
          towerAfter: toTowerStateSummary(updatedTower),
          actionType: body.action_type,
          contribution,
          settlementStatus: "settled",
        });

        return {
          record_id: record.recordId,
          tower: toTowerStateSummary(updatedTower),
          contribution,
          rewards,
          action_state: actionState,
          risk_status: risk.risk_status,
          risk_record_id: risk.risk_record_id,
          settlement_status: "settled",
          completed_task_ids: completedTaskIds,
          ...towerInsight,
          experience: buildTowerExperience({
            towerBefore: toTowerStateSummary(tower),
            towerAfter: toTowerStateSummary(updatedTower),
            actionType: body.action_type,
            count: body.count,
            contribution,
            rewards,
            riskStatus: risk.risk_status,
            settlementStatus: "settled",
          }),
        };
      },
    });
  }

  async getWorldBoss(): Promise<WorldBossResponse> {
    const boss = await this.ensureBossState();
    return { boss: toBossStateSummary(boss) };
  }

  async challengeWorldBoss(input: {
    accountId: string;
    body: WorldBossChallengeRequest;
    idempotencyKey: string;
  }): Promise<WorldBossChallengeResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = { boss_id: input.body?.boss_id?.trim() || bossConfig.bossId };
    if (body.boss_id !== bossConfig.bossId) {
      throw new BadRequestException("未知公共 Boss");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/boss/challenge",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        let boss = await this.ensureBossState(tx);
        const bossBefore = toBossStateSummary(boss);
        const actionState = await this.consumeActionPoints(
          tx,
          player.playerId,
          bossConfig.actionPointCost,
        );
        const playerPower = await this.calculatePlayerPower(tx, player.playerId);
        const damageDone = Math.max(80, playerPower * 3 + rollRange(input.idempotencyKey, 20, 80));
        const defeated = boss.remainingHp - damageDone <= 0;
        const nextTotalHp = defeated ? boss.totalHp + 1000 : boss.totalHp;
        boss = await tx.worldBossState.update({
          where: { eraId_bossId: { eraId: defaultEraId, bossId: bossConfig.bossId } },
          data: defeated
            ? {
                phase: { increment: 1 },
                totalHp: nextTotalHp,
                remainingHp: nextTotalHp,
                defeatedCount: { increment: 1 },
              }
            : { remainingHp: { decrement: damageDone } },
        });
        const rewards = {
          ...bossConfig.reward,
          spirit_stone: String(
            Number(bossConfig.reward.spirit_stone ?? "0") + Math.floor(damageDone / 20),
          ),
        };
        const log = createSimpleBattleLog({
          attackerName: player.name,
          defenderName: bossConfig.name,
          attackerSkill: "本命法光",
          defenderSkill: "诸怀裂阵",
          damageDone,
          damageTaken: Math.floor(playerPower / 3),
        });
        const sectMember = await this.getSectMemberByPlayer(tx, player.playerId);
        if (sectMember) {
          await this.incrementSectContribution(tx, sectMember, Math.floor(damageDone / 20), 0n);
        }
        await this.applyReward(tx, player.playerId, rewards, {
          sourceType: "world_boss",
          sourceId: bossConfig.bossId,
          idempotencyKey: `${input.idempotencyKey}:reward`,
        });
        const record = await tx.worldBossChallengeRecord.create({
          data: {
            recordId: `boss_challenge_${randomUUID()}`,
            playerId: player.playerId,
            sectId: sectMember?.sectId,
            eraId: defaultEraId,
            bossId: bossConfig.bossId,
            damageDone,
            contribution: damageDone,
            result: defeated ? "phase_defeated" : "active",
            rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
            battleLog: log as unknown as Prisma.InputJsonValue,
            configVersion: multiplayerConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });

        const bossInsight = buildBossBattleInsight({
          bossBefore,
          bossAfter: toBossStateSummary(boss),
          damageDone,
          result: defeated ? "phase_defeated" : "active",
        });

        return {
          record_id: record.recordId,
          boss: toBossStateSummary(boss),
          damage_done: damageDone,
          contribution: damageDone,
          result: defeated ? "phase_defeated" : "active",
          rewards,
          action_state: actionState,
          log,
          ...bossInsight,
          experience: buildBossExperience({
            bossBefore,
            bossAfter: toBossStateSummary(boss),
            damageDone,
            contribution: damageDone,
            result: defeated ? "phase_defeated" : "active",
            rewards,
            log,
          }),
        };
      },
    });
  }

  async listSects(accountId: string): Promise<SectListResponse> {
    const player = await this.requirePlayer(accountId);
    const myMember = await this.getSectMemberByPlayer(this.prisma, player.playerId);
    const sects = await this.prisma.sect.findMany({
      where: { status: "normal" },
      include: { members: true },
      orderBy: [{ level: "desc" }, { createdAt: "asc" }],
      take: 20,
    });

    return {
      sects: sects.map((sect) =>
        toSectSummary(sect, sect.sectId === myMember?.sectId ? myMember : null),
      ),
    };
  }

  async getMySect(accountId: string): Promise<SectDetailResponse> {
    const player = await this.requirePlayer(accountId);
    const myMember = await this.getSectMemberByPlayer(this.prisma, player.playerId);
    if (!myMember) {
      return { sect: null, members: [], warehouse: [] };
    }

    return this.getSectDetail(myMember.sectId, myMember);
  }

  async createSect(input: {
    accountId: string;
    body: CreateSectRequest;
    idempotencyKey: string;
  }): Promise<SectMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeCreateSectRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/sects/create",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const existingMember = await this.getSectMemberByPlayer(tx, player.playerId);
        if (existingMember) {
          throw new BadRequestException("已加入宗门");
        }
        await this.consumeSpiritStone(tx, player.playerId, sectCreateCost, {
          sourceType: "sect_create",
          sourceId: body.name,
          idempotencyKey: `${input.idempotencyKey}:cost`,
        });
        const sect = await tx.sect.create({
          data: {
            sectId: `sect_${randomUUID()}`,
            name: body.name,
            alignment: body.alignment,
            createdByPlayerId: player.playerId,
            members: {
              create: {
                sectMemberId: `sect_member_${randomUUID()}`,
                playerId: player.playerId,
                role: "leader",
              },
            },
          },
          include: { members: true },
        });
        await tx.player.update({
          where: { playerId: player.playerId },
          data: { sectId: sect.sectId },
        });

        return {
          record_id: `sect_create_${randomUUID()}`,
          sect: toSectSummary(sect, sect.members[0]),
          wallet: await this.getWalletState(tx, player.playerId),
        };
      },
    });
  }

  async joinSect(input: {
    accountId: string;
    body: JoinSectRequest;
    idempotencyKey: string;
  }): Promise<SectMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = { sect_id: input.body?.sect_id?.trim() };
    if (!body.sect_id) {
      throw new BadRequestException("请选择宗门");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/sects/join",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const existingMember = await this.getSectMemberByPlayer(tx, player.playerId);
        if (existingMember) {
          throw new BadRequestException("已加入宗门");
        }
        const sect = await tx.sect.findUnique({
          where: { sectId: body.sect_id },
          include: { members: true },
        });
        if (!sect || sect.status !== "normal") {
          throw new BadRequestException("宗门不存在");
        }
        if (sect.members.length >= sect.memberLimit) {
          throw new BadRequestException("宗门人数已满");
        }
        const member = await tx.sectMember.create({
          data: {
            sectMemberId: `sect_member_${randomUUID()}`,
            sectId: sect.sectId,
            playerId: player.playerId,
            role: "disciple",
          },
        });
        await tx.player.update({
          where: { playerId: player.playerId },
          data: { sectId: sect.sectId },
        });
        const updatedSect = await tx.sect.findUniqueOrThrow({
          where: { sectId: sect.sectId },
          include: { members: true },
        });

        return {
          record_id: `sect_join_${randomUUID()}`,
          sect: toSectSummary(updatedSect, member),
        };
      },
    });
  }

  async completeSectTask(input: {
    accountId: string;
    body: { task_id: string };
    idempotencyKey: string;
  }): Promise<SectTaskResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = { task_id: input.body?.task_id?.trim() || "sect_patrol" };
    const task = sectTaskConfigs.find((item) => item.taskId === body.task_id);
    if (!task) {
      throw new BadRequestException("未知宗门任务");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/sects/tasks/complete",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const member = await this.requireSectMember(tx, player.playerId);
        await this.incrementSectContribution(tx, member, task.contribution, task.fundGain);
        const rewards = task.reward;
        await this.applyReward(tx, player.playerId, rewards, {
          sourceType: "sect_task",
          sourceId: task.taskId,
          idempotencyKey: `${input.idempotencyKey}:reward`,
        });
        const record = await tx.sectTaskRecord.create({
          data: {
            recordId: `sect_task_${randomUUID()}`,
            playerId: player.playerId,
            sectId: member.sectId,
            taskId: task.taskId,
            contribution: task.contribution,
            fundGain: task.fundGain,
            rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
            configVersion: multiplayerConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        const detail = await this.getSectDetail(member.sectId, member, tx);
        if (!detail.sect) {
          throw new BadRequestException("宗门状态异常");
        }

        return {
          record_id: record.recordId,
          sect: detail.sect,
          contribution: task.contribution,
          rewards,
          experience: buildSectTaskExperience({
            sectName: detail.sect.name,
            contribution: task.contribution,
            rewards,
          }),
        };
      },
    });
  }

  async depositWarehouse(input: {
    accountId: string;
    body: SectWarehouseDepositRequest;
    idempotencyKey: string;
  }): Promise<SectWarehouseResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeWarehouseDepositRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/sects/warehouse/deposit",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const member = await this.requireSectMember(tx, player.playerId);
        const item = await tx.playerItem.findFirst({
          where: {
            itemInstanceId: body.item_instance_id,
            playerId: player.playerId,
            count: { gte: body.count },
          },
        });
        if (!item || item.locked || item.bindType !== "unbound" || isExpired(item)) {
          throw new BadRequestException("只有未绑定且未锁定的可流通材料可进入宗门仓库");
        }
        if (!sectWarehouseWhitelist.has(item.itemId) || isPaidLikeSource(item.sourceType)) {
          throw new BadRequestException("该物品不允许进入宗门仓库");
        }
        const warehouse = await tx.sectWarehouseItem.upsert({
          where: { sectId_itemId: { sectId: member.sectId, itemId: item.itemId } },
          create: {
            warehouseItemId: `sect_wh_${randomUUID()}`,
            sectId: member.sectId,
            itemId: item.itemId,
            count: BigInt(body.count),
          },
          update: { count: { increment: BigInt(body.count) } },
        });
        await this.decrementPlayerItem(tx, item, body.count);
        await tx.sectWarehouseLog.create({
          data: {
            logId: `sect_wh_log_${randomUUID()}`,
            sectId: member.sectId,
            playerId: player.playerId,
            operationType: "deposit",
            itemId: item.itemId,
            count: BigInt(body.count),
            beforeCount: warehouse.count - BigInt(body.count),
            afterCount: warehouse.count,
            configVersion: multiplayerConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        const detail = await this.getSectDetail(member.sectId, member, tx);
        if (!detail.sect) {
          throw new BadRequestException("宗门状态异常");
        }

        return {
          record_id: `sect_deposit_${randomUUID()}`,
          sect: detail.sect,
          warehouse: detail.warehouse,
          bag: await this.getBagByPlayerId(tx, player.playerId),
          experience: buildSectWarehouseExperience({
            operationType: "deposit",
            sectName: detail.sect.name,
            itemName: getItemMeta(item.itemId).name,
            count: body.count,
            beforeCount: (warehouse.count - BigInt(body.count)).toString(),
            afterCount: warehouse.count.toString(),
            warehouse: detail.warehouse,
          }),
        };
      },
    });
  }

  async withdrawWarehouse(input: {
    accountId: string;
    body: SectWarehouseWithdrawRequest;
    idempotencyKey: string;
  }): Promise<SectWarehouseResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeWarehouseWithdrawRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/sects/warehouse/withdraw",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const member = await this.requireSectMember(tx, player.playerId);
        const warehouse = await tx.sectWarehouseItem.findUnique({
          where: { sectId_itemId: { sectId: member.sectId, itemId: body.item_id } },
        });
        if (!warehouse || warehouse.count < BigInt(body.count)) {
          throw new BadRequestException("宗门仓库库存不足");
        }
        const afterCount = warehouse.count - BigInt(body.count);
        await tx.sectWarehouseItem.update({
          where: { warehouseItemId: warehouse.warehouseItemId },
          data: { count: afterCount },
        });
        await this.grantItem(tx, player.playerId, {
          itemId: body.item_id,
          count: body.count,
          bindType: "unbound",
          sourceType: "sect_warehouse",
        });
        await tx.sectWarehouseLog.create({
          data: {
            logId: `sect_wh_log_${randomUUID()}`,
            sectId: member.sectId,
            playerId: player.playerId,
            operationType: "withdraw",
            itemId: body.item_id,
            count: BigInt(body.count),
            beforeCount: warehouse.count,
            afterCount,
            configVersion: multiplayerConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        const detail = await this.getSectDetail(member.sectId, member, tx);
        if (!detail.sect) {
          throw new BadRequestException("宗门状态异常");
        }

        return {
          record_id: `sect_withdraw_${randomUUID()}`,
          sect: detail.sect,
          warehouse: detail.warehouse,
          bag: await this.getBagByPlayerId(tx, player.playerId),
          experience: buildSectWarehouseExperience({
            operationType: "withdraw",
            sectName: detail.sect.name,
            itemName: getItemMeta(body.item_id).name,
            count: body.count,
            beforeCount: warehouse.count.toString(),
            afterCount: afterCount.toString(),
            warehouse: detail.warehouse,
          }),
        };
      },
    });
  }

  async getResourcePoints(): Promise<ResourcePointListResponse> {
    await this.ensureResourcePoints();
    const points = await this.prisma.resourcePointState.findMany({
      where: { eraId: defaultEraId },
    });

    return { resource_points: sortByProvinceConfig(points).map(toResourcePointSummary) };
  }

  async attackPlayer(input: {
    accountId: string;
    body: PvpAttackRequest;
    idempotencyKey: string;
  }): Promise<PvpBattleResponse> {
    const attacker = await this.requirePlayer(input.accountId);
    const body = normalizePvpAttackRequest(input.body);
    if (body.defender_player_id === attacker.playerId) {
      throw new BadRequestException("不能攻击自己");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/pvp/attack",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.ensureResourcePoints(tx);
        const defender = await tx.player.findUnique({
          where: { playerId: body.defender_player_id },
        });
        if (!defender) {
          throw new BadRequestException("防守目标不存在");
        }
        const resourcePoint = body.resource_point_id
          ? await tx.resourcePointState.findUnique({
              where: { resourcePointId: body.resource_point_id },
            })
          : await tx.resourcePointState.findFirst({
              where: { eraId: defaultEraId },
              orderBy: { provinceId: "asc" },
            });
        if (!resourcePoint) {
          throw new BadRequestException("资源点不存在");
        }
        const actionState = await this.consumeActionPoints(
          tx,
          attacker.playerId,
          pvpActionPointCost,
        );
        const [attackerPower, defenderPower] = await Promise.all([
          this.calculatePlayerPower(tx, attacker.playerId),
          this.calculatePlayerPower(tx, defender.playerId),
        ]);
        const win = attackerPower >= defenderPower;
        const repeatedCount = await tx.pvpBattleRecord.count({
          where: {
            attackerPlayerId: attacker.playerId,
            defenderPlayerId: defender.playerId,
            createdAt: { gt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
        const realmGap = attacker.currentRealm - defender.currentRealm;
        const risk = await this.riskService.evaluateAndRecord(
          {
            accountId: input.accountId,
            playerId: attacker.playerId,
            riskDomain: "pvp",
            actionType: "attack",
            targetType: "player",
            targetId: defender.playerId,
            path: "/api/multiplayer/pvp/attack",
            targetRepeatCount: repeatedCount,
            highImpact: true,
            forceRiskStatus: realmGap > 1 ? "decayed" : undefined,
            idempotencyKey: input.idempotencyKey,
            metadata: {
              defender_player_id: defender.playerId,
              resource_point_id: resourcePoint.resourcePointId,
              realm_gap: realmGap,
            },
          },
          tx,
        );
        const decayed =
          risk.risk_status === "decayed" ||
          risk.risk_status === "delayed_settlement" ||
          realmGap > 1;
        const baseScore = win ? 30 : 10;
        const scoreDelta = decayed ? Math.max(1, Math.floor(baseScore * 0.3)) : baseScore;
        const rewards: RewardBundle = {
          spirit_stone: String(scoreDelta * 3),
          items: [{ item_id: "battle_mark", name: "战备符", count: 1, bind_type: "bound" }],
        };
        const attackerMember = await this.getSectMemberByPlayer(tx, attacker.playerId);
        const defenderMember = await this.getSectMemberByPlayer(tx, defender.playerId);
        const settlementStatus: SettlementStatus =
          risk.settlement_status === "delayed" ? "delayed" : "settled";
        const updatedResourcePoint =
          win && settlementStatus === "settled"
            ? await tx.resourcePointState.update({
                where: { resourcePointId: resourcePoint.resourcePointId },
                data: {
                  ownerPlayerId: attacker.playerId,
                  ownerSectId: attackerMember?.sectId,
                  controlScore: { increment: scoreDelta },
                },
              })
            : resourcePoint;
        if (settlementStatus === "settled") {
          await this.applyReward(tx, attacker.playerId, rewards, {
            sourceType: "pvp_attack",
            sourceId: defender.playerId,
            idempotencyKey: `${input.idempotencyKey}:reward`,
          });
        }
        const log = createSimpleBattleLog({
          attackerName: attacker.name,
          defenderName: defender.name,
          attackerSkill: "破阵一击",
          defenderSkill: "防守镜像",
          damageDone: attackerPower,
          damageTaken: Math.floor(defenderPower / 2),
        });
        const record = await tx.pvpBattleRecord.create({
          data: {
            recordId: `pvp_${randomUUID()}`,
            attackerPlayerId: attacker.playerId,
            defenderPlayerId: defender.playerId,
            attackerSectId: attackerMember?.sectId,
            defenderSectId: defenderMember?.sectId,
            eraId: defaultEraId,
            sceneType: "resource_point",
            resourcePointId: resourcePoint.resourcePointId,
            result: win ? "win" : "lose",
            scoreDelta,
            rewardSnapshot: rewards as unknown as Prisma.InputJsonValue,
            battleLog: log as unknown as Prisma.InputJsonValue,
            riskStatus: risk.risk_status,
            settlementStatus,
            configVersion: multiplayerConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.riskService.attachSourceRecord(tx, risk.risk_record_id, record.recordId);
        if (settlementStatus === "delayed") {
          await this.riskService.createDelayedSettlement(tx, {
            playerId: attacker.playerId,
            sourceType: "pvp_attack",
            sourceId: defender.playerId,
            sourceRecordId: record.recordId,
            riskRecordId: risk.risk_record_id,
            amountSnapshot: {
              source_record_id: record.recordId,
              defender_player_id: defender.playerId,
              resource_point_id: resourcePoint.resourcePointId,
              score_delta: scoreDelta,
              rewards,
            },
            configVersion: multiplayerConfigVersion,
            rewardConfigVersion: multiplayerRewardConfigVersion,
            idempotencyKey: `${input.idempotencyKey}:delayed`,
          });
        }

        const pvpInsight = buildPvpBattleInsight({
          result: win ? "win" : "lose",
          attackerPower,
          defenderPower,
          scoreDelta,
          settlementStatus,
          riskStatus: risk.risk_status,
          resourcePoint: toResourcePointSummary(updatedResourcePoint),
        });

        return {
          record_id: record.recordId,
          result: win ? "win" : "lose",
          score_delta: scoreDelta,
          risk_status: risk.risk_status,
          risk_record_id: risk.risk_record_id,
          settlement_status: settlementStatus,
          rewards,
          action_state: actionState,
          battle: {
            attacker_player_id: attacker.playerId,
            defender_player_id: defender.playerId,
            attacker_power: attackerPower,
            defender_power: defenderPower,
            log,
          },
          resource_point: toResourcePointSummary(updatedResourcePoint),
          ...pvpInsight,
          experience: buildPvpExperience({
            result: win ? "win" : "lose",
            attackerPower,
            defenderPower,
            scoreDelta,
            rewards,
            riskStatus: risk.risk_status,
            settlementStatus,
            resourcePoint: toResourcePointSummary(updatedResourcePoint),
            log,
          }),
        };
      },
    });
  }

  async getRankList(rankType: RankType): Promise<RankListResponse> {
    if (!supportedRankTypes.includes(rankType)) {
      throw new BadRequestException("未知排行榜");
    }

    const build = await this.buildRank(rankType);
    const entries = await this.toRankEntries(build);
    const snapshot = await this.persistRankSnapshot(rankType, build.periodKey, entries);
    const riskRecordCount = entries.filter((entry) => entry.risk_note).length;

    return {
      rank_type: rankType,
      period_key: build.periodKey,
      snapshot_id: snapshot.rankSnapshotId,
      generated_at: snapshot.generatedAt.toISOString(),
      reward_boundary: rankRewardBoundary,
      anti_brush_summary: {
        excluded_delayed_count: build.excludedDelayedCount,
        risk_record_count: riskRecordCount,
        rule: rankAntiBrushRule,
      },
      title_rewards: rankTitleRewards.filter((reward) => reward.rank_type === rankType),
      entries,
    };
  }

  async getTitleCollection(accountId: string): Promise<TitleCollectionResponse> {
    const player = await this.requirePlayer(accountId);
    return this.buildTitleCollection(player.playerId);
  }

  async claimRankTitle(input: {
    accountId: string;
    body: ClaimRankTitleRequest;
    idempotencyKey: string;
  }): Promise<ClaimRankTitleResponse> {
    const player = await this.requirePlayer(input.accountId);
    const rankType = normalizeRankType(input.body?.rank_type);
    const titleReward = rankTitleRewards.find((reward) => reward.rank_type === rankType);
    if (!titleReward) {
      throw new BadRequestException("该榜单暂无可继承纪元称号");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/multiplayer/titles/claim-rank",
      idempotencyKey: input.idempotencyKey,
      requestBody: { rank_type: rankType },
      handler: async (tx) => {
        const rank = await this.getRankList(rankType);
        const entry = await this.findClaimableRankEntry(tx, player.playerId, rank, titleReward);
        const appearance = await tx.playerAppearance.upsert({
          where: {
            playerId_appearanceId: {
              playerId: player.playerId,
              appearanceId: titleReward.appearance_id,
            },
          },
          create: {
            playerAppearanceId: `appearance_${randomUUID()}`,
            playerId: player.playerId,
            appearanceId: titleReward.appearance_id,
            appearanceType: "title_style",
            sourceType: titleReward.source_type,
            inherited: titleReward.inherited,
            equipped: false,
            configVersion: rankConfigVersion,
          },
          update: {
            inherited: true,
            sourceType: titleReward.source_type,
            configVersion: rankConfigVersion,
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "claim_rank_title",
          targetType: "player_appearance",
          targetId: appearance.playerAppearanceId,
          afterSnapshot: {
            rank_type: rankType,
            rank_no: entry.rank_no,
            title_id: titleReward.title_id,
            appearance_id: appearance.appearanceId,
            blessing_percent: titleReward.blessing_percent,
            blessing_cap_percent: eraBlessingCapPercent,
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: `rank_title_${randomUUID()}`,
          appearance: toAppearanceState(appearance, appearance.appearanceId),
          collection: await this.buildTitleCollection(player.playerId, tx),
          rank_entry: entry,
        };
      },
    });
  }

  private async buildRank(rankType: RankType): Promise<RankBuildResult> {
    const periodKey = rankType === "era" ? defaultEraId : getCurrentWeekKey();
    if (rankType === "sect") {
      return this.buildSectRank(periodKey);
    }
    if (rankType === "pvp_week") {
      return this.buildPvpRank(periodKey);
    }
    if (rankType === "tower_week") {
      return this.buildTowerRank(periodKey);
    }
    if (rankType === "production") {
      return this.buildProductionRank(periodKey);
    }
    if (rankType === "inner_world") {
      return this.buildInnerWorldRank(periodKey);
    }
    if (rankType === "faction") {
      return this.buildFactionRank(periodKey);
    }
    if (rankType === "era") {
      return this.buildEraRank(periodKey);
    }

    return this.buildPersonalRank(periodKey);
  }

  private async buildPersonalRank(periodKey: string): Promise<RankBuildResult> {
    const tower = await this.buildTowerRank(periodKey);
    const pvp = await this.buildPvpRank(periodKey);
    const scoreMap = new Map(tower.scoreMap);
    const bossRecords = await this.prisma.worldBossChallengeRecord.findMany({
      where: { eraId: defaultEraId },
    });
    for (const record of bossRecords) {
      addScore(scoreMap, record.playerId, BigInt(record.contribution));
    }
    mergeScoreMap(scoreMap, pvp.scoreMap);

    return {
      rankType: "personal",
      periodKey,
      targetType: "player",
      scoreMap,
      excludedDelayedCount: tower.excludedDelayedCount + pvp.excludedDelayedCount,
    };
  }

  private async buildTowerRank(periodKey: string): Promise<RankBuildResult> {
    const scoreMap = new Map<string, bigint>();
    const [records, excludedDelayedCount] = await Promise.all([
      this.prisma.towerActionRecord.findMany({
        where: { eraId: defaultEraId, settlementStatus: "settled" },
      }),
      this.prisma.towerActionRecord.count({
        where: { eraId: defaultEraId, settlementStatus: { not: "settled" } },
      }),
    ]);
    for (const record of records) {
      addScore(scoreMap, record.playerId, BigInt(record.contribution));
    }

    return {
      rankType: "tower_week",
      periodKey,
      targetType: "player",
      scoreMap,
      excludedDelayedCount,
    };
  }

  private async buildPvpRank(periodKey: string): Promise<RankBuildResult> {
    const scoreMap = new Map<string, bigint>();
    const [records, excludedDelayedCount] = await Promise.all([
      this.prisma.pvpBattleRecord.findMany({
        where: { eraId: defaultEraId, settlementStatus: "settled" },
      }),
      this.prisma.pvpBattleRecord.count({
        where: { eraId: defaultEraId, settlementStatus: { not: "settled" } },
      }),
    ]);
    for (const record of records) {
      if (record.scoreDelta > 0) {
        addScore(scoreMap, record.attackerPlayerId, BigInt(record.scoreDelta));
      }
    }

    return {
      rankType: "pvp_week",
      periodKey,
      targetType: "player",
      scoreMap,
      excludedDelayedCount,
    };
  }

  private async buildSectRank(periodKey: string): Promise<RankBuildResult> {
    const scoreMap = new Map<string, bigint>();
    const displayNameMap = new Map<string, string>();
    const sects = await this.prisma.sect.findMany({
      include: { members: true },
      orderBy: [{ level: "desc" }, { funds: "desc" }],
      take: 20,
    });
    for (const sect of sects) {
      const score = sect.members.reduce(
        (sum, member) => sum + BigInt(member.contributionWeekly),
        sect.funds,
      );
      if (score > 0n) {
        scoreMap.set(sect.sectId, score);
        displayNameMap.set(sect.sectId, sect.name);
      }
    }

    return {
      rankType: "sect",
      periodKey,
      targetType: "sect",
      scoreMap,
      displayNameMap,
      excludedDelayedCount: 0,
    };
  }

  private async buildProductionRank(periodKey: string): Promise<RankBuildResult> {
    const scoreMap = new Map<string, bigint>();
    const [alchemyRecords, equipmentRecords] = await Promise.all([
      this.prisma.alchemyRecord.findMany({ where: { eraId: defaultEraId } }),
      this.prisma.equipmentOperationRecord.findMany({ where: { eraId: defaultEraId } }),
    ]);
    for (const record of alchemyRecords) {
      if (record.success) {
        addScore(
          scoreMap,
          record.playerId,
          BigInt(record.count * alchemyQualityScore(record.quality)),
        );
      }
    }
    for (const record of equipmentRecords) {
      addScore(scoreMap, record.playerId, BigInt(equipmentOperationScore(record.operationType)));
    }

    return {
      rankType: "production",
      periodKey,
      targetType: "player",
      scoreMap,
      excludedDelayedCount: 0,
    };
  }

  private async buildInnerWorldRank(periodKey: string): Promise<RankBuildResult> {
    const scoreMap = new Map<string, bigint>();
    const [states, lawRecords] = await Promise.all([
      this.prisma.innerWorldState.findMany({ where: { eraId: defaultEraId } }),
      this.prisma.innerWorldLawRecord.findMany({ where: { eraId: defaultEraId } }),
    ]);
    for (const state of states) {
      addScore(
        scoreMap,
        state.playerId,
        BigInt(state.worldLevel * 1000 + state.lawLevel * 500 + state.lawExp),
      );
    }
    for (const record of lawRecords) {
      addScore(scoreMap, record.playerId, BigInt(Math.max(0, record.expDelta)));
    }

    return {
      rankType: "inner_world",
      periodKey,
      targetType: "player",
      scoreMap,
      excludedDelayedCount: 0,
    };
  }

  private async buildFactionRank(periodKey: string): Promise<RankBuildResult> {
    const scoreMap = new Map<string, bigint>();
    const displayNameMap = new Map<string, string>([
      ["immortal", "仙盟"],
      ["demon", "魔宗"],
      ["wanderer", "散修盟"],
    ]);
    const states = await this.prisma.playerFactionState.findMany({
      where: { eraId: defaultEraId, route: { not: "undecided" } },
    });
    for (const state of states) {
      addScore(scoreMap, "immortal", BigInt(state.reputationImmortal));
      addScore(scoreMap, "demon", BigInt(state.reputationDemon));
      addScore(scoreMap, "wanderer", BigInt(state.reputationWanderer));
      if (state.route === "immortal") {
        addScore(scoreMap, "immortal", 50n);
      } else if (state.route === "demon") {
        addScore(scoreMap, "demon", 50n);
      } else {
        addScore(scoreMap, "wanderer", 50n);
      }
    }

    return {
      rankType: "faction",
      periodKey,
      targetType: "faction",
      scoreMap,
      displayNameMap,
      excludedDelayedCount: 0,
    };
  }

  private async buildEraRank(periodKey: string): Promise<RankBuildResult> {
    const [personal, production, innerWorld] = await Promise.all([
      this.buildPersonalRank(periodKey),
      this.buildProductionRank(periodKey),
      this.buildInnerWorldRank(periodKey),
    ]);
    const scoreMap = new Map<string, bigint>();
    mergeScoreMap(scoreMap, personal.scoreMap);
    mergeScoreMap(scoreMap, production.scoreMap, 2n);
    mergeScoreMap(scoreMap, innerWorld.scoreMap);

    const factionStates = await this.prisma.playerFactionState.findMany({
      where: { eraId: defaultEraId },
    });
    for (const state of factionStates) {
      addScore(
        scoreMap,
        state.playerId,
        BigInt(state.reputationImmortal + state.reputationDemon + state.reputationWanderer),
      );
    }

    return {
      rankType: "era",
      periodKey,
      targetType: "player",
      scoreMap,
      excludedDelayedCount:
        personal.excludedDelayedCount +
        production.excludedDelayedCount +
        innerWorld.excludedDelayedCount,
    };
  }

  private async toRankEntries(build: RankBuildResult): Promise<RankEntryState[]> {
    const players = await this.prisma.player.findMany({
      where:
        build.targetType === "player"
          ? { playerId: { in: Array.from(build.scoreMap.keys()) } }
          : undefined,
    });
    const playerNameMap = new Map(players.map((player) => [player.playerId, player.name]));
    const riskNoteMap =
      build.targetType === "player"
        ? await this.getRankRiskNotes(Array.from(build.scoreMap.keys()))
        : new Map<string, string>();
    const titleReward = rankTitleRewards.find((reward) => reward.rank_type === build.rankType);

    return Array.from(build.scoreMap.entries())
      .filter(([, score]) => score > 0n)
      .sort((left, right) => Number(right[1] - left[1]))
      .slice(0, 20)
      .map(([targetId, score], index) =>
        toRankEntryState({
          rankNo: index + 1,
          targetType: build.targetType,
          targetId,
          displayName:
            build.displayNameMap?.get(targetId) ?? playerNameMap.get(targetId) ?? targetId,
          score,
          rewardPreview: rankRewardPreview[build.rankType],
          titleReward: titleReward && index + 1 <= titleReward.min_rank ? titleReward : null,
          riskNote: riskNoteMap.get(targetId) ?? null,
        }),
      );
  }

  private async persistRankSnapshot(
    rankType: RankType,
    periodKey: string,
    entries: RankEntryState[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.rankSnapshot.upsert({
        where: { eraId_rankType_periodKey: { eraId: defaultEraId, rankType, periodKey } },
        create: {
          rankSnapshotId: `rank_snapshot_${randomUUID()}`,
          eraId: defaultEraId,
          rankType,
          periodKey,
          configVersion: rankConfigVersion,
          rewardConfigVersion: rankRewardConfigVersion,
        },
        update: {
          configVersion: rankConfigVersion,
          rewardConfigVersion: rankRewardConfigVersion,
          generatedAt: new Date(),
        },
      });
      await tx.rankEntry.deleteMany({ where: { rankSnapshotId: snapshot.rankSnapshotId } });
      if (entries.length > 0) {
        await tx.rankEntry.createMany({
          data: entries.map((entry) => ({
            rankEntryId: `rank_entry_${randomUUID()}`,
            rankSnapshotId: snapshot.rankSnapshotId,
            targetType: entry.target_type,
            targetId: entry.target_id,
            displayName: entry.display_name,
            score: BigInt(entry.score),
            rankNo: entry.rank_no,
            rewardSnapshot: entry.reward_preview as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      return snapshot;
    });
  }

  private async getRankRiskNotes(playerIds: string[]): Promise<Map<string, string>> {
    if (playerIds.length === 0) {
      return new Map();
    }
    const records = await this.prisma.behaviorRiskRecord.findMany({
      where: {
        playerId: { in: playerIds },
        eraId: defaultEraId,
        resolutionStatus: "open",
        riskStatus: { in: ["decayed", "delayed_settlement", "manual_review", "rate_limited"] },
      },
    });
    const counts = new Map<string, number>();
    for (const record of records) {
      if (record.playerId) {
        counts.set(record.playerId, (counts.get(record.playerId) ?? 0) + 1);
      }
    }

    return new Map(
      Array.from(counts.entries()).map(([playerId, count]) => [
        playerId,
        `近期命中 ${count} 条风控记录，排行奖励需按后台复核结果发放`,
      ]),
    );
  }

  private async buildTitleCollection(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<TitleCollectionResponse> {
    const owned = await tx.playerAppearance.findMany({
      where: {
        playerId,
        appearanceId: { in: rankTitleRewards.map((reward) => reward.appearance_id) },
      },
    });
    const titles = rankTitleRewards.map((reward) =>
      toAppearanceState(
        owned.find((appearance) => appearance.appearanceId === reward.appearance_id) ?? null,
        reward.appearance_id,
      ),
    );
    const ownedInheritedCount = owned.filter((appearance) => appearance.inherited).length;

    return {
      titles,
      rank_title_rewards: rankTitleRewards,
      era_blessing: {
        owned_inherited_count: ownedInheritedCount,
        blessing_cap_percent: eraBlessingCapPercent,
        effective_percent: Math.min(eraBlessingCapPercent, ownedInheritedCount),
        rule: "称号可跨纪元继承展示，纪元祝福仅按 1% 上限展示，不叠加滚雪球。",
      },
      reward_boundary: rankRewardBoundary,
    };
  }

  private async findClaimableRankEntry(
    tx: Tx,
    playerId: string,
    rank: RankListResponse,
    titleReward: RankTitleRewardState,
  ): Promise<RankEntryState> {
    let targetId = playerId;
    if (rank.rank_type === "faction") {
      const factionState = await tx.playerFactionState.findUnique({ where: { playerId } });
      if (!factionState || factionState.route === "undecided") {
        throw new BadRequestException("请先选择仙魔 / 散修路线");
      }
      targetId = factionState.route;
    }

    const entry = rank.entries.find((item) => item.target_id === targetId);
    if (!entry || entry.rank_no > titleReward.min_rank) {
      throw new BadRequestException("当前名次暂未达到该称号领取条件");
    }

    return entry;
  }

  private async ensureTowerStates(tx: DbClient = this.prisma) {
    for (const config of towerConfigs) {
      await tx.towerState.upsert({
        where: { eraId_towerId: { eraId: defaultEraId, towerId: config.towerId } },
        create: {
          towerStateId: `tower_state_${randomUUID()}`,
          eraId: defaultEraId,
          provinceId: config.provinceId,
          towerId: config.towerId,
          towerName: config.towerName,
        },
        update: { towerName: config.towerName, provinceId: config.provinceId },
      });
    }
  }

  private async ensureBossState(tx: DbClient = this.prisma) {
    return tx.worldBossState.upsert({
      where: { eraId_bossId: { eraId: defaultEraId, bossId: bossConfig.bossId } },
      create: {
        bossStateId: `boss_state_${randomUUID()}`,
        eraId: defaultEraId,
        bossId: bossConfig.bossId,
        name: bossConfig.name,
        totalHp: bossConfig.totalHp,
        remainingHp: bossConfig.totalHp,
      },
      update: { name: bossConfig.name },
    });
  }

  private async ensureResourcePoints(tx: DbClient = this.prisma) {
    for (const config of resourcePointConfigs) {
      await tx.resourcePointState.upsert({
        where: { eraId_provinceId: { eraId: defaultEraId, provinceId: config.provinceId } },
        create: {
          resourcePointId: config.resourcePointId,
          eraId: defaultEraId,
          provinceId: config.provinceId,
          name: config.name,
        },
        update: { name: config.name },
      });
    }
  }

  private async requirePlayer(accountId: string, tx: DbClient = this.prisma): Promise<Player> {
    const player = await tx.player.findUnique({ where: { accountId } });
    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
  }

  private async getWalletState(tx: DbClient, playerId: string) {
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

  private async getBagByPlayerId(tx: DbClient, playerId: string) {
    const items = await tx.playerItem.findMany({
      where: { playerId, count: { gt: 0 } },
      orderBy: [{ locked: "desc" }, { createdAt: "asc" }],
    });

    return { items: items.map((item) => toBagItemState(item)) };
  }

  private async getSectMemberByPlayer(tx: DbClient, playerId: string): Promise<SectMember | null> {
    return tx.sectMember.findUnique({ where: { playerId } });
  }

  private async requireSectMember(tx: DbClient, playerId: string): Promise<SectMember> {
    const member = await this.getSectMemberByPlayer(tx, playerId);
    if (!member) {
      throw new BadRequestException("请先加入宗门");
    }

    return member;
  }

  private async getSectDetail(
    sectId: string,
    myMember?: SectMember | null,
    tx: DbClient = this.prisma,
  ): Promise<SectDetailResponse> {
    const sect = await tx.sect.findUnique({
      where: { sectId },
      include: {
        members: {
          include: { player: { select: { playerId: true, name: true } } },
          orderBy: [{ role: "asc" }, { contributionWeekly: "desc" }],
        },
        warehouse: { orderBy: { itemId: "asc" } },
      },
    });

    return toSectDetailResponse({ sect, myMember });
  }

  private async incrementSectContribution(
    tx: Tx,
    member: SectMember,
    contribution: number,
    fundGain: bigint,
  ) {
    await tx.sectMember.update({
      where: { sectMemberId: member.sectMemberId },
      data: {
        contributionDaily: { increment: contribution },
        contributionWeekly: { increment: contribution },
        contributionTotal: { increment: contribution },
      },
    });
    const sect = await tx.sect.update({
      where: { sectId: member.sectId },
      data: {
        funds: { increment: fundGain },
        buildExp: { increment: contribution },
      },
    });
    if (sect.buildExp >= sect.level * 200) {
      await tx.sect.update({
        where: { sectId: sect.sectId },
        data: { level: { increment: 1 }, memberLimit: { increment: 5 } },
      });
    }
  }

  private async consumeActionPoints(
    tx: Tx,
    playerId: string,
    actionPointCost: number,
  ): Promise<ActionState> {
    const state = await tx.playerActionState.findUniqueOrThrow({ where: { playerId } });
    const recoveredPoints = calculateRecoveredActionPoints(state);
    if (recoveredPoints < actionPointCost) {
      throw new BadRequestException("行动令不足");
    }

    const updated = await tx.playerActionState.update({
      where: { playerId },
      data: {
        actionPoints: recoveredPoints - actionPointCost,
        lastRecoveredAt: new Date(),
      },
    });

    return toActionState(updated);
  }

  private async calculatePlayerPower(tx: DbClient, playerId: string): Promise<number> {
    const player = await tx.player.findUniqueOrThrow({ where: { playerId } });
    const equipments = await tx.equipmentInstance.findMany({
      where: { playerId, status: "active" },
      include: { affixes: true },
    });
    const affixPower = equipments.reduce(
      (sum, equipment) =>
        sum + equipment.affixes.reduce((affixSum, affix) => affixSum + affix.value, 0),
      0,
    );

    return player.currentRealm * 120 + player.currentLevel * 45 + Math.floor(affixPower / 4);
  }

  private async consumeSpiritStone(
    tx: Tx,
    playerId: string,
    amount: bigint,
    source: { sourceType: string; sourceId?: string; idempotencyKey?: string },
  ) {
    const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
    if (wallet.spiritStone < amount) {
      throw new BadRequestException("灵石不足");
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

    for (const item of rewards.items ?? []) {
      await this.grantItem(tx, playerId, {
        itemId: item.item_id,
        count: item.count,
        bindType: item.bind_type,
        sourceType: source.sourceType,
      });
    }
  }

  private async grantItem(
    tx: Tx,
    playerId: string,
    input: { itemId: string; count: number; bindType: string; sourceType: string },
  ) {
    if (input.count <= 0) {
      return;
    }
    await tx.playerItem.create({
      data: {
        itemInstanceId: `item_${randomUUID()}`,
        playerId,
        itemId: input.itemId,
        count: BigInt(input.count),
        bindType: input.bindType,
        sourceType: input.sourceType,
      },
    });
  }

  private async decrementPlayerItem(
    tx: Tx,
    item: { itemInstanceId: string; count: bigint },
    count: number,
  ) {
    const nextCount = item.count - BigInt(count);
    if (nextCount <= 0n) {
      await tx.playerItem.delete({ where: { itemInstanceId: item.itemInstanceId } });
      return;
    }
    await tx.playerItem.update({
      where: { itemInstanceId: item.itemInstanceId },
      data: { count: nextCount },
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
        configVersion: multiplayerConfigVersion,
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

function normalizeTowerActionRequest(body: TowerActionRequest): Required<TowerActionRequest> {
  const towerId = body?.tower_id?.trim();
  const actionType = body?.action_type;
  const count = Math.floor(Number(body?.count ?? 1));
  if (!towerId) {
    throw new BadRequestException("请选择封印塔");
  }
  if (!["seal", "break", "supply", "guard"].includes(actionType)) {
    throw new BadRequestException("未知九塔行动");
  }
  if (!Number.isFinite(count) || count < 1 || count > maxTowerActionBatch) {
    throw new BadRequestException(`九塔行动次数需为 1-${maxTowerActionBatch}`);
  }

  return { tower_id: towerId, action_type: actionType, count };
}

function normalizeCreateSectRequest(body: CreateSectRequest): CreateSectRequest {
  const name = body?.name?.trim();
  const alignment = body?.alignment;
  if (!name || name.length < 2 || name.length > 12) {
    throw new BadRequestException("宗门名需为 2-12 个字符");
  }
  if (!validSectAlignments.includes(alignment)) {
    throw new BadRequestException("宗门立场不合法");
  }

  return { name, alignment };
}

function normalizeWarehouseDepositRequest(
  body: SectWarehouseDepositRequest,
): SectWarehouseDepositRequest {
  const count = Math.floor(Number(body?.count ?? 0));
  if (!body?.item_instance_id || !Number.isFinite(count) || count < 1) {
    throw new BadRequestException("请选择入库物品和数量");
  }

  return { item_instance_id: body.item_instance_id, count };
}

function normalizeWarehouseWithdrawRequest(
  body: SectWarehouseWithdrawRequest,
): SectWarehouseWithdrawRequest {
  const itemId = body?.item_id?.trim();
  const count = Math.floor(Number(body?.count ?? 0));
  if (!itemId || !Number.isFinite(count) || count < 1) {
    throw new BadRequestException("请选择出库物品和数量");
  }

  return { item_id: itemId, count };
}

function normalizePvpAttackRequest(body: PvpAttackRequest): PvpAttackRequest {
  const defenderPlayerId = body?.defender_player_id?.trim();
  if (!defenderPlayerId) {
    throw new BadRequestException("请选择防守目标");
  }

  return {
    defender_player_id: defenderPlayerId,
    resource_point_id: body.resource_point_id?.trim() || undefined,
  };
}

function normalizeRankType(value: unknown): RankType {
  const rankType = typeof value === "string" ? value.trim() : "";
  if (!supportedRankTypes.includes(rankType as RankType)) {
    throw new BadRequestException("未知排行榜");
  }

  return rankType as RankType;
}

function getTowerUpdate(
  actionType: TowerActionType,
  contribution: number,
): Prisma.TowerStateUpdateInput {
  if (actionType === "seal") {
    return {
      sealProgress: { increment: contribution },
      integrity: { increment: Math.floor(contribution / 2) },
      riftPressure: { decrement: Math.min(10, Math.floor(contribution / 5)) },
    };
  }
  if (actionType === "break") {
    return {
      breakProgress: { increment: contribution },
      integrity: { decrement: Math.floor(contribution / 3) },
      corruption: { increment: Math.floor(contribution / 6) },
    };
  }
  if (actionType === "supply") {
    return {
      supplyProgress: { increment: contribution },
      integrity: { increment: Math.floor(contribution / 3) },
    };
  }
  return {
    sealProgress: { increment: Math.floor(contribution / 2) },
    riftPressure: { decrement: Math.min(8, Math.floor(contribution / 6)) },
  };
}

function multiplyReward(reward: RewardBundle, count: number): RewardBundle {
  return {
    cultivation: reward.cultivation ? String(Number(reward.cultivation) * count) : undefined,
    spirit_stone: reward.spirit_stone ? String(Number(reward.spirit_stone) * count) : undefined,
    action_points: reward.action_points ? reward.action_points * count : undefined,
    items: reward.items?.map((item) => ({ ...item, count: item.count * count })),
  };
}

function calculateRecoveredActionPoints(state: PlayerActionState): number {
  const elapsedHours = Math.min(
    maxOfflineCultivationHours,
    Math.max(0, (Date.now() - state.lastRecoveredAt.getTime()) / (60 * 60 * 1000)),
  );
  const recovered = Math.floor(elapsedHours * state.actionPointRestorePerHour);
  return Math.min(state.actionPointCap, state.actionPoints + recovered);
}

function createSimpleBattleLog(input: {
  attackerName: string;
  defenderName: string;
  attackerSkill: string;
  defenderSkill: string;
  damageDone: number;
  damageTaken: number;
}): BattleRoundLog[] {
  return [
    {
      round: 1,
      actor: input.attackerName,
      skill: input.attackerSkill,
      damage: input.damageDone,
      target_hp: Math.max(0, 1000 - input.damageDone),
    },
    {
      round: 2,
      actor: input.defenderName,
      skill: input.defenderSkill,
      damage: input.damageTaken,
      target_hp: Math.max(0, 1000 - input.damageTaken),
    },
  ];
}

function buildTowerBattleInsight(input: {
  towerBefore: TowerStateSummary;
  towerAfter: TowerStateSummary;
  actionType: TowerActionType;
  contribution: number;
  settlementStatus: SettlementStatus;
}): Pick<TowerActionResponse, "reason_summary" | "counter_suggestions" | "battle_hint"> {
  const actionLabel = towerActionLabel(input.actionType);
  const integrityDelta = input.towerAfter.integrity - input.towerBefore.integrity;
  const pressureDelta = input.towerAfter.rift_pressure - input.towerBefore.rift_pressure;
  const progressText =
    input.actionType === "break"
      ? `破封进度推进 ${input.contribution}`
      : input.actionType === "supply"
        ? `补给进度推进 ${input.contribution}`
        : `镇封进度推进 ${input.contribution}`;
  const stateText =
    input.settlementStatus === "delayed"
      ? "本次贡献进入延迟结算，塔状态暂不立即改变。"
      : `塔体完整度 ${formatSigned(integrityDelta)}，裂隙压力 ${formatSigned(pressureDelta)}。`;

  return {
    reason_summary: [
      `${input.towerAfter.tower_name}完成${actionLabel}，贡献 +${input.contribution}。`,
      progressText,
      stateText,
    ],
    counter_suggestions: [
      "裂隙压力偏高时优先镇封或守护，塔体受损时优先补给。",
      "继续探索本州可补充镇塔材料，再回到九塔推进公共目标。",
    ],
    battle_hint: `${input.towerAfter.tower_name}本次受${actionLabel}影响，重点看贡献、完整度和裂隙压力变化。`,
  };
}

function buildBossBattleInsight(input: {
  bossBefore: WorldBossStateSummary;
  bossAfter: WorldBossStateSummary;
  damageDone: number;
  result: WorldBossChallengeResponse["result"];
}): Pick<WorldBossChallengeResponse, "reason_summary" | "counter_suggestions" | "battle_hint"> {
  const hpDelta = input.bossBefore.remaining_hp - input.bossAfter.remaining_hp;
  const phaseText =
    input.result === "phase_defeated"
      ? `阶段 ${input.bossBefore.phase} 已击破，Boss 进入第 ${input.bossAfter.phase} 阶。`
      : `本阶段血量减少 ${Math.max(0, hpDelta)}。`;

  return {
    reason_summary: [
      `本命法光造成 ${input.damageDone} 点伤害。`,
      phaseText,
      "关键回合是玩家先手输出后承受 Boss 反击。",
    ],
    counter_suggestions: [
      "伤害不足时优先炼器、服丹或调整技能预设。",
      "公共 Boss 与九塔都适合用剩余行动令推进全服目标。",
    ],
    battle_hint: `公共 Boss ${input.bossAfter.name} 战报重点看阶段血量、个人伤害和下一轮提升方向。`,
  };
}

function buildPvpBattleInsight(input: {
  result: PvpBattleResponse["result"];
  attackerPower: number;
  defenderPower: number;
  scoreDelta: number;
  settlementStatus: SettlementStatus;
  riskStatus: string;
  resourcePoint: ResourcePointSummary | null;
}): Pick<PvpBattleResponse, "reason_summary" | "counter_suggestions" | "battle_hint"> {
  const resultText = input.result === "win" ? "进攻成功" : "进攻受阻";
  const settlementText =
    input.settlementStatus === "delayed"
      ? "收益暂缓结算，需要等待整理。"
      : `积分变化 +${input.scoreDelta}。`;
  const gapSuggestion =
    input.attackerPower >= input.defenderPower
      ? "若要扩大优势，可继续提升技能释放顺序和法宝词条。"
      : "战力低于防守镜像时，先补服丹、炼器或调整主动技能。";
  const riskSuggestion =
    input.riskStatus === "decayed" || input.settlementStatus === "delayed"
      ? "重复目标或境界差过大时收益会收敛，建议更换目标或等待冷却。"
      : "选择战力接近的目标更稳定，失败也不会摧毁核心法宝。";

  return {
    reason_summary: [
      `${resultText}：进攻战力 ${input.attackerPower}，防守镜像 ${input.defenderPower}。`,
      settlementText,
      input.resourcePoint
        ? `${input.resourcePoint.name}控制权按本次结果更新。`
        : "本次未绑定资源点。",
    ],
    counter_suggestions: [gapSuggestion, riskSuggestion],
    battle_hint: "PVP 战报重点看战力差、收益状态和是否需要更换目标。",
  };
}

function towerActionLabel(actionType: TowerActionType): string {
  const labels: Record<TowerActionType, string> = {
    break: "破封",
    guard: "守护",
    seal: "镇封",
    supply: "补给",
  };

  return labels[actionType];
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function addScore(map: Map<string, bigint>, key: string, score: bigint) {
  map.set(key, (map.get(key) ?? 0n) + score);
}

function mergeScoreMap(target: Map<string, bigint>, source: Map<string, bigint>, weight = 1n) {
  for (const [key, score] of source.entries()) {
    addScore(target, key, score * weight);
  }
}

function alchemyQualityScore(quality: string | null): number {
  const scores: Record<string, number> = {
    rough: 20,
    normal: 30,
    fine: 45,
    flawless: 70,
    无瑕: 70,
  };

  return scores[quality ?? "normal"] ?? 30;
}

function equipmentOperationScore(operationType: string): number {
  const scores: Record<string, number> = {
    forge: 80,
    refine: 25,
    inscribe: 40,
    decompose: 5,
  };

  return scores[operationType] ?? 20;
}

function sortTowersByConfig<T extends { towerId: string }>(items: T[]): T[] {
  const order = new Map(towerConfigs.map((config, index) => [config.towerId, index]));
  return [...items].sort((left, right) => {
    const leftIndex = order.get(left.towerId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.towerId) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

function sortByProvinceConfig<T extends { provinceId: string }>(items: T[]): T[] {
  const order = new Map(towerConfigs.map((config, index) => [config.provinceId, index]));
  return [...items].sort((left, right) => {
    const leftIndex = order.get(left.provinceId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = order.get(right.provinceId) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex;
  });
}

function rollRange(seed: string, min: number, max: number): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return min + (hash % (max - min + 1));
}

function isExpired(item: { expireAt: Date | null }): boolean {
  return Boolean(item.expireAt && item.expireAt.getTime() <= Date.now());
}

function isPaidLikeSource(sourceType: string): boolean {
  return ["paid", "monthly", "vip", "gacha", "ancient_treasure"].some((keyword) =>
    sourceType.includes(keyword),
  );
}
