import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type {
  AncientTreasureListResponse,
  AppearanceListResponse,
  AppearanceMutationResponse,
  ClaimAppearanceRequest,
  ClaimMonthlyDailyRequest,
  ClaimMonthlyDailyResponse,
  ConvenienceBatchPreviewRequest,
  ConvenienceBatchPreviewResponse,
  CreateAutomationQueueRequest,
  CreateAutomationQueueResponse,
  EntitlementOverviewResponse,
  EntitlementTier,
  EquipAppearanceRequest,
  GachaCostType,
  GachaDrawRequest,
  GachaDrawResponse,
  GachaHistoryResponse,
  GachaPoolListResponse,
  GachaPoolType,
  MonthlyCardStateSummary,
  PurchaseMonthlyCardRequest,
  PurchaseMonthlyCardResponse,
  RewardBundle,
  SaveConvenienceStrategyRequest,
  SaveConvenienceStrategyResponse,
  SyncVipRequest,
  SyncVipResponse,
} from "@nextday/shared";
import type { GachaPityState, MonthlyCardDrawGrant, Player, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { buildGachaExperience } from "../platform/experience";
import { hashRequestBody } from "../platform/utils/hash";
import { RiskService } from "../risk/risk.service";
import {
  ancientPageDrawCost,
  ancientTreasureConfigVersion,
  ancientTreasurePoolType,
  ancientTreasures,
  appearanceConfigs,
  commerceConfigVersion,
  commerceRewardConfigVersion,
  convenienceRules,
  gachaPoolConfigs,
  monthlyCardProducts,
  permanentPoolRewards,
  permanentPoolType,
  vipBoundJadeRewards,
} from "./commerce.constants";
import {
  toAncientTreasureSummary,
  toAppearanceState,
  toAutomationQueueState,
  toConvenienceStrategyState,
  toGachaRecordState,
  toGachaResult,
  toMonthlyCardState,
  toMonthlyGrantState,
  toVipState,
} from "./commerce.mappers";
import {
  automationRank,
  getEffectiveVipTier,
  getMonthlyTier,
  isActiveDate,
  maxTier,
} from "./commerce.rules";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;

@Injectable()
export class CommerceService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RiskService) private readonly riskService: RiskService,
  ) {}

  async getOverview(accountId: string): Promise<EntitlementOverviewResponse> {
    const player = await this.requirePlayer(accountId);
    const [monthlyCards, vip, availableGrants] = await Promise.all([
      this.prisma.monthlyCardState.findMany({
        where: { playerId: player.playerId },
        orderBy: { cardType: "asc" },
      }),
      this.prisma.playerVipState.findUnique({ where: { playerId: player.playerId } }),
      this.prisma.monthlyCardDrawGrant.findMany({
        where: {
          playerId: player.playerId,
          poolType: ancientTreasurePoolType,
          expiresAt: { gt: new Date() },
          usedCount: { lt: 99 },
        },
        orderBy: { expiresAt: "asc" },
      }),
    ]);
    const effectiveTier = this.resolveEffectiveTier(monthlyCards, vip);

    return {
      effective_tier: effectiveTier,
      monthly_cards: monthlyCards.map(toMonthlyCardState),
      vip: toVipState(vip),
      convenience: convenienceRules[effectiveTier],
      available_monthly_grants: availableGrants
        .filter((grant) => grant.usedCount < grant.drawCount)
        .map(toMonthlyGrantState),
    };
  }

  async purchaseMonthlyCard(input: {
    accountId: string;
    body: PurchaseMonthlyCardRequest;
    idempotencyKey: string;
  }): Promise<PurchaseMonthlyCardResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizePurchaseMonthlyCardRequest(input.body);
    const product = monthlyCardProducts[body.card_type];

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/monthly-cards/purchase",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const now = new Date();
        const previous = await tx.monthlyCardState.findUnique({
          where: { playerId_cardType: { playerId: player.playerId, cardType: body.card_type } },
        });
        const baseTime =
          previous && previous.activeUntil.getTime() > now.getTime() ? previous.activeUntil : now;
        const activeUntil = new Date(
          baseTime.getTime() + product.duration_days * 24 * 60 * 60 * 1000,
        );
        const order = await tx.purchaseOrder.create({
          data: {
            orderId: `order_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            productId: product.product_id,
            productType: "monthly_card",
            fishpiPointCost: BigInt(product.fishpi_point_cost),
            paidJadeAmount: 0n,
            boundJadeAmount: 0n,
            status: "paid",
            configVersion: commerceConfigVersion,
            rewardConfigVersion: commerceRewardConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        const card = await tx.monthlyCardState.upsert({
          where: { playerId_cardType: { playerId: player.playerId, cardType: body.card_type } },
          create: {
            monthlyCardStateId: `monthly_card_${randomUUID()}`,
            playerId: player.playerId,
            cardType: body.card_type,
            activeUntil,
            remainingDays: product.duration_days,
            sourceOrderId: order.orderId,
            configVersion: commerceConfigVersion,
          },
          update: {
            activeUntil,
            remainingDays: { increment: product.duration_days },
            sourceOrderId: order.orderId,
            configVersion: commerceConfigVersion,
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "monthly_card_purchase",
          targetType: "monthly_card_state",
          targetId: card.monthlyCardStateId,
          afterSnapshot: {
            order_id: order.orderId,
            card: toMonthlyCardState(card),
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          order_id: order.orderId,
          monthly_card: toMonthlyCardState(card),
          wallet: await this.getWalletState(tx, player.playerId),
        };
      },
    });
  }

  async claimMonthlyDaily(input: {
    accountId: string;
    body: ClaimMonthlyDailyRequest;
    idempotencyKey: string;
  }): Promise<ClaimMonthlyDailyResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeClaimMonthlyDailyRequest(input.body);
    const product = monthlyCardProducts[body.card_type];

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/monthly-cards/claim-daily",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const today = currentDateKey();
        const card = await tx.monthlyCardState.findUnique({
          where: { playerId_cardType: { playerId: player.playerId, cardType: body.card_type } },
        });
        if (!card || !isActiveDate(card.activeUntil) || card.remainingDays <= 0) {
          throw new BadRequestException("月卡未生效或已过期");
        }

        if (card.lastClaimDate === today) {
          const grants = await this.getTodayMonthlyGrants(tx, player.playerId, body.card_type);
          return {
            record_id: `monthly_daily_${randomUUID()}`,
            claimed: false,
            card_type: body.card_type,
            rewards: {},
            grants: grants.map(toMonthlyGrantState),
            wallet: await this.getWalletState(tx, player.playerId),
          };
        }

        const rewards: RewardBundle = {
          jade_paid: product.daily_paid_jade,
          jade_bound: product.daily_bound_jade,
        };
        await this.changeWallet(tx, player.playerId, "jade_paid", BigInt(product.daily_paid_jade), {
          sourceType: "monthly_daily",
          sourceId: body.card_type,
          idempotencyKey: `${input.idempotencyKey}:paid_jade`,
        });
        await this.changeWallet(
          tx,
          player.playerId,
          "jade_bound",
          BigInt(product.daily_bound_jade),
          {
            sourceType: "monthly_daily",
            sourceId: body.card_type,
            idempotencyKey: `${input.idempotencyKey}:bound_jade`,
          },
        );

        const grant = await tx.monthlyCardDrawGrant.upsert({
          where: {
            playerId_cardType_poolType_grantDate: {
              playerId: player.playerId,
              cardType: body.card_type,
              poolType: ancientTreasurePoolType,
              grantDate: today,
            },
          },
          create: {
            grantId: `grant_${randomUUID()}`,
            playerId: player.playerId,
            cardType: body.card_type,
            poolType: ancientTreasurePoolType,
            grantDate: today,
            drawCount: product.daily_ancient_draws,
            usedCount: 0,
            expiresAt: nextDateStart(),
            sourceOrderId: card.sourceOrderId,
            gachaConfigVersion: commerceConfigVersion,
          },
          update: {},
        });
        await tx.monthlyCardState.update({
          where: { monthlyCardStateId: card.monthlyCardStateId },
          data: {
            lastClaimDate: today,
            remainingDays: Math.max(0, card.remainingDays - 1),
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "monthly_daily_claim",
          targetType: "monthly_card_state",
          targetId: card.monthlyCardStateId,
          afterSnapshot: {
            rewards,
            grant: toMonthlyGrantState(grant),
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: `monthly_daily_${randomUUID()}`,
          claimed: true,
          card_type: body.card_type,
          rewards,
          grants: [toMonthlyGrantState(grant)],
          wallet: await this.getWalletState(tx, player.playerId),
        };
      },
    });
  }

  async syncVip(input: {
    accountId: string;
    body: SyncVipRequest;
    idempotencyKey: string;
  }): Promise<SyncVipResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeSyncVipRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/vip/sync",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const activeUntil =
          body.vip_level > 0
            ? new Date(Date.now() + (body.active_days ?? 30) * 24 * 60 * 60 * 1000)
            : null;
        const vip = await tx.playerVipState.upsert({
          where: { playerId: player.playerId },
          create: {
            playerId: player.playerId,
            vipLevel: body.vip_level,
            activeUntil,
            sourceType: "mock_fishpi",
            configVersion: commerceConfigVersion,
          },
          update: {
            vipLevel: body.vip_level,
            activeUntil,
            sourceType: "mock_fishpi",
            configVersion: commerceConfigVersion,
          },
        });
        const boundJade = BigInt(vipBoundJadeRewards[body.vip_level] ?? 0);
        const rewards: RewardBundle = boundJade > 0n ? { jade_bound: boundJade.toString() } : {};
        if (boundJade > 0n) {
          await this.changeWallet(tx, player.playerId, "jade_bound", boundJade, {
            sourceType: "vip_sync",
            sourceId: `vip${body.vip_level}`,
            idempotencyKey: `${input.idempotencyKey}:bound_jade`,
          });
        }
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "vip_sync",
          targetType: "player_vip_state",
          targetId: player.playerId,
          afterSnapshot: {
            vip: toVipState(vip),
            rewards,
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: `vip_sync_${randomUUID()}`,
          vip: toVipState(vip),
          rewards,
          wallet: await this.getWalletState(tx, player.playerId),
        };
      },
    });
  }

  async listGachaPools(accountId: string): Promise<GachaPoolListResponse> {
    const player = await this.requirePlayer(accountId);
    const pools = await Promise.all(
      Object.values(gachaPoolConfigs).map(async (pool) => {
        const pity = await this.ensurePityState(this.prisma, player.playerId, pool.poolType);
        return {
          pool_type: pool.poolType,
          name: pool.name,
          allowed_cost_types: pool.allowedCostTypes,
          reserved_cost_types: pool.reservedCostTypes,
          single_cost: pool.singleCost.toString(),
          guarantee_at: pool.guaranteeAt,
          pity_count: pity.pityCount,
          total_draws: pity.totalDraws,
          result_ids:
            pool.poolType === ancientTreasurePoolType
              ? ancientTreasures.map((treasure) => treasure.treasureId)
              : permanentPoolRewards.map((item) => item.itemId),
        };
      }),
    );

    return { pools };
  }

  async drawGacha(input: {
    accountId: string;
    body: GachaDrawRequest;
    idempotencyKey: string;
  }): Promise<GachaDrawResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeGachaDrawRequest(input.body);
    const pool = gachaPoolConfigs[body.pool_type];
    if (
      pool.poolType === ancientTreasurePoolType &&
      pool.reservedCostTypes.includes(body.cost_type)
    ) {
      throw new ForbiddenException("九大古宝仙玉直抽暂未开放");
    }
    if (!pool.allowedCostTypes.includes(body.cost_type)) {
      throw new BadRequestException("该卡池不支持此消耗类型");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/gacha/draw",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const pity = await this.ensurePityState(tx, player.playerId, pool.poolType);
        if (pool.poolType === permanentPoolType) {
          return this.drawPermanentPool(tx, player, body, pity, input.idempotencyKey);
        }

        return this.drawAncientTreasurePool(tx, player, body, pity, input.idempotencyKey);
      },
    });
  }

  async getGachaHistory(accountId: string): Promise<GachaHistoryResponse> {
    const player = await this.requirePlayer(accountId);
    const records = await this.prisma.gachaRecord.findMany({
      where: { playerId: player.playerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { records: records.map(toGachaRecordState) };
  }

  async listAncientTreasures(accountId: string): Promise<AncientTreasureListResponse> {
    const player = await this.requirePlayer(accountId);
    const states = await this.prisma.ancientTreasureState.findMany({
      where: { playerId: player.playerId, eraId: defaultEraId },
    });

    return {
      treasures: ancientTreasures.map((treasure) =>
        toAncientTreasureSummary(
          states.find((state) => state.treasureId === treasure.treasureId) ?? null,
          treasure.treasureId,
        ),
      ),
    };
  }

  async previewBatch(input: {
    accountId: string;
    body: ConvenienceBatchPreviewRequest;
    idempotencyKey?: string | null;
  }): Promise<ConvenienceBatchPreviewResponse> {
    const player = await this.requirePlayer(input.accountId);
    const requestedCount = Math.floor(Number(input.body?.requested_count ?? 0));
    if (!Number.isFinite(requestedCount) || requestedCount < 1) {
      throw new BadRequestException("批量次数需大于 0");
    }
    const overview = await this.getOverviewByPlayer(player.playerId);
    const limit = overview.convenience.batch_sweep_limit;
    const acceptedCount = Math.min(requestedCount, limit);
    if (requestedCount > acceptedCount) {
      await this.riskService.evaluateAndRecord({
        accountId: input.accountId,
        playerId: player.playerId,
        riskDomain: "entitlement",
        actionType: "batch_preview",
        targetType: "convenience",
        targetId: overview.effective_tier,
        path: "/api/commerce/convenience/batch-preview",
        requestedCount,
        acceptedCount,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          requested_count: requestedCount,
          accepted_count: acceptedCount,
          tier: overview.effective_tier,
        },
      });
    }

    return {
      requested_count: requestedCount,
      accepted_count: acceptedCount,
      limit,
      effective_tier: overview.effective_tier,
      reward_multiplier: 1,
    };
  }

  async saveStrategy(input: {
    accountId: string;
    body: SaveConvenienceStrategyRequest;
    idempotencyKey: string;
  }): Promise<SaveConvenienceStrategyResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeStrategyRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/convenience/strategies",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const overview = await this.getOverviewByPlayer(player.playerId, tx);
        const usedSlots = await tx.convenienceStrategy.count({
          where: { playerId: player.playerId, status: "active" },
        });
        if (usedSlots >= overview.convenience.strategy_slots) {
          await this.riskService.evaluateAndRecord({
            accountId: input.accountId,
            playerId: player.playerId,
            riskDomain: "entitlement",
            actionType: "strategy_slot_exceeded",
            targetType: "convenience",
            targetId: body.strategy_type,
            path: "/api/commerce/convenience/strategies",
            privilegeViolation: true,
            idempotencyKey: input.idempotencyKey,
            metadata: {
              used_slots: usedSlots,
              slot_limit: overview.convenience.strategy_slots,
              tier: overview.effective_tier,
            },
          });
          throw new ForbiddenException("自动策略槽位不足");
        }
        const strategy = await tx.convenienceStrategy.create({
          data: {
            strategyId: `strategy_${randomUUID()}`,
            playerId: player.playerId,
            strategyName: body.strategy_name,
            strategyType: body.strategy_type,
            tierAtCreate: overview.effective_tier,
            configSnapshot: body.config as Prisma.InputJsonValue,
            status: "active",
            configVersion: commerceConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });

        return {
          strategy: toConvenienceStrategyState(strategy),
          used_slots: usedSlots + 1,
          slot_limit: overview.convenience.strategy_slots,
        };
      },
    });
  }

  async createAutomationQueue(input: {
    accountId: string;
    body: CreateAutomationQueueRequest;
    idempotencyKey: string;
  }): Promise<CreateAutomationQueueResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeQueueRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/convenience/automation-queues",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const overview = await this.getOverviewByPlayer(player.playerId, tx);
        if (
          automationRank(overview.convenience.automation_queue) < automationRank(body.queue_type)
        ) {
          await this.riskService.evaluateAndRecord({
            accountId: input.accountId,
            playerId: player.playerId,
            riskDomain: "entitlement",
            actionType: "automation_queue_unauthorized",
            targetType: "automation_queue",
            targetId: body.queue_type,
            path: "/api/commerce/convenience/automation-queues",
            privilegeViolation: true,
            highImpact: true,
            idempotencyKey: input.idempotencyKey,
            metadata: {
              requested_queue_type: body.queue_type,
              allowed_queue_type: overview.convenience.automation_queue,
              tier: overview.effective_tier,
            },
          });
          throw new ForbiddenException("当前权益不支持该托管队列");
        }
        const acceptedActions = body.actions.slice(0, overview.convenience.batch_sweep_limit);
        const queue = await tx.automationQueue.create({
          data: {
            queueId: `queue_${randomUUID()}`,
            playerId: player.playerId,
            queueType: body.queue_type,
            entitlementTier: overview.effective_tier,
            requestedActions: body.actions as unknown as Prisma.InputJsonValue,
            acceptedActions: acceptedActions as unknown as Prisma.InputJsonValue,
            status: "pending",
            configVersion: commerceConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });

        return {
          queue: toAutomationQueueState(queue),
          convenience: overview.convenience,
        };
      },
    });
  }

  async listAppearances(accountId: string): Promise<AppearanceListResponse> {
    const player = await this.requirePlayer(accountId);
    const owned = await this.prisma.playerAppearance.findMany({
      where: { playerId: player.playerId },
    });

    return {
      appearances: appearanceConfigs.map((config) =>
        toAppearanceState(
          owned.find((appearance) => appearance.appearanceId === config.appearanceId) ?? null,
          config.appearanceId,
        ),
      ),
    };
  }

  async claimAppearance(input: {
    accountId: string;
    body: ClaimAppearanceRequest;
    idempotencyKey: string;
  }): Promise<AppearanceMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeAppearanceRequest(input.body);
    const config = appearanceConfigs.find((item) => item.appearanceId === body.appearance_id);
    if (!config) {
      throw new BadRequestException("外观不存在");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/appearances/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const appearance = await tx.playerAppearance.upsert({
          where: {
            playerId_appearanceId: {
              playerId: player.playerId,
              appearanceId: config.appearanceId,
            },
          },
          create: {
            playerAppearanceId: `appearance_${randomUUID()}`,
            playerId: player.playerId,
            appearanceId: config.appearanceId,
            appearanceType: config.appearanceType,
            sourceType: config.sourceType,
            inherited: false,
            equipped: false,
            configVersion: commerceConfigVersion,
          },
          update: {},
        });

        return {
          record_id: `appearance_claim_${randomUUID()}`,
          appearance: toAppearanceState(appearance, appearance.appearanceId),
        };
      },
    });
  }

  async equipAppearance(input: {
    accountId: string;
    body: EquipAppearanceRequest;
    idempotencyKey: string;
  }): Promise<AppearanceMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeAppearanceRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/commerce/appearances/equip",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const appearance = await tx.playerAppearance.findUnique({
          where: {
            playerId_appearanceId: {
              playerId: player.playerId,
              appearanceId: body.appearance_id,
            },
          },
        });
        if (!appearance) {
          throw new BadRequestException("尚未拥有该外观");
        }
        await tx.playerAppearance.updateMany({
          where: {
            playerId: player.playerId,
            appearanceType: appearance.appearanceType,
          },
          data: { equipped: false },
        });
        const equipped = await tx.playerAppearance.update({
          where: { playerAppearanceId: appearance.playerAppearanceId },
          data: { equipped: true },
        });

        return {
          record_id: `appearance_equip_${randomUUID()}`,
          appearance: toAppearanceState(equipped, equipped.appearanceId),
        };
      },
    });
  }

  private async drawPermanentPool(
    tx: Tx,
    player: Player,
    body: GachaDrawRequest,
    pity: GachaPityState,
    idempotencyKey: string,
  ): Promise<GachaDrawResponse> {
    if (body.cost_type !== "paid_jade" && body.cost_type !== "bound_jade") {
      throw new BadRequestException("常驻机缘池只支持仙玉或绑定仙玉");
    }
    await this.changeWallet(tx, player.playerId, jadeCurrencyType(body.cost_type), -100n, {
      sourceType: "gacha",
      sourceId: permanentPoolType,
      idempotencyKey: `${idempotencyKey}:cost`,
    });

    const pityBefore = pity.pityCount;
    const result = pickWeighted(permanentPoolRewards, `${idempotencyKey}:permanent`);
    await this.grantItem(tx, player.playerId, {
      itemId: result.itemId,
      count: 1,
      bindType: "bound",
      sourceType: "gacha_permanent",
    });
    const pityAfter = pityBefore + 1 >= gachaPoolConfigs.permanent.guaranteeAt ? 0 : pityBefore + 1;
    const gacha = await tx.gachaRecord.create({
      data: {
        gachaId: `gacha_${randomUUID()}`,
        playerId: player.playerId,
        eraId: defaultEraId,
        poolType: permanentPoolType,
        costType: body.cost_type,
        costAmount: 100n,
        resultType: "item",
        resultId: result.itemId,
        resultName: result.name,
        duplicate: false,
        pityBefore,
        pityAfter,
        resultSnapshot: {
          item_id: result.itemId,
          name: result.name,
          count: 1,
        },
        gachaConfigVersion: commerceConfigVersion,
        rewardConfigVersion: commerceRewardConfigVersion,
        idempotencyKey,
      },
    });
    await this.updatePity(tx, pity, pityAfter, gacha.gachaId);

    return {
      gacha_id: gacha.gachaId,
      pool_type: permanentPoolType,
      cost_type: body.cost_type,
      result: toGachaResult(gacha),
      pity_before: pityBefore,
      pity_after: pityAfter,
      wallet: await this.getWalletState(tx, player.playerId),
      experience: buildGachaExperience({
        poolType: permanentPoolType,
        costType: body.cost_type,
        result: toGachaResult(gacha),
        pityBefore,
        pityAfter,
      }),
    };
  }

  private async drawAncientTreasurePool(
    tx: Tx,
    player: Player,
    body: GachaDrawRequest,
    pity: GachaPityState,
    idempotencyKey: string,
  ): Promise<GachaDrawResponse> {
    let grantId: string | undefined;
    if (body.cost_type === "monthly_grant") {
      const grant = await this.consumeMonthlyGrant(tx, player.playerId, body.grant_id);
      grantId = grant.grantId;
    } else if (body.cost_type === "ancient_page") {
      await this.consumeItem(tx, player.playerId, "ancient_page", ancientPageDrawCost);
    } else {
      throw new BadRequestException("九大古宝池只支持月卡赠抽或残页合成");
    }

    const pityBefore = pity.pityCount;
    const guaranteed = pityBefore + 1 >= gachaPoolConfigs.ancient_treasure.guaranteeAt;
    const treasure = await this.pickAncientTreasure(
      tx,
      player.playerId,
      idempotencyKey,
      guaranteed,
    );
    const existing = await tx.ancientTreasureState.findUnique({
      where: {
        playerId_eraId_treasureId: {
          playerId: player.playerId,
          eraId: defaultEraId,
          treasureId: treasure.treasureId,
        },
      },
    });
    const duplicate = Boolean(existing?.owned);
    const conversion: RewardBundle | null = duplicate
      ? {
          items: [
            {
              item_id: `${treasure.treasureId}_fragment`,
              name: `${treasure.name}碎片`,
              count: 10,
              bind_type: "bound",
            },
          ],
        }
      : null;
    const pityAfter = guaranteed ? 0 : pityBefore + 1;
    const gacha = await tx.gachaRecord.create({
      data: {
        gachaId: `gacha_${randomUUID()}`,
        playerId: player.playerId,
        eraId: defaultEraId,
        poolType: ancientTreasurePoolType,
        costType: body.cost_type,
        costAmount: body.cost_type === "ancient_page" ? BigInt(ancientPageDrawCost) : 0n,
        grantId,
        resultType: "ancient_treasure",
        resultId: treasure.treasureId,
        resultName: treasure.name,
        duplicate,
        pityBefore,
        pityAfter,
        conversionSnapshot: conversion
          ? (conversion as unknown as Prisma.InputJsonValue)
          : undefined,
        resultSnapshot: {
          treasure_id: treasure.treasureId,
          name: treasure.name,
          duplicate,
        },
        gachaConfigVersion: commerceConfigVersion,
        rewardConfigVersion: commerceRewardConfigVersion,
        idempotencyKey,
      },
    });
    await tx.ancientTreasureState.upsert({
      where: {
        playerId_eraId_treasureId: {
          playerId: player.playerId,
          eraId: defaultEraId,
          treasureId: treasure.treasureId,
        },
      },
      create: {
        ancientTreasureStateId: `ancient_treasure_${randomUUID()}`,
        playerId: player.playerId,
        eraId: defaultEraId,
        treasureId: treasure.treasureId,
        owned: true,
        starLevel: 0,
        fragmentCount: 0,
        soulCount: 0,
        sourceGachaId: gacha.gachaId,
        treasureConfigVersion: ancientTreasureConfigVersion,
        acquiredAt: new Date(),
      },
      update: duplicate
        ? {
            fragmentCount: { increment: 10 },
            soulCount: { increment: 1 },
            treasureConfigVersion: ancientTreasureConfigVersion,
          }
        : {
            owned: true,
            sourceGachaId: gacha.gachaId,
            treasureConfigVersion: ancientTreasureConfigVersion,
            acquiredAt: new Date(),
          },
    });
    await this.updatePity(tx, pity, pityAfter, gacha.gachaId);

    return {
      gacha_id: gacha.gachaId,
      pool_type: ancientTreasurePoolType,
      cost_type: body.cost_type,
      result: toGachaResult(gacha),
      pity_before: pityBefore,
      pity_after: pityAfter,
      wallet: await this.getWalletState(tx, player.playerId),
      experience: buildGachaExperience({
        poolType: ancientTreasurePoolType,
        costType: body.cost_type,
        result: toGachaResult(gacha),
        pityBefore,
        pityAfter,
      }),
    };
  }

  private async getOverviewByPlayer(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<EntitlementOverviewResponse> {
    const [monthlyCards, vip, availableGrants] = await Promise.all([
      tx.monthlyCardState.findMany({ where: { playerId }, orderBy: { cardType: "asc" } }),
      tx.playerVipState.findUnique({ where: { playerId } }),
      tx.monthlyCardDrawGrant.findMany({
        where: {
          playerId,
          poolType: ancientTreasurePoolType,
          expiresAt: { gt: new Date() },
        },
        orderBy: { expiresAt: "asc" },
      }),
    ]);
    const effectiveTier = this.resolveEffectiveTier(monthlyCards, vip);

    return {
      effective_tier: effectiveTier,
      monthly_cards: monthlyCards.map(toMonthlyCardState),
      vip: toVipState(vip),
      convenience: convenienceRules[effectiveTier],
      available_monthly_grants: availableGrants
        .filter((grant) => grant.usedCount < grant.drawCount)
        .map(toMonthlyGrantState),
    };
  }

  private resolveEffectiveTier(
    monthlyCards: Array<{ cardType: string; activeUntil: Date; remainingDays: number }>,
    vip: { vipLevel: number; activeUntil: Date | null } | null,
  ): EntitlementTier {
    let tier: EntitlementTier =
      vip && (!vip.activeUntil || isActiveDate(vip.activeUntil))
        ? getEffectiveVipTier(vip.vipLevel)
        : "free";
    for (const card of monthlyCards) {
      if (card.remainingDays > 0 && isActiveDate(card.activeUntil)) {
        tier = maxTier(tier, getMonthlyTier(card.cardType as "small_monthly" | "large_monthly"));
      }
    }

    return tier;
  }

  private async getTodayMonthlyGrants(
    tx: DbClient,
    playerId: string,
    cardType: string,
  ): Promise<MonthlyCardDrawGrant[]> {
    return tx.monthlyCardDrawGrant.findMany({
      where: {
        playerId,
        cardType,
        poolType: ancientTreasurePoolType,
        grantDate: currentDateKey(),
      },
      orderBy: { createdAt: "asc" },
    });
  }

  private async consumeMonthlyGrant(
    tx: Tx,
    playerId: string,
    grantId?: string,
  ): Promise<MonthlyCardDrawGrant> {
    const grant = grantId
      ? await tx.monthlyCardDrawGrant.findFirst({
          where: {
            grantId,
            playerId,
            poolType: ancientTreasurePoolType,
            expiresAt: { gt: new Date() },
          },
        })
      : await tx.monthlyCardDrawGrant.findFirst({
          where: {
            playerId,
            poolType: ancientTreasurePoolType,
            expiresAt: { gt: new Date() },
            usedCount: { lt: 99 },
          },
          orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }],
        });

    if (!grant || grant.usedCount >= grant.drawCount) {
      throw new BadRequestException("没有可用的月卡古宝赠抽");
    }

    return tx.monthlyCardDrawGrant.update({
      where: { grantId: grant.grantId },
      data: { usedCount: { increment: 1 } },
    });
  }

  private async pickAncientTreasure(tx: Tx, playerId: string, seed: string, guaranteed: boolean) {
    if (guaranteed) {
      const states = await tx.ancientTreasureState.findMany({
        where: { playerId, eraId: defaultEraId, owned: true },
      });
      const owned = new Set(states.map((state) => state.treasureId));
      const unowned = ancientTreasures.find((treasure) => !owned.has(treasure.treasureId));
      if (unowned) {
        return unowned;
      }
    }

    return ancientTreasures[rollRange(seed, 0, ancientTreasures.length - 1)];
  }

  private async ensurePityState(
    tx: DbClient,
    playerId: string,
    poolType: GachaPoolType,
  ): Promise<GachaPityState> {
    const pool = gachaPoolConfigs[poolType];
    return tx.gachaPityState.upsert({
      where: { playerId_eraId_poolType: { playerId, eraId: defaultEraId, poolType } },
      create: {
        gachaPityStateId: `pity_${randomUUID()}`,
        playerId,
        eraId: defaultEraId,
        poolType,
        pityCount: 0,
        totalDraws: 0,
        guaranteeAt: pool.guaranteeAt,
        gachaConfigVersion: commerceConfigVersion,
      },
      update: { guaranteeAt: pool.guaranteeAt, gachaConfigVersion: commerceConfigVersion },
    });
  }

  private async updatePity(tx: Tx, pity: GachaPityState, pityAfter: number, gachaId: string) {
    await tx.gachaPityState.update({
      where: { gachaPityStateId: pity.gachaPityStateId },
      data: {
        pityCount: pityAfter,
        totalDraws: { increment: 1 },
        lastGachaId: gachaId,
        gachaConfigVersion: commerceConfigVersion,
      },
    });
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

  private async changeWallet(
    tx: Tx,
    playerId: string,
    currencyType: "jade_paid" | "jade_bound",
    amount: bigint,
    source: { sourceType: string; sourceId?: string; idempotencyKey?: string },
  ) {
    const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
    const beforeAmount = currencyType === "jade_paid" ? wallet.jadePaid : wallet.jadeBound;
    const afterAmount = beforeAmount + amount;
    if (afterAmount < 0n) {
      throw new BadRequestException(currencyType === "jade_paid" ? "仙玉不足" : "绑定仙玉不足");
    }
    await tx.playerWallet.update({
      where: { playerId },
      data:
        currencyType === "jade_paid"
          ? { jadePaid: { increment: amount } }
          : { jadeBound: { increment: amount } },
    });
    await tx.walletLog.create({
      data: {
        logId: `wallet_${randomUUID()}`,
        playerId,
        currencyType,
        changeAmount: amount,
        beforeAmount,
        afterAmount,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        idempotencyKey: source.idempotencyKey,
      },
    });
  }

  private async grantItem(
    tx: Tx,
    playerId: string,
    input: { itemId: string; count: number; bindType: string; sourceType: string },
  ) {
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

  private async consumeItem(tx: Tx, playerId: string, itemId: string, count: number) {
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
    const total = rows.reduce((sum, item) => sum + item.count, 0n);
    if (total < BigInt(count)) {
      throw new BadRequestException("九大古宝残页不足");
    }

    let remaining = BigInt(count);
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
        configVersion: commerceConfigVersion,
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

function normalizePurchaseMonthlyCardRequest(
  body: PurchaseMonthlyCardRequest,
): PurchaseMonthlyCardRequest {
  if (!body || !monthlyCardProducts[body.card_type]) {
    throw new BadRequestException("请选择有效月卡");
  }

  return { card_type: body.card_type };
}

function normalizeClaimMonthlyDailyRequest(
  body: ClaimMonthlyDailyRequest,
): ClaimMonthlyDailyRequest {
  if (!body || !monthlyCardProducts[body.card_type]) {
    throw new BadRequestException("请选择有效月卡");
  }

  return { card_type: body.card_type };
}

function normalizeSyncVipRequest(body: SyncVipRequest): Required<SyncVipRequest> {
  const vipLevel = Math.floor(Number(body?.vip_level ?? 0));
  const activeDays = Math.floor(Number(body?.active_days ?? 30));
  if (!Number.isFinite(vipLevel) || vipLevel < 0 || vipLevel > 4) {
    throw new BadRequestException("VIP 等级需为 0-4");
  }
  if (!Number.isFinite(activeDays) || activeDays < 1 || activeDays > 366) {
    throw new BadRequestException("VIP 有效天数需为 1-366");
  }

  return { vip_level: vipLevel as 0 | 1 | 2 | 3 | 4, active_days: activeDays };
}

function normalizeGachaDrawRequest(body: GachaDrawRequest): GachaDrawRequest {
  const poolType = body?.pool_type;
  const costType = body?.cost_type;
  if (!poolType || !gachaPoolConfigs[poolType]) {
    throw new BadRequestException("卡池不存在");
  }
  if (!costType) {
    throw new BadRequestException("请选择抽取消耗");
  }

  return {
    pool_type: poolType,
    cost_type: costType,
    grant_id: body.grant_id?.trim() || undefined,
  };
}

function normalizeStrategyRequest(
  body: SaveConvenienceStrategyRequest,
): SaveConvenienceStrategyRequest {
  const strategyName = body?.strategy_name?.trim();
  const strategyType = body?.strategy_type;
  if (!strategyName || strategyName.length > 16) {
    throw new BadRequestException("策略名需为 1-16 个字符");
  }
  if (!["daily", "tower", "boss", "pvp"].includes(strategyType)) {
    throw new BadRequestException("策略类型不合法");
  }

  return {
    strategy_name: strategyName,
    strategy_type: strategyType,
    config: body.config ?? {},
  };
}

function normalizeQueueRequest(body: CreateAutomationQueueRequest): CreateAutomationQueueRequest {
  const queueType = body?.queue_type;
  const actions = Array.isArray(body?.actions) ? body.actions : [];
  if (!["single_play", "simple_cross_play", "core_daily"].includes(queueType)) {
    throw new BadRequestException("托管队列类型不合法");
  }
  if (actions.length < 1) {
    throw new BadRequestException("托管队列至少需要 1 个行动");
  }

  return { queue_type: queueType, actions };
}

function normalizeAppearanceRequest(
  body: ClaimAppearanceRequest | EquipAppearanceRequest,
): ClaimAppearanceRequest {
  const appearanceId = body?.appearance_id?.trim();
  if (!appearanceId) {
    throw new BadRequestException("请选择外观");
  }

  return { appearance_id: appearanceId };
}

function jadeCurrencyType(costType: GachaCostType): "jade_paid" | "jade_bound" {
  return costType === "paid_jade" ? "jade_paid" : "jade_bound";
}

function pickWeighted<T extends { weight: number }>(items: T[], seed: string): T {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let rolled = rollRange(seed, 1, totalWeight);
  for (const item of items) {
    rolled -= item.weight;
    if (rolled <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

function rollRange(seed: string, min: number, max: number): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 100000;
  }
  return min + (hash % (max - min + 1));
}

function currentDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nextDateStart(date = new Date()): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return next;
}
