import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AlchemyCraftRequest,
  AlchemyCraftResponse,
  AlchemyRecipeListResponse,
  AlchemyRecordListResponse,
  BagSummaryResponse,
  CultivationRoute,
  EquipmentInscribeRequest,
  EquipmentListResponse,
  EquipmentOperationRecordListResponse,
  EquipmentOperationResponse,
  EquipmentTargetRequest,
  ForgeCraftRequest,
  ForgeRecipeListResponse,
  PillQuality,
  PillUseRequest,
  PillUseResponse,
  RewardBundle,
  SaveSkillLoadoutRequest,
  SetEquipmentLockRequest,
  SetItemLockRequest,
  SetItemLockResponse,
  SkillLoadoutResponse,
} from "@nextday/shared";
import type { EquipmentAffix, EquipmentInstance, Player, PlayerItem, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { normalizeRewardBundle } from "../game/game.mappers";
import { hashRequestBody } from "../platform/utils/hash";
import { toPlayerProfileResponse } from "../player/player.mapper";
import {
  alchemyRecipes,
  forgeRecipes,
  getAvailableSkills,
  getDefaultSkillLoadout,
  getItemMeta,
  getQualityConfig,
  hiddenAffixes,
  mainAffixes,
  pillQualityConfigs,
  productionConfigVersion,
  productionRewardConfigVersion,
  skillConfigs,
  subAffixes,
} from "./production.constants";
import {
  rewardItemsToBundle,
  toAlchemyRecordState,
  toBagItemState,
  toEquipmentOperationRecordState,
  toEquipmentState,
} from "./production.mappers";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type EquipmentWithAffixes = EquipmentInstance & { affixes: EquipmentAffix[] };

@Injectable()
export class ProductionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getBagItems(accountId: string): Promise<BagSummaryResponse> {
    const player = await this.requirePlayer(accountId);
    return this.getBagByPlayerId(player.playerId);
  }

  async setItemLock(input: {
    accountId: string;
    body: SetItemLockRequest;
    idempotencyKey: string;
  }): Promise<SetItemLockResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeSetItemLockRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/bag/items/lock",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const item = await tx.playerItem.findFirst({
          where: { playerId: player.playerId, itemInstanceId: body.item_instance_id },
        });

        if (!item) {
          throw new BadRequestException("背包物品不存在");
        }

        const updated = await tx.playerItem.update({
          where: { itemInstanceId: item.itemInstanceId },
          data: { locked: body.locked },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "bag_item_lock",
          targetType: "player_item",
          targetId: updated.itemInstanceId,
          afterSnapshot: toBagItemState(updated) as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: `bag_lock_${randomUUID()}`,
          item: toBagItemState(updated),
        };
      },
    });
  }

  async getAlchemyRecipes(accountId: string): Promise<AlchemyRecipeListResponse> {
    const player = await this.requirePlayer(accountId);
    return {
      recipes: alchemyRecipes.filter((recipe) => isRouteAvailable(recipe.route, player.route)),
    };
  }

  async getAlchemyRecords(accountId: string): Promise<AlchemyRecordListResponse> {
    const player = await this.requirePlayer(accountId);
    const records = await this.prisma.alchemyRecord.findMany({
      where: { playerId: player.playerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { records: records.map(toAlchemyRecordState) };
  }

  async craftAlchemy(input: {
    accountId: string;
    body: AlchemyCraftRequest;
    idempotencyKey: string;
  }): Promise<AlchemyCraftResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeRecipeRequest(input.body.recipe_id);
    const recipe = alchemyRecipes.find((item) => item.recipe_id === body.recipe_id);

    if (!recipe || !isRouteAvailable(recipe.route, player.route)) {
      throw new BadRequestException("丹方不存在或当前路线不可炼制");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/alchemy/craft",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.consumeProductionCost(tx, player.playerId, recipeCostBundle(recipe), {
          sourceType: "alchemy_craft",
          sourceId: recipe.recipe_id,
          idempotencyKey: input.idempotencyKey,
        });

        const success =
          roll10000(`${input.idempotencyKey}:${recipe.recipe_id}:success`) < recipe.success_rate;
        const quality = success
          ? pickPillQuality(`${input.idempotencyKey}:${recipe.recipe_id}:quality`)
          : null;
        const rewards: RewardBundle = success
          ? {
              items: [
                {
                  item_id: recipe.pill_item_id,
                  name: getItemMeta(recipe.pill_item_id).name,
                  count: 1,
                  bind_type: "bound",
                },
              ],
            }
          : recipe.failure_returns;

        if (success && quality) {
          await this.grantItem(tx, player.playerId, {
            itemId: recipe.pill_item_id,
            count: 1,
            bindType: "bound",
            sourceType: "alchemy",
            metadata: { quality, recipe_id: recipe.recipe_id },
          });
        } else {
          await this.grantRewardItems(tx, player.playerId, rewards, "alchemy_failure");
        }

        const record = await tx.alchemyRecord.create({
          data: {
            recordId: `alchemy_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            recipeId: recipe.recipe_id,
            pillItemId: success ? recipe.pill_item_id : null,
            quality,
            success,
            count: success ? 1 : 0,
            materialSnapshot: recipeCostBundle(recipe) as unknown as Prisma.InputJsonValue,
            failureReturnSnapshot: success
              ? undefined
              : (recipe.failure_returns as unknown as Prisma.InputJsonValue),
            resultSnapshot: rewards as unknown as Prisma.InputJsonValue,
            configVersion: productionConfigVersion,
            rewardConfigVersion: productionRewardConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "alchemy_craft",
          targetType: "alchemy_recipe",
          targetId: recipe.recipe_id,
          afterSnapshot: toAlchemyRecordState(record) as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: record.recordId,
          record: toAlchemyRecordState(record),
          rewards,
          wallet: await this.getWalletState(tx, player.playerId),
          bag: await this.getBagByPlayerId(player.playerId, tx),
        };
      },
    });
  }

  async usePill(input: {
    accountId: string;
    body: PillUseRequest;
    idempotencyKey: string;
  }): Promise<PillUseResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizePillUseRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/pills/use",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const item = await tx.playerItem.findFirst({
          where: {
            itemInstanceId: body.item_instance_id,
            playerId: player.playerId,
            count: { gt: 0 },
          },
        });

        if (!item || item.locked || isExpired(item)) {
          throw new BadRequestException("丹药不存在、已锁定或已过期");
        }

        const recipe = alchemyRecipes.find((candidate) => candidate.pill_item_id === item.itemId);
        if (!recipe || !isRouteAvailable(recipe.route, player.route)) {
          throw new BadRequestException("该丹药不可服用");
        }

        const quality = getPillQualityFromItem(item);
        await this.decrementItem(tx, item, 1);
        const previousUseCount = await tx.pillUseRecord.count({
          where: {
            playerId: player.playerId,
            pillType: recipe.pill_type,
            pillRank: recipe.pill_rank,
          },
        });
        const sameTierUseCount = previousUseCount + 1;
        const effectiveRate = getPillEffectiveRate(previousUseCount);
        const effectValue = Math.floor(
          recipe.base_effect * getQualityConfig(quality).multiplier * (effectiveRate / 100),
        );
        const progress = await tx.playerProgress.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        const afterCultivation = progress.cultivationValue + BigInt(effectValue);
        await tx.playerProgress.update({
          where: { playerId: player.playerId },
          data: {
            cultivationValue: afterCultivation,
            dailyActiveScore: { increment: 2 },
            weeklyActiveScore: { increment: 2 },
          },
        });
        const record = await tx.pillUseRecord.create({
          data: {
            recordId: `pill_use_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            pillItemId: item.itemId,
            pillRank: recipe.pill_rank,
            pillType: recipe.pill_type,
            route: recipe.route,
            quality,
            sameTierUseCount,
            effectiveRate,
            effectValue,
            beforeCultivation: progress.cultivationValue,
            afterCultivation,
            configVersion: productionConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "pill_use",
          targetType: "player_item",
          targetId: item.itemInstanceId,
          afterSnapshot: {
            record_id: record.recordId,
            pill_item_id: item.itemId,
            effective_rate: effectiveRate,
            effect_value: effectValue,
          } as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: record.recordId,
          pill_item_id: item.itemId,
          quality,
          same_tier_use_count: sameTierUseCount,
          effective_rate: effectiveRate,
          effect_value: effectValue,
          before_cultivation: progress.cultivationValue.toString(),
          after_cultivation: afterCultivation.toString(),
          profile: await this.getProfileByPlayerId(tx, player.playerId),
        };
      },
    });
  }

  async getForgeRecipes(accountId: string): Promise<ForgeRecipeListResponse> {
    const player = await this.requirePlayer(accountId);
    return {
      recipes: forgeRecipes.filter((recipe) => isRouteAvailable(recipe.route, player.route)),
    };
  }

  async listEquipment(accountId: string): Promise<EquipmentListResponse> {
    const player = await this.requirePlayer(accountId);
    return this.getEquipmentListByPlayerId(player.playerId);
  }

  async getEquipmentRecords(accountId: string): Promise<EquipmentOperationRecordListResponse> {
    const player = await this.requirePlayer(accountId);
    const records = await this.prisma.equipmentOperationRecord.findMany({
      where: { playerId: player.playerId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return { records: records.map(toEquipmentOperationRecordState) };
  }

  async craftForge(input: {
    accountId: string;
    body: ForgeCraftRequest;
    idempotencyKey: string;
  }): Promise<EquipmentOperationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeRecipeRequest(input.body.recipe_id);
    const recipe = forgeRecipes.find((item) => item.recipe_id === body.recipe_id);

    if (!recipe || !isRouteAvailable(recipe.route, player.route)) {
      throw new BadRequestException("炼器配方不存在或当前路线不可炼制");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/forge/craft",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.consumeProductionCost(tx, player.playerId, recipeCostBundle(recipe), {
          sourceType: "forge_craft",
          sourceId: recipe.recipe_id,
          idempotencyKey: input.idempotencyKey,
        });

        const equipment = await tx.equipmentInstance.create({
          data: {
            equipmentInstanceId: `equipment_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            equipmentId: recipe.equipment_id,
            name: recipe.name,
            equipmentType: recipe.equipment_type,
            rarity: recipe.rarity,
            bindType: "bound",
            sourceType: "forge",
            affixes: {
              create: createAffixRows(`${input.idempotencyKey}:${recipe.affix_seed}`),
            },
          },
          include: { affixes: true },
        });
        const equipmentState = toEquipmentState(equipment);
        const operation = await this.writeEquipmentOperation(tx, {
          playerId: player.playerId,
          equipmentInstanceId: equipment.equipmentInstanceId,
          operationType: "forge",
          materials: recipeCostBundle(recipe),
          result: { equipment: equipmentState } as unknown,
          idempotencyKey: input.idempotencyKey,
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "equipment_forge",
          targetType: "equipment_instance",
          targetId: equipment.equipmentInstanceId,
          afterSnapshot: equipmentState as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: operation.recordId,
          operation_type: "forge",
          equipment: equipmentState,
          wallet: await this.getWalletState(tx, player.playerId),
          bag: await this.getBagByPlayerId(player.playerId, tx),
        };
      },
    });
  }

  async refineEquipment(input: {
    accountId: string;
    body: EquipmentTargetRequest;
    idempotencyKey: string;
  }): Promise<EquipmentOperationResponse> {
    return this.withEquipmentOperation(input, "refine", async ({ tx, player, equipment }) => {
      const materials = rewardItemsToBundle([{ item_id: "raw_iron", count: 1 }]);
      materials.spirit_stone = "30";
      await this.consumeProductionCost(tx, player.playerId, materials, {
        sourceType: "equipment_refine",
        sourceId: equipment.equipmentInstanceId,
        idempotencyKey: input.idempotencyKey,
      });

      await tx.equipmentAffix.deleteMany({
        where: {
          equipmentInstanceId: equipment.equipmentInstanceId,
          affixType: { in: ["sub", "hidden"] },
          locked: false,
        },
      });
      await tx.equipmentAffix.createMany({
        data: createAffixRows(`${input.idempotencyKey}:refine`)
          .filter((affix) => affix.affixType !== "main")
          .map((affix) => ({ ...affix, equipmentInstanceId: equipment.equipmentInstanceId })),
      });
      const updated = await this.getEquipmentOrThrow(
        tx,
        player.playerId,
        equipment.equipmentInstanceId,
      );
      return { equipment: updated, materials, rewards: undefined };
    });
  }

  async inscribeEquipment(input: {
    accountId: string;
    body: EquipmentInscribeRequest;
    idempotencyKey: string;
  }): Promise<EquipmentOperationResponse> {
    const body = normalizeInscribeRequest(input.body);
    const player = await this.requirePlayer(input.accountId);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/equipment/inscribe",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const equipment = await this.getEquipmentOrThrow(
          tx,
          player.playerId,
          body.equipment_instance_id,
        );
        const targetAffix = equipment.affixes.find((affix) => affix.affixId === body.affix_id);
        if (!targetAffix) {
          throw new BadRequestException("词条不存在");
        }
        const lockedCount = equipment.affixes.filter((affix) => affix.locked).length;
        if (!targetAffix.locked && lockedCount >= 1) {
          throw new BadRequestException("M3 阶段每件法宝最多铭刻锁定 1 条词条");
        }

        const materials = rewardItemsToBundle([{ item_id: "raw_iron", count: 1 }]);
        await this.consumeProductionCost(tx, player.playerId, materials, {
          sourceType: "equipment_inscribe",
          sourceId: equipment.equipmentInstanceId,
          idempotencyKey: input.idempotencyKey,
        });
        await tx.equipmentAffix.update({
          where: { affixId: targetAffix.affixId },
          data: { locked: true },
        });
        const updated = await this.getEquipmentOrThrow(
          tx,
          player.playerId,
          equipment.equipmentInstanceId,
        );
        const operation = await this.writeEquipmentOperation(tx, {
          playerId: player.playerId,
          equipmentInstanceId: updated.equipmentInstanceId,
          operationType: "inscribe",
          materials,
          result: {
            equipment: toEquipmentState(updated),
            affix_id: targetAffix.affixId,
          } as unknown,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: operation.recordId,
          operation_type: "inscribe",
          equipment: toEquipmentState(updated),
          wallet: await this.getWalletState(tx, player.playerId),
          bag: await this.getBagByPlayerId(player.playerId, tx),
        };
      },
    });
  }

  async decomposeEquipment(input: {
    accountId: string;
    body: EquipmentTargetRequest;
    idempotencyKey: string;
  }): Promise<EquipmentOperationResponse> {
    return this.withEquipmentOperation(input, "decompose", async ({ tx, player, equipment }) => {
      if (equipment.locked) {
        throw new BadRequestException("法宝已锁定，不能分解");
      }

      const rewards = rewardItemsToBundle([
        { item_id: "artifact_soul", count: 1 },
        { item_id: "raw_iron", count: 1 },
      ]);
      await tx.equipmentInstance.update({
        where: { equipmentInstanceId: equipment.equipmentInstanceId },
        data: { status: "decomposed", equippedSlot: null },
      });
      await this.grantRewardItems(tx, player.playerId, rewards, "equipment_decompose");
      const updated = await this.getEquipmentById(
        tx,
        player.playerId,
        equipment.equipmentInstanceId,
      );
      return { equipment: updated, materials: {}, rewards };
    });
  }

  async setEquipmentLock(input: {
    accountId: string;
    body: SetEquipmentLockRequest;
    idempotencyKey: string;
  }): Promise<EquipmentOperationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeEquipmentLockRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/equipment/lock",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const equipment = await this.getEquipmentOrThrow(
          tx,
          player.playerId,
          body.equipment_instance_id,
        );
        const updated = await tx.equipmentInstance.update({
          where: { equipmentInstanceId: equipment.equipmentInstanceId },
          data: { locked: body.locked },
          include: { affixes: true },
        });
        const equipmentState = toEquipmentState(updated);
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "equipment_lock",
          targetType: "equipment_instance",
          targetId: equipment.equipmentInstanceId,
          afterSnapshot: equipmentState as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: `equipment_lock_${randomUUID()}`,
          operation_type: "lock",
          equipment: equipmentState,
        };
      },
    });
  }

  async getSkillLoadout(accountId: string): Promise<SkillLoadoutResponse> {
    const player = await this.requirePlayer(accountId);
    return this.getSkillLoadoutByPlayer(player);
  }

  async saveSkillLoadout(input: {
    accountId: string;
    body: SaveSkillLoadoutRequest;
    idempotencyKey: string;
  }): Promise<SkillLoadoutResponse> {
    const player = await this.requirePlayer(input.accountId);
    const normalized = normalizeSkillLoadoutRequest(input.body, player.route);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/skills/loadout",
      idempotencyKey: input.idempotencyKey,
      requestBody: normalized,
      handler: async (tx) => {
        const saved = await tx.playerSkillLoadout.upsert({
          where: { playerId: player.playerId },
          create: {
            playerId: player.playerId,
            activeSkillIds: normalized.active_skill_ids,
            treasureSkillId: normalized.treasure_skill_id,
            autoPriority: normalized.auto_priority ?? [
              normalized.treasure_skill_id,
              ...normalized.active_skill_ids,
            ],
          },
          update: {
            activeSkillIds: normalized.active_skill_ids,
            treasureSkillId: normalized.treasure_skill_id,
            autoPriority: normalized.auto_priority ?? [
              normalized.treasure_skill_id,
              ...normalized.active_skill_ids,
            ],
          },
        });
        const response = skillLoadoutToResponse(player.route, saved);
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "skill_loadout_save",
          targetType: "player_skill_loadout",
          targetId: player.playerId,
          afterSnapshot: response as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return response;
      },
    });
  }

  private async withEquipmentOperation(
    input: {
      accountId: string;
      body: EquipmentTargetRequest;
      idempotencyKey: string;
    },
    operationType: "refine" | "decompose",
    handler: (context: {
      tx: Tx;
      player: Player;
      equipment: EquipmentWithAffixes;
    }) => Promise<{
      equipment: EquipmentWithAffixes | null;
      materials: RewardBundle;
      rewards?: RewardBundle;
    }>,
  ): Promise<EquipmentOperationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeEquipmentTargetRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: `POST /api/production/equipment/${operationType}`,
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const equipment = await this.getEquipmentOrThrow(
          tx,
          player.playerId,
          body.equipment_instance_id,
        );
        const result = await handler({ tx, player, equipment });
        const equipmentState = result.equipment ? toEquipmentState(result.equipment) : null;
        const operation = await this.writeEquipmentOperation(tx, {
          playerId: player.playerId,
          equipmentInstanceId: equipment.equipmentInstanceId,
          operationType,
          materials: result.materials,
          result: {
            equipment: equipmentState,
            rewards: result.rewards,
          } as unknown,
          idempotencyKey: input.idempotencyKey,
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: `equipment_${operationType}`,
          targetType: "equipment_instance",
          targetId: equipment.equipmentInstanceId,
          afterSnapshot: operation.resultSnapshot as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: operation.recordId,
          operation_type: operationType,
          equipment: equipmentState,
          rewards: result.rewards,
          wallet: await this.getWalletState(tx, player.playerId),
          bag: await this.getBagByPlayerId(player.playerId, tx),
        };
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

  private async getProfileByPlayerId(tx: DbClient, playerId: string) {
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

  private async getWalletState(tx: DbClient, playerId: string) {
    const profile = await this.getProfileByPlayerId(tx, playerId);
    if (!profile.wallet) {
      throw new BadRequestException("玩家钱包数据不完整");
    }

    return profile.wallet;
  }

  private async getBagByPlayerId(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<BagSummaryResponse> {
    const items = await tx.playerItem.findMany({
      where: { playerId, count: { gt: 0 } },
      orderBy: [{ locked: "desc" }, { createdAt: "asc" }],
    });

    return { items: items.map((item) => toBagItemState(item)) };
  }

  private async getEquipmentListByPlayerId(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<EquipmentListResponse> {
    const equipments = await tx.equipmentInstance.findMany({
      where: { playerId, status: "active" },
      include: { affixes: true },
      orderBy: { createdAt: "desc" },
    });

    return { equipments: equipments.map(toEquipmentState) };
  }

  private async getEquipmentById(
    tx: DbClient,
    playerId: string,
    equipmentInstanceId: string,
  ): Promise<EquipmentWithAffixes | null> {
    return tx.equipmentInstance.findFirst({
      where: { playerId, equipmentInstanceId },
      include: { affixes: true },
    });
  }

  private async getEquipmentOrThrow(
    tx: DbClient,
    playerId: string,
    equipmentInstanceId: string,
  ): Promise<EquipmentWithAffixes> {
    const equipment = await this.getEquipmentById(tx, playerId, equipmentInstanceId);
    if (!equipment || equipment.status !== "active") {
      throw new BadRequestException("法宝不存在或已分解");
    }

    return equipment;
  }

  private async getSkillLoadoutByPlayer(player: Player): Promise<SkillLoadoutResponse> {
    const loadout = await this.prisma.playerSkillLoadout.findUnique({
      where: { playerId: player.playerId },
    });

    return loadout
      ? skillLoadoutToResponse(player.route, loadout)
      : getDefaultSkillLoadout(player.route as CultivationRoute);
  }

  private async consumeProductionCost(
    tx: Tx,
    playerId: string,
    cost: RewardBundle,
    source: { sourceType: string; sourceId: string; idempotencyKey: string },
  ) {
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
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          idempotencyKey: `${source.idempotencyKey}:spirit_stone`,
        },
      });
    }

    for (const item of cost.items ?? []) {
      await this.consumeItem(tx, playerId, item.item_id, item.count);
    }
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
      throw new BadRequestException(`${getItemMeta(itemId).name}不足`);
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

  private async decrementItem(tx: Tx, item: PlayerItem, count: number) {
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

  private async grantRewardItems(
    tx: Tx,
    playerId: string,
    rewards: RewardBundle,
    sourceType: string,
  ) {
    for (const item of rewards.items ?? []) {
      await this.grantItem(tx, playerId, {
        itemId: item.item_id,
        count: item.count,
        bindType: item.bind_type,
        sourceType,
      });
    }
  }

  private async grantItem(
    tx: Tx,
    playerId: string,
    input: {
      itemId: string;
      count: number;
      bindType: string;
      sourceType: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    await tx.playerItem.create({
      data: {
        itemInstanceId: `item_${randomUUID()}`,
        playerId,
        itemId: input.itemId,
        count: BigInt(input.count),
        bindType: input.bindType,
        sourceType: input.sourceType,
        metadata: input.metadata,
      },
    });
  }

  private async writeEquipmentOperation(
    tx: Tx,
    input: {
      playerId: string;
      equipmentInstanceId: string;
      operationType: string;
      materials: RewardBundle;
      result: unknown;
      idempotencyKey: string;
    },
  ) {
    return tx.equipmentOperationRecord.create({
      data: {
        recordId: `equipment_op_${randomUUID()}`,
        playerId: input.playerId,
        eraId: defaultEraId,
        equipmentInstanceId: input.equipmentInstanceId,
        operationType: input.operationType,
        materialSnapshot: input.materials as unknown as Prisma.InputJsonValue,
        resultSnapshot: input.result as unknown as Prisma.InputJsonValue,
        configVersion: productionConfigVersion,
        idempotencyKey: input.idempotencyKey,
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
        configVersion: productionConfigVersion,
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

function normalizeSetItemLockRequest(body: SetItemLockRequest): SetItemLockRequest {
  if (!body?.item_instance_id) {
    throw new BadRequestException("缺少物品实例");
  }

  return { item_instance_id: body.item_instance_id, locked: Boolean(body.locked) };
}

function normalizeRecipeRequest(recipeId: string): { recipe_id: string } {
  const normalized = recipeId?.trim();
  if (!normalized) {
    throw new BadRequestException("缺少配方");
  }

  return { recipe_id: normalized };
}

function normalizePillUseRequest(body: PillUseRequest): PillUseRequest {
  if (!body?.item_instance_id) {
    throw new BadRequestException("缺少丹药实例");
  }

  return { item_instance_id: body.item_instance_id };
}

function normalizeEquipmentTargetRequest(body: EquipmentTargetRequest): EquipmentTargetRequest {
  if (!body?.equipment_instance_id) {
    throw new BadRequestException("缺少法宝实例");
  }

  return { equipment_instance_id: body.equipment_instance_id };
}

function normalizeInscribeRequest(body: EquipmentInscribeRequest): EquipmentInscribeRequest {
  const target = normalizeEquipmentTargetRequest(body);
  if (!body?.affix_id) {
    throw new BadRequestException("缺少词条");
  }

  return { ...target, affix_id: body.affix_id };
}

function normalizeEquipmentLockRequest(body: SetEquipmentLockRequest): SetEquipmentLockRequest {
  const target = normalizeEquipmentTargetRequest(body);
  return { ...target, locked: Boolean(body.locked) };
}

function normalizeSkillLoadoutRequest(
  body: SaveSkillLoadoutRequest,
  route: string,
): SaveSkillLoadoutRequest {
  const availableSkillIds = new Set(
    getAvailableSkills(route as CultivationRoute).map((skill) => skill.skill_id),
  );
  const activeSkillIds = Array.from(new Set(body?.active_skill_ids ?? []));
  const treasureSkillId = body?.treasure_skill_id;

  if (activeSkillIds.length < 1 || activeSkillIds.length > 3) {
    throw new BadRequestException("主动技能需配置 1-3 个");
  }

  for (const skillId of activeSkillIds) {
    const skill = skillConfigs.find((item) => item.skill_id === skillId);
    if (!skill || skill.skill_type !== "active" || !availableSkillIds.has(skillId)) {
      throw new BadRequestException("主动技能不属于当前路线");
    }
  }

  const treasureSkill = skillConfigs.find((item) => item.skill_id === treasureSkillId);
  if (
    !treasureSkill ||
    treasureSkill.skill_type !== "treasure" ||
    !availableSkillIds.has(treasureSkillId)
  ) {
    throw new BadRequestException("本命法宝技能不合法");
  }

  const autoPriority = Array.from(
    new Set(body.auto_priority?.length ? body.auto_priority : [treasureSkillId, ...activeSkillIds]),
  ).filter((skillId) => skillId === treasureSkillId || activeSkillIds.includes(skillId));

  return {
    active_skill_ids: activeSkillIds,
    treasure_skill_id: treasureSkillId,
    auto_priority: autoPriority.length ? autoPriority : [treasureSkillId, ...activeSkillIds],
  };
}

function isRouteAvailable(targetRoute: CultivationRoute | "all", playerRoute: string): boolean {
  return targetRoute === "all" || targetRoute === playerRoute;
}

function recipeCostBundle(recipe: {
  materials: Array<{ item_id: string; count: number }>;
  spirit_stone_cost: string;
}): RewardBundle {
  return {
    spirit_stone: recipe.spirit_stone_cost,
    items: recipe.materials.map((item) => ({
      item_id: item.item_id,
      name: getItemMeta(item.item_id).name,
      count: item.count,
      bind_type: "bound",
    })),
  };
}

function pickPillQuality(seed: string): PillQuality {
  const roll = roll10000(seed);
  let cursor = 0;

  for (const config of pillQualityConfigs) {
    cursor += config.weight;
    if (roll < cursor) {
      return config.quality;
    }
  }

  return "middle";
}

function getPillQualityFromItem(item: PlayerItem): PillQuality {
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  const quality = metadata.quality;
  return typeof quality === "string" && pillQualityConfigs.some((item) => item.quality === quality)
    ? (quality as PillQuality)
    : "middle";
}

function getPillEffectiveRate(previousUseCount: number): number {
  if (previousUseCount < 3) {
    return 100;
  }

  if (previousUseCount < 10) {
    return 50;
  }

  return 10;
}

function isExpired(item: PlayerItem): boolean {
  return Boolean(item.expireAt && item.expireAt.getTime() <= Date.now());
}

function createAffixRows(seed: string): Prisma.EquipmentAffixCreateWithoutEquipmentInput[] {
  const main = pickAffix(mainAffixes, `${seed}:main`);
  const firstSub = pickAffix(subAffixes, `${seed}:sub:1`);
  const secondSub = pickAffix(
    subAffixes.filter((affix) => affix.affixKey !== firstSub.affixKey),
    `${seed}:sub:2`,
  );
  const rows: Prisma.EquipmentAffixCreateWithoutEquipmentInput[] = [
    affixCreateInput(main, "main", `${seed}:main:value`),
    affixCreateInput(firstSub, "sub", `${seed}:sub:1:value`),
    affixCreateInput(secondSub, "sub", `${seed}:sub:2:value`),
  ];

  if (roll10000(`${seed}:hidden`) < 1200) {
    rows.push(
      affixCreateInput(
        pickAffix(hiddenAffixes, `${seed}:hidden:key`),
        "hidden",
        `${seed}:hidden:value`,
      ),
    );
  }

  return rows;
}

function affixCreateInput(
  affix: { affixKey: string; name: string; minValue: number; maxValue: number },
  affixType: "main" | "sub" | "hidden",
  valueSeed: string,
): Prisma.EquipmentAffixCreateWithoutEquipmentInput {
  return {
    affixId: `affix_${randomUUID()}`,
    affixType,
    affixKey: affix.affixKey,
    name: affix.name,
    value: rollRange(valueSeed, affix.minValue, affix.maxValue),
  };
}

function pickAffix<TAffix>(pool: TAffix[], seed: string): TAffix {
  return pool[roll10000(seed) % pool.length];
}

function rollRange(seed: string, min: number, max: number): number {
  return min + (roll10000(seed) % (max - min + 1));
}

function roll10000(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return hash;
}

function skillLoadoutToResponse(
  route: string,
  loadout: {
    activeSkillIds: Prisma.JsonValue;
    treasureSkillId: string;
    autoPriority: Prisma.JsonValue;
  },
): SkillLoadoutResponse {
  const activeSkillIds = normalizeStringArray(loadout.activeSkillIds);
  const autoPriority = normalizeStringArray(loadout.autoPriority);

  return {
    active_skill_ids: activeSkillIds,
    treasure_skill_id: loadout.treasureSkillId,
    auto_priority: autoPriority.length
      ? autoPriority
      : [loadout.treasureSkillId, ...activeSkillIds],
    available_skills: getAvailableSkills(route as CultivationRoute),
  };
}

function normalizeStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
