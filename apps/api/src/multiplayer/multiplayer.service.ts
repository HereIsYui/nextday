import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ActionState,
  BattleRoundLog,
  CreateSectRequest,
  JoinSectRequest,
  PvpAttackRequest,
  PvpBattleResponse,
  RankListResponse,
  RankType,
  ResourcePointListResponse,
  RewardBundle,
  SectDetailResponse,
  SectListResponse,
  SectMutationResponse,
  SectTaskResponse,
  SectWarehouseDepositRequest,
  SectWarehouseResponse,
  SectWarehouseWithdrawRequest,
  SettlementStatus,
  TowerActionRequest,
  TowerActionResponse,
  TowerActionType,
  TowerListResponse,
  WorldBossChallengeRequest,
  WorldBossChallengeResponse,
  WorldBossResponse,
} from "@nextday/shared";
import type { Player, PlayerActionState, Prisma, SectMember } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId, maxOfflineCultivationHours } from "../game/game.constants";
import { toActionState } from "../game/game.mappers";
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
  getCurrentWeekKey,
  maxTowerActionBatch,
  multiplayerConfigVersion,
  multiplayerRewardConfigVersion,
  pvpActionPointCost,
  rankRewardPreview,
  resourcePointConfigs,
  sectCreateCost,
  sectTaskConfigs,
  sectWarehouseWhitelist,
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

          return {
            record_id: record.recordId,
            tower: toTowerStateSummary(tower),
            contribution,
            rewards,
            action_state: actionState,
            risk_status: risk.risk_status,
            risk_record_id: risk.risk_record_id,
            settlement_status: "delayed",
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

        return {
          record_id: record.recordId,
          tower: toTowerStateSummary(updatedTower),
          contribution,
          rewards,
          action_state: actionState,
          risk_status: risk.risk_status,
          risk_record_id: risk.risk_record_id,
          settlement_status: "settled",
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

        return {
          record_id: record.recordId,
          boss: toBossStateSummary(boss),
          damage_done: damageDone,
          contribution: damageDone,
          result: defeated ? "phase_defeated" : "active",
          rewards,
          action_state: actionState,
          log,
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
    if (!["personal", "sect", "pvp_week", "tower_week"].includes(rankType)) {
      throw new BadRequestException("未知排行榜");
    }

    const periodKey = getCurrentWeekKey();
    if (rankType === "sect") {
      return this.getSectRank(periodKey);
    }
    if (rankType === "pvp_week") {
      return this.getPvpRank(periodKey);
    }
    if (rankType === "tower_week") {
      return this.getTowerRank(periodKey);
    }

    return this.getPersonalRank(periodKey);
  }

  private async getPersonalRank(periodKey: string): Promise<RankListResponse> {
    const scoreMap = new Map<string, bigint>();
    const [towerRecords, bossRecords, pvpRecords] = await Promise.all([
      this.prisma.towerActionRecord.findMany({ where: { eraId: defaultEraId } }),
      this.prisma.worldBossChallengeRecord.findMany({ where: { eraId: defaultEraId } }),
      this.prisma.pvpBattleRecord.findMany({ where: { eraId: defaultEraId } }),
    ]);
    for (const record of towerRecords) {
      addScore(scoreMap, record.playerId, BigInt(record.contribution));
    }
    for (const record of bossRecords) {
      addScore(scoreMap, record.playerId, BigInt(record.contribution));
    }
    for (const record of pvpRecords) {
      addScore(scoreMap, record.attackerPlayerId, BigInt(record.scoreDelta));
    }

    return this.rankPlayers("personal", periodKey, scoreMap);
  }

  private async getTowerRank(periodKey: string): Promise<RankListResponse> {
    const scoreMap = new Map<string, bigint>();
    const records = await this.prisma.towerActionRecord.findMany({
      where: { eraId: defaultEraId },
    });
    for (const record of records) {
      addScore(scoreMap, record.playerId, BigInt(record.contribution));
    }

    return this.rankPlayers("tower_week", periodKey, scoreMap);
  }

  private async getPvpRank(periodKey: string): Promise<RankListResponse> {
    const scoreMap = new Map<string, bigint>();
    const records = await this.prisma.pvpBattleRecord.findMany({ where: { eraId: defaultEraId } });
    for (const record of records) {
      addScore(scoreMap, record.attackerPlayerId, BigInt(record.scoreDelta));
    }

    return this.rankPlayers("pvp_week", periodKey, scoreMap);
  }

  private async getSectRank(periodKey: string): Promise<RankListResponse> {
    const sects = await this.prisma.sect.findMany({
      include: { members: true },
      orderBy: [{ level: "desc" }, { funds: "desc" }],
      take: 20,
    });
    const entries = sects
      .map((sect) => ({
        sect,
        score: sect.members.reduce(
          (sum, member) => sum + BigInt(member.contributionWeekly),
          sect.funds,
        ),
      }))
      .filter((item) => item.score > 0n)
      .sort((left, right) => Number(right.score - left.score))
      .slice(0, 20)
      .map((item, index) =>
        toRankEntryState({
          rankNo: index + 1,
          targetType: "sect",
          targetId: item.sect.sectId,
          displayName: item.sect.name,
          score: item.score,
          rewardPreview: rankRewardPreview.sect,
        }),
      );

    return { rank_type: "sect", period_key: periodKey, entries };
  }

  private async rankPlayers(
    rankType: RankType,
    periodKey: string,
    scoreMap: Map<string, bigint>,
  ): Promise<RankListResponse> {
    const players = await this.prisma.player.findMany({
      where: { playerId: { in: Array.from(scoreMap.keys()) } },
    });
    const playerNameMap = new Map(players.map((player) => [player.playerId, player.name]));
    const entries = Array.from(scoreMap.entries())
      .filter(([, score]) => score > 0n)
      .sort((left, right) => Number(right[1] - left[1]))
      .slice(0, 20)
      .map(([playerId, score], index) =>
        toRankEntryState({
          rankNo: index + 1,
          targetType: "player",
          targetId: playerId,
          displayName: playerNameMap.get(playerId) ?? playerId,
          score,
          rewardPreview: rankRewardPreview[rankType],
        }),
      );

    return { rank_type: rankType, period_key: periodKey, entries };
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

function addScore(map: Map<string, bigint>, key: string, score: bigint) {
  map.set(key, (map.get(key) ?? 0n) + score);
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
