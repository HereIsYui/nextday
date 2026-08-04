import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AlchemyRecordListResponse,
  BagSummaryResponse,
  BattleSummary,
  CultivationRoute,
  EquipmentInscribeRequest,
  EquipmentListResponse,
  EquipmentOperationRecordListResponse,
  EquipmentOperationResponse,
  EquipmentTargetRequest,
  LearnSkillRequest,
  LearnSkillResponse,
  PillQuality,
  PillUseRequest,
  RewardBundle,
  SaveSkillLoadoutRequest,
  SetEquipmentLockRequest,
  SetItemLockRequest,
  SetItemLockResponse,
  SkillLearningState,
  SkillLoadoutResponse,
  SkillPresetSuggestionState,
  SkillSummary,
} from "@nextday/shared";
import type {
  AlchemyRecord,
  EquipmentAffix,
  EquipmentInstance,
  EquipmentOperationRecord,
  Player,
  PlayerItem,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { normalizeRewardBundle, toBattleSummary } from "../game/game.mappers";
import { incrementPlayerTasks } from "../game/task-progress.utils";
import { writeJournalFromResponse } from "../journal/journal.utils";
import { buildAlchemyExperience, buildEquipmentExperience } from "../platform/experience";
import { hashRequestBody } from "../platform/utils/hash";
import { toPlayerProfileResponse } from "../player/player.mapper";
import {
  getAvailableSkills,
  getDefaultLearnedSkillIds,
  getDefaultSkillLoadout,
  getItemMeta,
  getMaterialCompositionHash,
  getProductionCraftMaterials,
  getQualityConfig,
  getSkillLearningConfig,
  hiddenAffixes,
  isProductionCraftMaterial,
  mainAffixes,
  materialCompositionSignature,
  normalizeProductionMaterials,
  pillQualityConfigs,
  productionConfigVersion,
  productionFormulaRuleVersion,
  productionRewardConfigVersion,
  resolveAlchemyCombination,
  resolveForgeCombination,
  skillConfigs,
  skillLearningConfigVersion,
  subAffixes,
} from "./production.constants";
import type {
  DiscoveredAlchemyCraftResponse,
  DiscoveredForgeCraftResponse,
  DiscoveredPillUseResponse,
  FormulaCraftResponse,
  FormulaResultTemplate,
  ProductionCraftRequest,
  ProductionFormulaKind,
  ProductionFormulaListQuery,
  ProductionFormulaListResponse,
  ProductionFormulaResponse,
  ProductionFormulaState,
  ProductionFormulaVisibility,
  ProductionMaterialInput,
  SaveProductionFormulaRequest,
} from "./production.formula-types";
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

/**
 * ProductionFormula 尚未生成到当前 Prisma Client 时使用的最小委托形状。
 * TODO(Prisma)：主模型生成后移除动态委托，直接使用 Prisma.ProductionFormula。
 */
type StoredProductionFormula = {
  formulaId: string;
  playerId: string;
  kind: string;
  name: string;
  compositionHash: string;
  materialSnapshot: Prisma.JsonValue;
  resultTemplateSnapshot: Prisma.JsonValue;
  visibility: string;
  sourceRecordId: string;
  ruleVersion: string;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ProductionFormulaDelegate = {
  create(input: { data: Record<string, unknown> }): Promise<StoredProductionFormula>;
  findFirst(input: { where: Record<string, unknown> }): Promise<StoredProductionFormula | null>;
  findMany(input: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
    take?: number;
  }): Promise<StoredProductionFormula[]>;
  update(input: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }): Promise<StoredProductionFormula>;
};

type FormulaDelegateHolder = {
  productionFormula?: ProductionFormulaDelegate;
};

type PlayerProductionEffectDelegate = {
  create(input: { data: Record<string, unknown> }): Promise<unknown>;
};

type PlayerProductionEffectDelegateHolder = {
  playerProductionEffect?: PlayerProductionEffectDelegate;
};

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
    body: ProductionCraftRequest;
    idempotencyKey: string;
    endpoint?: string;
  }): Promise<DiscoveredAlchemyCraftResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeProductionCraftRequest(input.body, "alchemy");
    const formula = body.formula_id
      ? await this.getFormulaForCraft(this.prisma, player.playerId, body.formula_id, "alchemy")
      : null;
    const materials = formula
      ? resolveFormulaMaterials(body.materials, formula, "alchemy")
      : body.materials;
    const template = formula ? formula.result_template : resolveAlchemyCombination(materials);
    const compositionHash = getMaterialCompositionHash("alchemy", materials);
    const cost = buildDiscoveryCost(materials, template?.spirit_stone_cost);
    const failureReturns = buildAlchemyFailureReturns(materials);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: input.endpoint ?? "POST /api/production/alchemy/craft",
      idempotencyKey: input.idempotencyKey,
      requestBody: { ...body, materials, composition_hash: compositionHash },
      handler: async (tx) => {
        await this.consumeProductionCost(tx, player.playerId, cost, {
          sourceType: "alchemy_craft",
          sourceId: compositionHash,
          idempotencyKey: input.idempotencyKey,
        });

        const success =
          Boolean(template?.alchemy) &&
          roll10000(`${input.idempotencyKey}:${compositionHash}:success`) <
            (template?.success_rate ?? 0);
        const quality = success
          ? pickPillQuality(`${input.idempotencyKey}:${compositionHash}:quality`)
          : null;
        const alchemy = template?.alchemy;
        const effectValue =
          success && alchemy
            ? rollRange(
                `${input.idempotencyKey}:${compositionHash}:effect`,
                alchemy.effect_min,
                alchemy.effect_max,
              )
            : 0;
        const rewards: RewardBundle = success
          ? {
              items: [
                {
                  item_id: alchemy?.pill_item_id ?? "pill_dust",
                  name: getItemMeta(alchemy?.pill_item_id ?? "pill_dust").name,
                  count: 1,
                  bind_type: "bound",
                },
              ],
            }
          : failureReturns;

        if (success && quality && alchemy) {
          await this.grantItem(tx, player.playerId, {
            itemId: alchemy.pill_item_id,
            count: 1,
            bindType: "bound",
            sourceType: "alchemy",
            metadata: {
              composition_hash: compositionHash,
              effect_value: effectValue,
              formula_id: formula?.formula_id ?? null,
              next_explore_bonus_percent: alchemy.next_explore_bonus_percent ?? null,
              pill_effect: alchemy.effect_kind,
              pill_rank: alchemy.pill_rank,
              pill_type: alchemy.pill_type,
              quality,
              rule_version: productionFormulaRuleVersion,
            } as Prisma.InputJsonValue,
          });
        } else {
          await this.grantRewardItems(tx, player.playerId, rewards, "alchemy_failure");
        }

        const record = await this.createAlchemyRecord(tx, {
          recordId: `alchemy_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          // 兼容旧表字段；它保存组合标识而不是固定 recipe_id。
          recipeId: `composition_${compositionHash}`,
          pillItemId: success ? (alchemy?.pill_item_id ?? null) : null,
          quality,
          success,
          count: success ? 1 : 0,
          materialSnapshot: withFormulaContext(cost, {
            composition_hash: compositionHash,
            formula_id: formula?.formula_id ?? null,
            rule_version: productionFormulaRuleVersion,
          }),
          failureReturnSnapshot: success
            ? undefined
            : (failureReturns as unknown as Prisma.InputJsonValue),
          resultSnapshot: withFormulaContext(rewards, {
            composition_hash: compositionHash,
            craft_success: success,
            formula_id: formula?.formula_id ?? null,
            result_template: template,
            rule_version: productionFormulaRuleVersion,
          }),
          configVersion: productionConfigVersion,
          rewardConfigVersion: productionRewardConfigVersion,
          idempotencyKey: input.idempotencyKey,
          // TODO(Prisma)：ProductionFormula 迁移后由主模型接收这些字段。
          formulaId: formula?.formula_id ?? null,
          compositionHash,
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "alchemy_craft",
          targetType: "alchemy_discovery",
          targetId: compositionHash,
          afterSnapshot: {
            ...toAlchemyRecordState(record),
            composition_hash: compositionHash,
            formula_id: formula?.formula_id ?? null,
            result_template: template,
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        const completedTaskIds = await incrementPlayerTasks(tx, player.playerId, {
          novice_craft_alchemy: 1,
        });

        return {
          record_id: record.recordId,
          record: toAlchemyRecordState(record),
          rewards,
          wallet: await this.getWalletState(tx, player.playerId),
          bag: await this.getBagByPlayerId(player.playerId, tx),
          completed_task_ids: completedTaskIds,
          experience: buildAlchemyExperience({
            recipeName: template?.name ?? "未名丹材组合",
            success,
            quality,
            rewards,
            failureReturns: success ? null : failureReturns,
            configVersion: productionConfigVersion,
          }),
          discovery: {
            composition_hash: compositionHash,
            formula_id: formula?.formula_id ?? null,
            result_template: template,
          },
        };
      },
    });
  }

  async usePill(input: {
    accountId: string;
    body: PillUseRequest;
    idempotencyKey: string;
  }): Promise<DiscoveredPillUseResponse> {
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

        const pillEffect = getPillEffectFromItem(item);
        if (!pillEffect) {
          throw new BadRequestException("该丹药不可服用");
        }

        const quality = getPillQualityFromItem(item);
        await this.decrementItem(tx, item, 1);
        const previousUseCount = await tx.pillUseRecord.count({
          where: {
            playerId: player.playerId,
            pillType: pillEffect.pill_type,
            pillRank: pillEffect.pill_rank,
          },
        });
        const sameTierUseCount = previousUseCount + 1;
        const effectiveRate = getPillEffectiveRate(previousUseCount);
        const effectValue = Math.floor(
          pillEffect.effect_value * getQualityConfig(quality).multiplier * (effectiveRate / 100),
        );
        const progress = await tx.playerProgress.findUniqueOrThrow({
          where: { playerId: player.playerId },
        });
        const cultivationGain = pillEffect.pill_effect === "cultivation" ? effectValue : 0;
        const afterCultivation = progress.cultivationValue + BigInt(cultivationGain);
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
            pillRank: pillEffect.pill_rank,
            pillType: pillEffect.pill_type,
            route: "all",
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
        if (
          pillEffect.pill_effect === "breakthrough_support" ||
          pillEffect.pill_effect === "explore_boost"
        ) {
          await this.createPlayerProductionEffect(tx, {
            playerId: player.playerId,
            effectType: pillEffect.pill_effect,
            effectValue:
              pillEffect.pill_effect === "explore_boost"
                ? (pillEffect.next_explore_bonus_percent ?? effectValue)
                : effectValue,
            sourceFormulaId: pillEffect.formula_id,
            sourceItemId: item.itemId,
            sourcePillUseRecordId: record.recordId,
          });
        }
        const effectNote = pillEffectNote(pillEffect.pill_effect, effectValue, pillEffect);
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
            pill_effect: pillEffect.pill_effect,
            next_explore_bonus_percent: pillEffect.next_explore_bonus_percent ?? null,
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
          pill_effect: pillEffect.pill_effect,
          next_explore_bonus_percent: pillEffect.next_explore_bonus_percent,
          effect_note: effectNote,
        };
      },
    });
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
    body: ProductionCraftRequest;
    idempotencyKey: string;
    endpoint?: string;
  }): Promise<DiscoveredForgeCraftResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeProductionCraftRequest(input.body, "forge");
    const formula = body.formula_id
      ? await this.getFormulaForCraft(this.prisma, player.playerId, body.formula_id, "forge")
      : null;
    const materials = formula
      ? resolveFormulaMaterials(body.materials, formula, "forge")
      : body.materials;
    const template = formula ? formula.result_template : resolveForgeCombination(materials);
    const compositionHash = getMaterialCompositionHash("forge", materials);
    const cost = buildDiscoveryCost(materials, template?.spirit_stone_cost);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: input.endpoint ?? "POST /api/production/forge/craft",
      idempotencyKey: input.idempotencyKey,
      requestBody: { ...body, materials, composition_hash: compositionHash },
      handler: async (tx) => {
        await this.consumeProductionCost(tx, player.playerId, cost, {
          sourceType: "forge_craft",
          sourceId: compositionHash,
          idempotencyKey: input.idempotencyKey,
        });
        const forge = template?.forge;
        const success =
          Boolean(forge) &&
          roll10000(`${input.idempotencyKey}:${compositionHash}:success`) <
            (template?.success_rate ?? 0);
        const failureRewards = buildForgeFailureReturns(materials);
        const equipment =
          success && forge
            ? await tx.equipmentInstance.create({
                data: {
                  equipmentInstanceId: `equipment_${randomUUID()}`,
                  playerId: player.playerId,
                  eraId: defaultEraId,
                  equipmentId: forge.equipment_id,
                  name: template?.name ?? "无名法宝",
                  equipmentType: forge.equipment_type,
                  rarity: forge.rarity,
                  bindType: "bound",
                  sourceType: "forge",
                  affixes: {
                    create: createForgeAffixRows(
                      `${input.idempotencyKey}:${compositionHash}`,
                      forge.affix_profile,
                      forge.rarity,
                    ),
                  },
                },
                include: { affixes: true },
              })
            : null;
        const equipmentState = equipment ? toEquipmentState(equipment) : null;
        if (!success) {
          await this.grantRewardItems(tx, player.playerId, failureRewards, "forge_failure");
        }
        const operation = await this.writeEquipmentOperation(tx, {
          playerId: player.playerId,
          equipmentInstanceId: equipment?.equipmentInstanceId ?? null,
          operationType: "forge",
          materials: cost,
          result: {
            equipment: equipmentState,
            composition_hash: compositionHash,
            craft_success: success,
            formula_id: formula?.formula_id ?? null,
            result_template: template,
            rewards: success ? undefined : failureRewards,
            rule_version: productionFormulaRuleVersion,
          } as unknown,
          idempotencyKey: input.idempotencyKey,
          formulaId: formula?.formula_id ?? null,
          compositionHash,
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "equipment_forge",
          targetType: success ? "equipment_instance" : "forge_discovery",
          targetId: equipment?.equipmentInstanceId ?? compositionHash,
          afterSnapshot: {
            equipment: equipmentState,
            composition_hash: compositionHash,
            craft_success: success,
            formula_id: formula?.formula_id ?? null,
            result_template: template,
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return {
          record_id: operation.recordId,
          operation_type: "forge",
          equipment: equipmentState,
          rewards: success ? undefined : failureRewards,
          wallet: await this.getWalletState(tx, player.playerId),
          bag: await this.getBagByPlayerId(player.playerId, tx),
          experience: buildEquipmentExperience({
            operationType: "forge",
            equipment: equipmentState,
            materials: cost,
            rewards: success ? undefined : failureRewards,
          }),
          discovery: {
            composition_hash: compositionHash,
            formula_id: formula?.formula_id ?? null,
            result_template: template,
            success,
          },
        };
      },
    });
  }

  async getCraftableMaterials(accountId: string, kind?: ProductionFormulaKind) {
    await this.requirePlayer(accountId);
    return { materials: getProductionCraftMaterials(kind) };
  }

  async listProductionFormulas(
    accountId: string,
    query: ProductionFormulaListQuery = {},
  ): Promise<ProductionFormulaListResponse> {
    const player = await this.requirePlayer(accountId);
    const normalized = normalizeFormulaListQuery(query);
    const formulas = await this.listStoredFormulas(this.prisma, {
      playerId: player.playerId,
      scope: normalized.scope,
    });
    const filtered = formulas.filter((formula) => {
      if (normalized.kind && formula.kind !== normalized.kind) {
        return false;
      }
      return !normalized.keyword || formula.name.includes(normalized.keyword);
    });
    const ownerNames = await this.getFormulaOwnerNames(this.prisma, filtered);

    return {
      formulas: filtered.map((formula) =>
        toProductionFormulaState(formula, player.playerId, ownerNames.get(formula.playerId)),
      ),
    };
  }

  async saveProductionFormula(input: {
    accountId: string;
    body: SaveProductionFormulaRequest;
    idempotencyKey: string;
  }): Promise<ProductionFormulaResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeSaveProductionFormulaRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/formulas",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const source = await this.getSuccessfulFormulaSource(
          tx,
          player.playerId,
          body.kind,
          body.source_record_id,
        );
        const compositionHash = getMaterialCompositionHash(body.kind, source.materials);
        const existing = await this.findStoredFormulaByComposition(
          tx,
          player.playerId,
          body.kind,
          compositionHash,
        );
        if (existing) {
          return {
            formula: toProductionFormulaState(existing, player.playerId, player.name),
          };
        }
        const formula = await this.createStoredFormula(tx, {
          formulaId: `formula_${randomUUID()}`,
          playerId: player.playerId,
          kind: body.kind,
          name: body.name,
          compositionHash,
          materialSnapshot: source.materials as unknown as Prisma.JsonValue,
          resultTemplateSnapshot: source.template as unknown as Prisma.JsonValue,
          visibility: "private",
          sourceRecordId: body.source_record_id,
          ruleVersion: productionFormulaRuleVersion,
          publishedAt: null,
        });
        const state = toProductionFormulaState(formula, player.playerId, player.name);
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "production_formula_save",
          targetType: "production_formula",
          targetId: formula.formulaId,
          afterSnapshot: state as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        return { formula: state };
      },
    });
  }

  async publishProductionFormula(input: {
    accountId: string;
    formulaId: string;
    idempotencyKey: string;
  }): Promise<ProductionFormulaResponse> {
    return this.setProductionFormulaVisibility({ ...input, visibility: "public" });
  }

  async unpublishProductionFormula(input: {
    accountId: string;
    formulaId: string;
    idempotencyKey: string;
  }): Promise<ProductionFormulaResponse> {
    return this.setProductionFormulaVisibility({ ...input, visibility: "private" });
  }

  async craftProductionFormula(input: {
    accountId: string;
    formulaId: string;
    idempotencyKey: string;
  }): Promise<FormulaCraftResponse> {
    const player = await this.requirePlayer(input.accountId);
    const formula = await this.getFormulaForCraft(this.prisma, player.playerId, input.formulaId);
    const endpoint = `POST /api/production/formulas/${formula.formula_id}/craft`;
    const body: ProductionCraftRequest = { formula_id: formula.formula_id };
    const result =
      formula.kind === "alchemy"
        ? await this.craftAlchemy({
            accountId: input.accountId,
            body,
            endpoint,
            idempotencyKey: input.idempotencyKey,
          })
        : await this.craftForge({
            accountId: input.accountId,
            body,
            endpoint,
            idempotencyKey: input.idempotencyKey,
          });

    return { kind: formula.kind, formula, result };
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
          experience: buildEquipmentExperience({
            operationType: "inscribe",
            equipment: toEquipmentState(updated),
            materials,
          }),
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
          experience: buildEquipmentExperience({
            operationType: "lock",
            equipment: equipmentState,
          }),
        };
      },
    });
  }

  async getSkillLoadout(accountId: string): Promise<SkillLoadoutResponse> {
    const player = await this.requirePlayer(accountId);
    return this.getSkillLoadoutByPlayer(player);
  }

  async learnSkill(input: {
    accountId: string;
    body: LearnSkillRequest;
    idempotencyKey: string;
  }): Promise<LearnSkillResponse> {
    const player = await this.requirePlayer(input.accountId);
    const skillId = input.body?.skill_id?.trim();
    const skill = skillConfigs.find((item) => item.skill_id === skillId);
    const learningConfig = skill ? getSkillLearningConfig(skill.skill_id) : undefined;

    if (!skill || !learningConfig || !isRouteAvailable(skill.route, player.route)) {
      throw new BadRequestException("技能不存在或当前路线不可学习");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/production/skills/learn",
      idempotencyKey: input.idempotencyKey,
      requestBody: { skill_id: skill.skill_id },
      handler: async (tx) => {
        const learnedSkillIds = await this.getLearnedSkillIds(tx, player);
        if (learnedSkillIds.has(skill.skill_id)) {
          const loadout = await this.getSkillLoadoutByPlayer(player, tx);
          return {
            record_id: `skill_learn_existing_${skill.skill_id}`,
            skill:
              loadout.available_skills.find((item) => item.skill_id === skill.skill_id) ??
              skillToLearningState(skill, player, learnedSkillIds),
            loadout,
            wallet: await this.getWalletState(tx, player.playerId),
            bag: await this.getBagByPlayerId(player.playerId, tx),
          };
        }

        const unlockReasons = skillUnlockReasons(skill, player, learnedSkillIds);
        if (unlockReasons.length) {
          throw new BadRequestException(unlockReasons[0]);
        }

        await this.consumeProductionCost(tx, player.playerId, learningConfig.cost, {
          sourceType: "skill_learn",
          sourceId: skill.skill_id,
          idempotencyKey: input.idempotencyKey,
        });

        const record = await tx.playerSkillRecord.create({
          data: {
            recordId: `skill_learn_${randomUUID()}`,
            playerId: player.playerId,
            eraId: defaultEraId,
            skillId: skill.skill_id,
            sourceType: "skill_learning",
            costSnapshot: learningConfig.cost as unknown as Prisma.InputJsonValue,
            configVersion: skillLearningConfigVersion,
            idempotencyKey: input.idempotencyKey,
          },
        });
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action: "skill_learn",
          targetType: "skill",
          targetId: skill.skill_id,
          afterSnapshot: {
            record_id: record.recordId,
            skill_id: skill.skill_id,
            cost: learningConfig.cost,
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });

        const loadout = await this.getSkillLoadoutByPlayer(player, tx);
        return {
          record_id: record.recordId,
          skill:
            loadout.available_skills.find((item) => item.skill_id === skill.skill_id) ??
            skillToLearningState(skill, player, new Set([...learnedSkillIds, skill.skill_id])),
          loadout,
          wallet: await this.getWalletState(tx, player.playerId),
          bag: await this.getBagByPlayerId(player.playerId, tx),
        };
      },
    });
  }

  async saveSkillLoadout(input: {
    accountId: string;
    body: SaveSkillLoadoutRequest;
    idempotencyKey: string;
  }): Promise<SkillLoadoutResponse> {
    const player = await this.requirePlayer(input.accountId);
    const learnedSkillIds = await this.getLearnedSkillIds(this.prisma, player);
    const normalized = normalizeSkillLoadoutRequest(input.body, player.route, learnedSkillIds);

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
        const response = skillLoadoutToResponse(
          player,
          saved,
          learnedSkillIds,
          await this.getRecentBattleSummaries(player.playerId, tx),
        );
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

  private async setProductionFormulaVisibility(input: {
    accountId: string;
    formulaId: string;
    idempotencyKey: string;
    visibility: ProductionFormulaVisibility;
  }): Promise<ProductionFormulaResponse> {
    const player = await this.requirePlayer(input.accountId);
    const formulaId = normalizeFormulaId(input.formulaId);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: `POST /api/production/formulas/${formulaId}/${input.visibility === "public" ? "publish" : "unpublish"}`,
      idempotencyKey: input.idempotencyKey,
      requestBody: { formula_id: formulaId, visibility: input.visibility },
      handler: async (tx) => {
        const existing = await this.findStoredFormula(tx, formulaId);
        if (!existing || existing.playerId !== player.playerId) {
          throw new BadRequestException("单方不存在或无权修改");
        }
        const updated = await this.updateStoredFormula(tx, formulaId, {
          visibility: input.visibility,
          publishedAt: input.visibility === "public" ? new Date() : null,
        });
        const state = toProductionFormulaState(updated, player.playerId, player.name);
        await this.writeAudit(tx, {
          accountId: input.accountId,
          playerId: player.playerId,
          action:
            input.visibility === "public"
              ? "production_formula_publish"
              : "production_formula_unpublish",
          targetType: "production_formula",
          targetId: updated.formulaId,
          afterSnapshot: state as unknown as Prisma.InputJsonValue,
          idempotencyKey: input.idempotencyKey,
        });
        return { formula: state };
      },
    });
  }

  private async getFormulaForCraft(
    tx: DbClient,
    playerId: string,
    formulaId: string,
    expectedKind?: ProductionFormulaKind,
  ): Promise<ProductionFormulaState> {
    const normalizedFormulaId = normalizeFormulaId(formulaId);
    const formula = await this.findStoredFormula(tx, normalizedFormulaId);
    if (!formula) {
      throw new BadRequestException("单方不存在");
    }
    if (formula.playerId !== playerId && formula.visibility !== "public") {
      throw new BadRequestException("该单方尚未公开");
    }
    if (formula.kind !== "alchemy" && formula.kind !== "forge") {
      throw new BadRequestException("单方类型异常");
    }
    if (expectedKind && formula.kind !== expectedKind) {
      throw new BadRequestException("单方不能用于当前炉型");
    }

    const owners = await this.getFormulaOwnerNames(tx, [formula]);
    return toProductionFormulaState(formula, playerId, owners.get(formula.playerId));
  }

  private async getSuccessfulFormulaSource(
    tx: Tx,
    playerId: string,
    kind: ProductionFormulaKind,
    sourceRecordId: string,
  ): Promise<{ materials: ProductionMaterialInput[]; template: FormulaResultTemplate }> {
    if (kind === "alchemy") {
      const record = await tx.alchemyRecord.findFirst({
        where: { playerId, recordId: sourceRecordId, success: true },
      });
      if (!record) {
        throw new BadRequestException("只能从本人成功的炼丹记录保存单方");
      }
      return getFormulaSourceFromSnapshots(kind, record.materialSnapshot, record.resultSnapshot);
    }

    const record = await tx.equipmentOperationRecord.findFirst({
      where: { playerId, recordId: sourceRecordId, operationType: "forge" },
    });
    if (!record || !isSuccessfulForgeSnapshot(record.resultSnapshot)) {
      throw new BadRequestException("只能从本人成功的炼器记录保存单方");
    }
    return getFormulaSourceFromSnapshots(kind, record.materialSnapshot, record.resultSnapshot);
  }

  private async createStoredFormula(
    tx: Tx,
    input: Omit<StoredProductionFormula, "createdAt" | "updatedAt">,
  ): Promise<StoredProductionFormula> {
    const delegate = getProductionFormulaDelegate(tx);
    if (delegate) {
      return delegate.create({
        data: {
          formulaId: input.formulaId,
          playerId: input.playerId,
          kind: input.kind,
          name: input.name,
          compositionHash: input.compositionHash,
          materialSnapshot: input.materialSnapshot,
          resultTemplateSnapshot: input.resultTemplateSnapshot,
          visibility: input.visibility,
          sourceRecordId: input.sourceRecordId,
          ruleVersion: input.ruleVersion,
          publishedAt: input.publishedAt,
        },
      });
    }

    const now = new Date();
    const formula: StoredProductionFormula = { ...input, createdAt: now, updatedAt: now };
    await tx.equipmentOperationRecord.create({
      data: {
        recordId: formula.formulaId,
        playerId: formula.playerId,
        eraId: defaultEraId,
        equipmentInstanceId: null,
        operationType: "production_formula_archive",
        materialSnapshot: formula.materialSnapshot as Prisma.InputJsonValue,
        resultSnapshot: {
          production_formula: serializeStoredFormula(formula),
        } as Prisma.InputJsonValue,
        configVersion: productionConfigVersion,
      },
    });
    return formula;
  }

  private async listStoredFormulas(
    tx: DbClient,
    input: { playerId: string; scope: "mine" | "public" },
  ): Promise<StoredProductionFormula[]> {
    const delegate = getProductionFormulaDelegate(tx);
    if (delegate) {
      return delegate.findMany({
        where: input.scope === "mine" ? { playerId: input.playerId } : { visibility: "public" },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }

    const records = await tx.equipmentOperationRecord.findMany({
      where: {
        operationType: "production_formula_archive",
        ...(input.scope === "mine" ? { playerId: input.playerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return records
      .map((record) => storedFormulaFromFallbackRecord(record))
      .filter((formula): formula is StoredProductionFormula => Boolean(formula))
      .filter((formula) => input.scope === "mine" || formula.visibility === "public");
  }

  private async findStoredFormula(
    tx: DbClient,
    formulaId: string,
  ): Promise<StoredProductionFormula | null> {
    const delegate = getProductionFormulaDelegate(tx);
    if (delegate) {
      return delegate.findFirst({ where: { formulaId } });
    }

    const record = await tx.equipmentOperationRecord.findFirst({
      where: { recordId: formulaId, operationType: "production_formula_archive" },
    });
    return record ? storedFormulaFromFallbackRecord(record) : null;
  }

  private async findStoredFormulaByComposition(
    tx: Tx,
    playerId: string,
    kind: ProductionFormulaKind,
    compositionHash: string,
  ): Promise<StoredProductionFormula | null> {
    const delegate = getProductionFormulaDelegate(tx);
    if (delegate) {
      return delegate.findFirst({ where: { playerId, kind, compositionHash } });
    }
    const formulas = await this.listStoredFormulas(tx, { playerId, scope: "mine" });
    return (
      formulas.find(
        (formula) => formula.kind === kind && formula.compositionHash === compositionHash,
      ) ?? null
    );
  }

  private async updateStoredFormula(
    tx: Tx,
    formulaId: string,
    data: Pick<StoredProductionFormula, "visibility" | "publishedAt">,
  ): Promise<StoredProductionFormula> {
    const delegate = getProductionFormulaDelegate(tx);
    if (delegate) {
      return delegate.update({ where: { formulaId }, data });
    }

    const existing = await this.findStoredFormula(tx, formulaId);
    if (!existing) {
      throw new BadRequestException("单方不存在");
    }
    const updated: StoredProductionFormula = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    await tx.equipmentOperationRecord.update({
      where: { recordId: formulaId },
      data: {
        resultSnapshot: {
          production_formula: serializeStoredFormula(updated),
        } as Prisma.InputJsonValue,
      },
    });
    return updated;
  }

  private async getFormulaOwnerNames(
    tx: DbClient,
    formulas: StoredProductionFormula[],
  ): Promise<Map<string, string>> {
    const playerIds = Array.from(new Set(formulas.map((formula) => formula.playerId)));
    if (!playerIds.length) {
      return new Map();
    }
    const players = await tx.player.findMany({
      where: { playerId: { in: playerIds } },
      select: { playerId: true, name: true },
    });
    return new Map(players.map((owner) => [owner.playerId, owner.name]));
  }

  private async createAlchemyRecord(tx: Tx, data: Record<string, unknown>): Promise<AlchemyRecord> {
    const create = tx.alchemyRecord.create as unknown as (input: {
      data: Record<string, unknown>;
    }) => Promise<AlchemyRecord>;
    if (getProductionFormulaDelegate(tx)) {
      return create({ data });
    }
    const { formulaId: _formulaId, compositionHash: _compositionHash, ...legacyData } = data;
    return create({ data: legacyData });
  }

  private async createEquipmentOperationRecord(
    tx: Tx,
    data: Record<string, unknown>,
  ): Promise<EquipmentOperationRecord> {
    const create = tx.equipmentOperationRecord.create as unknown as (input: {
      data: Record<string, unknown>;
    }) => Promise<EquipmentOperationRecord>;
    if (getProductionFormulaDelegate(tx)) {
      return create({ data });
    }
    const { formulaId: _formulaId, compositionHash: _compositionHash, ...legacyData } = data;
    return create({ data: legacyData });
  }

  private async createPlayerProductionEffect(
    tx: Tx,
    input: {
      playerId: string;
      effectType: "breakthrough_support" | "explore_boost";
      effectValue: number;
      sourceItemId: string;
      sourceFormulaId: string | null;
      sourcePillUseRecordId: string;
    },
  ) {
    const effectId = `production_effect_${randomUUID()}`;
    const delegate = getPlayerProductionEffectDelegate(tx);
    if (delegate) {
      await delegate.create({
        data: {
          effectId,
          playerId: input.playerId,
          effectType: input.effectType,
          effectValue: input.effectValue,
          remainingUses: 1,
          sourceItemId: input.sourceItemId,
          sourceFormulaId: input.sourceFormulaId,
        },
      });
      return;
    }

    // TODO(Prisma)：未生成 PlayerProductionEffect 前，以生产操作记录保留可追溯降级数据。
    await tx.equipmentOperationRecord.create({
      data: {
        recordId: effectId,
        playerId: input.playerId,
        eraId: defaultEraId,
        equipmentInstanceId: null,
        operationType: "player_production_effect",
        materialSnapshot: {},
        resultSnapshot: {
          effect_type: input.effectType,
          effect_value: input.effectValue,
          remaining_uses: 1,
          source_formula_id: input.sourceFormulaId,
          source_item_id: input.sourceItemId,
          source_pill_use_record_id: input.sourcePillUseRecordId,
        } as Prisma.InputJsonValue,
        configVersion: productionConfigVersion,
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
          experience: buildEquipmentExperience({
            operationType,
            equipment: equipmentState,
            materials: result.materials,
            rewards: result.rewards,
          }),
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

  private async getRecentBattleSummaries(
    playerId: string,
    tx: DbClient = this.prisma,
  ): Promise<BattleSummary[]> {
    const battles = await tx.battleLog.findMany({
      where: { playerId, battleType: "explore" },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    return battles.map((battle) => toBattleSummary(battle));
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

  private async getSkillLoadoutByPlayer(
    player: Player,
    tx: DbClient = this.prisma,
  ): Promise<SkillLoadoutResponse> {
    const [loadout, learnedSkillIds, recentBattles] = await Promise.all([
      tx.playerSkillLoadout.findUnique({
        where: { playerId: player.playerId },
      }),
      this.getLearnedSkillIds(tx, player),
      this.getRecentBattleSummaries(player.playerId, tx),
    ]);

    return loadout
      ? skillLoadoutToResponse(player, loadout, learnedSkillIds, recentBattles)
      : defaultSkillLoadoutToResponse(player, learnedSkillIds, recentBattles);
  }

  private async getLearnedSkillIds(tx: DbClient, player: Player): Promise<Set<string>> {
    const learned = await tx.playerSkillRecord.findMany({
      where: { playerId: player.playerId },
      select: { skillId: true },
    });

    return new Set([
      ...getDefaultLearnedSkillIds(player.route as CultivationRoute),
      ...learned.map((record) => record.skillId),
    ]);
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
      equipmentInstanceId: string | null;
      operationType: string;
      materials: RewardBundle;
      result: unknown;
      idempotencyKey: string;
      formulaId?: string | null;
      compositionHash?: string | null;
    },
  ) {
    return this.createEquipmentOperationRecord(tx, {
      recordId: `equipment_op_${randomUUID()}`,
      playerId: input.playerId,
      eraId: defaultEraId,
      equipmentInstanceId: input.equipmentInstanceId,
      operationType: input.operationType,
      materialSnapshot: input.materials as unknown as Prisma.InputJsonValue,
      resultSnapshot: input.result as unknown as Prisma.InputJsonValue,
      configVersion: productionConfigVersion,
      idempotencyKey: input.idempotencyKey,
      formulaId: input.formulaId ?? null,
      compositionHash: input.compositionHash ?? null,
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

function normalizeSetItemLockRequest(body: SetItemLockRequest): SetItemLockRequest {
  if (!body?.item_instance_id) {
    throw new BadRequestException("缺少物品实例");
  }

  return { item_instance_id: body.item_instance_id, locked: Boolean(body.locked) };
}

function normalizeProductionCraftRequest(
  body: ProductionCraftRequest,
  kind: ProductionFormulaKind,
): { materials: ProductionMaterialInput[]; formula_id?: string } {
  const formulaId = typeof body?.formula_id === "string" ? body.formula_id.trim() : "";
  const rawMaterials = body?.materials;
  if (rawMaterials !== undefined && !Array.isArray(rawMaterials)) {
    throw new BadRequestException("材料必须为数组");
  }
  if (!formulaId && !rawMaterials?.length) {
    throw new BadRequestException("请至少投入一种可投炉材料，或指定已保存的单方");
  }
  if ((rawMaterials?.length ?? 0) > 8) {
    throw new BadRequestException("一次最多投入 8 种材料");
  }

  const materials = (rawMaterials ?? []).map((material) => {
    const itemId = typeof material?.item_id === "string" ? material.item_id.trim() : "";
    const count = Number(material?.count);
    if (!itemId || !Number.isSafeInteger(count) || count <= 0 || count > 99) {
      throw new BadRequestException("材料名称或数量不合法");
    }
    if (!isProductionCraftMaterial(itemId, kind)) {
      throw new BadRequestException(
        `${getItemMeta(itemId).name}不可投入${kind === "alchemy" ? "丹炉" : "器炉"}`,
      );
    }
    return { item_id: itemId, count };
  });

  return {
    materials: normalizeProductionMaterials(materials),
    ...(formulaId ? { formula_id: normalizeFormulaId(formulaId) } : {}),
  };
}

function normalizeSaveProductionFormulaRequest(
  body: SaveProductionFormulaRequest,
): SaveProductionFormulaRequest {
  const kind = body?.kind;
  if (kind !== "alchemy" && kind !== "forge") {
    throw new BadRequestException("单方类型必须为炼丹或炼器");
  }
  const sourceRecordId = body?.source_record_id?.trim();
  if (!sourceRecordId || sourceRecordId.length > 120) {
    throw new BadRequestException("来源记录不合法");
  }
  const name = body?.name?.trim();
  if (!name || name.length > 24) {
    throw new BadRequestException("单方名称需为 1-24 个字符");
  }
  return { kind, source_record_id: sourceRecordId, name };
}

function normalizeFormulaListQuery(query: ProductionFormulaListQuery): {
  kind?: ProductionFormulaKind;
  scope: "mine" | "public";
  keyword: string;
} {
  const kind = query.kind;
  if (kind !== undefined && kind !== "alchemy" && kind !== "forge") {
    throw new BadRequestException("单方类型不合法");
  }
  const scope = query.scope ?? "mine";
  if (scope !== "mine" && scope !== "public") {
    throw new BadRequestException("单方查询范围不合法");
  }
  const keyword = query.keyword?.trim() ?? "";
  if (keyword.length > 24) {
    throw new BadRequestException("搜索关键词不能超过 24 个字符");
  }
  return { kind, scope, keyword };
}

function normalizeFormulaId(value: string): string {
  const formulaId = value.trim();
  if (!formulaId || formulaId.length > 120) {
    throw new BadRequestException("单方标识不合法");
  }
  return formulaId;
}

function resolveFormulaMaterials(
  submitted: ProductionMaterialInput[],
  formula: ProductionFormulaState,
  kind: ProductionFormulaKind,
): ProductionMaterialInput[] {
  if (formula.kind !== kind) {
    throw new BadRequestException("单方不能用于当前炉型");
  }
  if (
    submitted.length > 0 &&
    materialCompositionSignature(submitted) !== materialCompositionSignature(formula.materials)
  ) {
    throw new BadRequestException("引用单方时提交的材料必须与单方完全一致");
  }
  return formula.materials;
}

function buildDiscoveryCost(
  materials: ProductionMaterialInput[],
  configuredCost?: string,
): RewardBundle {
  const total = materials.reduce((sum, material) => sum + material.count, 0);
  const configured = configuredCost ? Number(configuredCost) : Number.NaN;
  const spiritStone =
    Number.isSafeInteger(configured) && configured > 0 ? configured : Math.max(20, total * 20);
  return {
    spirit_stone: String(spiritStone),
    items: materials.map((material) => ({
      item_id: material.item_id,
      name: getItemMeta(material.item_id).name,
      count: material.count,
      bind_type: "bound",
    })),
  };
}

function buildAlchemyFailureReturns(materials: ProductionMaterialInput[]): RewardBundle {
  const total = materials.reduce((sum, material) => sum + material.count, 0);
  return {
    items: [
      {
        item_id: "pill_dust",
        name: getItemMeta("pill_dust").name,
        count: Math.max(1, Math.floor(total / 2)),
        bind_type: "bound",
      },
    ],
  };
}

function buildForgeFailureReturns(materials: ProductionMaterialInput[]): RewardBundle {
  const total = materials.reduce((sum, material) => sum + material.count, 0);
  return {
    items:
      total >= 4
        ? [
            {
              item_id: "artifact_soul",
              name: getItemMeta("artifact_soul").name,
              count: 1,
              bind_type: "bound",
            },
          ]
        : [],
  };
}

function withFormulaContext(
  rewards: RewardBundle,
  context: Record<string, unknown>,
): Prisma.InputJsonValue {
  return {
    ...rewards,
    formula_context: context,
  } as unknown as Prisma.InputJsonValue;
}

function getFormulaSourceFromSnapshots(
  kind: ProductionFormulaKind,
  materialSnapshot: Prisma.JsonValue,
  resultSnapshot: Prisma.JsonValue,
): { materials: ProductionMaterialInput[]; template: FormulaResultTemplate } {
  const materials = extractFormulaMaterials(materialSnapshot, kind);
  const result = asRecord(resultSnapshot);
  const context = asRecord(result.formula_context);
  const template = parseFormulaResultTemplate(context.result_template, kind);
  if (!materials.length || !template) {
    throw new BadRequestException("该生产记录不包含可保存的自研单方");
  }
  return { materials, template };
}

function extractFormulaMaterials(
  snapshot: Prisma.JsonValue,
  kind: ProductionFormulaKind,
): ProductionMaterialInput[] {
  const source = Array.isArray(snapshot) ? snapshot : asRecord(snapshot).items;
  if (!Array.isArray(source)) {
    return [];
  }
  const materials: ProductionMaterialInput[] = [];
  for (const item of source) {
    const record = asRecord(item);
    const itemId = typeof record.item_id === "string" ? record.item_id : "";
    const count = Number(record.count);
    if (!itemId || !Number.isSafeInteger(count) || count <= 0) {
      return [];
    }
    if (!isProductionCraftMaterial(itemId, kind)) {
      return [];
    }
    materials.push({ item_id: itemId, count });
  }
  return normalizeProductionMaterials(materials);
}

function parseFormulaResultTemplate(
  value: unknown,
  expectedKind?: ProductionFormulaKind,
): FormulaResultTemplate | null {
  const record = asRecord(value);
  const kind = record.kind;
  const name = record.name;
  const successRate = Number(record.success_rate);
  const spiritStoneCost = record.spirit_stone_cost;
  if (
    (kind !== "alchemy" && kind !== "forge") ||
    (expectedKind && kind !== expectedKind) ||
    typeof name !== "string" ||
    !name ||
    !Number.isSafeInteger(successRate) ||
    successRate < 0 ||
    successRate > 10000 ||
    typeof spiritStoneCost !== "string"
  ) {
    return null;
  }
  if (kind === "alchemy") {
    const alchemy = asRecord(record.alchemy);
    const effectKind = alchemy.effect_kind;
    const effectMin = Number(alchemy.effect_min);
    const effectMax = Number(alchemy.effect_max);
    if (
      typeof alchemy.pill_item_id !== "string" ||
      typeof alchemy.pill_type !== "string" ||
      !Number.isSafeInteger(Number(alchemy.pill_rank)) ||
      (effectKind !== "cultivation" &&
        effectKind !== "breakthrough_support" &&
        effectKind !== "explore_boost") ||
      !Number.isSafeInteger(effectMin) ||
      !Number.isSafeInteger(effectMax) ||
      effectMin <= 0 ||
      effectMax < effectMin
    ) {
      return null;
    }
    const nextExploreBonus = Number(alchemy.next_explore_bonus_percent);
    return {
      kind,
      name,
      success_rate: successRate,
      spirit_stone_cost: spiritStoneCost,
      alchemy: {
        pill_item_id: alchemy.pill_item_id,
        pill_rank: Number(alchemy.pill_rank),
        pill_type: alchemy.pill_type,
        effect_kind: effectKind,
        effect_min: effectMin,
        effect_max: effectMax,
        ...(Number.isSafeInteger(nextExploreBonus) && nextExploreBonus > 0
          ? { next_explore_bonus_percent: nextExploreBonus }
          : {}),
      },
    };
  }

  const forge = asRecord(record.forge);
  const affixProfile = forge.affix_profile;
  if (
    typeof forge.equipment_id !== "string" ||
    typeof forge.equipment_type !== "string" ||
    typeof forge.rarity !== "string" ||
    (affixProfile !== "weapon" && affixProfile !== "armor" && affixProfile !== "talisman")
  ) {
    return null;
  }
  return {
    kind,
    name,
    success_rate: successRate,
    spirit_stone_cost: spiritStoneCost,
    forge: {
      equipment_id: forge.equipment_id,
      equipment_type: forge.equipment_type,
      rarity: forge.rarity,
      affix_profile: affixProfile,
    },
  };
}

function isSuccessfulForgeSnapshot(snapshot: Prisma.JsonValue): boolean {
  return asRecord(snapshot).craft_success === true;
}

function toProductionFormulaState(
  formula: StoredProductionFormula,
  viewerPlayerId: string,
  creatorName?: string,
): ProductionFormulaState {
  const kind = formula.kind === "alchemy" || formula.kind === "forge" ? formula.kind : null;
  const visibility =
    formula.visibility === "public" || formula.visibility === "private" ? formula.visibility : null;
  if (!kind || !visibility) {
    throw new BadRequestException("单方数据异常");
  }
  const materials = extractFormulaMaterials(formula.materialSnapshot, kind);
  const resultTemplate = parseFormulaResultTemplate(formula.resultTemplateSnapshot, kind);
  if (!materials.length || !resultTemplate) {
    throw new BadRequestException("单方数据异常");
  }
  return {
    formula_id: formula.formulaId,
    player_id: formula.playerId,
    ...(creatorName ? { creator_name: creatorName } : {}),
    kind,
    name: formula.name,
    composition_hash: formula.compositionHash,
    materials,
    result_template: resultTemplate,
    visibility,
    source_record_id: formula.sourceRecordId,
    rule_version: formula.ruleVersion,
    published_at: formula.publishedAt?.toISOString() ?? null,
    created_at: formula.createdAt.toISOString(),
    updated_at: formula.updatedAt.toISOString(),
    reusable: formula.playerId === viewerPlayerId || visibility === "public",
  };
}

function serializeStoredFormula(formula: StoredProductionFormula): Record<string, unknown> {
  return {
    formula_id: formula.formulaId,
    player_id: formula.playerId,
    kind: formula.kind,
    name: formula.name,
    composition_hash: formula.compositionHash,
    result_template_snapshot: formula.resultTemplateSnapshot,
    visibility: formula.visibility,
    source_record_id: formula.sourceRecordId,
    rule_version: formula.ruleVersion,
    published_at: formula.publishedAt?.toISOString() ?? null,
    created_at: formula.createdAt.toISOString(),
    updated_at: formula.updatedAt.toISOString(),
  };
}

function storedFormulaFromFallbackRecord(record: {
  recordId: string;
  playerId: string;
  materialSnapshot: Prisma.JsonValue;
  resultSnapshot: Prisma.JsonValue;
  createdAt: Date;
}): StoredProductionFormula | null {
  const stored = asRecord(asRecord(record.resultSnapshot).production_formula);
  const formulaId = typeof stored.formula_id === "string" ? stored.formula_id : record.recordId;
  const playerId = typeof stored.player_id === "string" ? stored.player_id : record.playerId;
  const kind = typeof stored.kind === "string" ? stored.kind : "";
  const name = typeof stored.name === "string" ? stored.name : "";
  const compositionHash =
    typeof stored.composition_hash === "string" ? stored.composition_hash : "";
  const visibility = typeof stored.visibility === "string" ? stored.visibility : "";
  const sourceRecordId = typeof stored.source_record_id === "string" ? stored.source_record_id : "";
  const ruleVersion = typeof stored.rule_version === "string" ? stored.rule_version : "";
  const resultTemplateSnapshot = stored.result_template_snapshot;
  if (
    !formulaId ||
    !playerId ||
    !kind ||
    !name ||
    !compositionHash ||
    !visibility ||
    !sourceRecordId ||
    !ruleVersion ||
    !resultTemplateSnapshot
  ) {
    return null;
  }
  return {
    formulaId,
    playerId,
    kind,
    name,
    compositionHash,
    materialSnapshot: record.materialSnapshot,
    resultTemplateSnapshot: resultTemplateSnapshot as Prisma.JsonValue,
    visibility,
    sourceRecordId,
    ruleVersion,
    publishedAt: parseOptionalDate(stored.published_at),
    createdAt: parseOptionalDate(stored.created_at) ?? record.createdAt,
    updatedAt: parseOptionalDate(stored.updated_at) ?? record.createdAt,
  };
}

function getProductionFormulaDelegate(tx: DbClient): ProductionFormulaDelegate | undefined {
  return (tx as unknown as FormulaDelegateHolder).productionFormula;
}

function getPlayerProductionEffectDelegate(tx: Tx): PlayerProductionEffectDelegate | undefined {
  return (tx as unknown as PlayerProductionEffectDelegateHolder).playerProductionEffect;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseOptionalDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
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
  learnedSkillIds: Set<string>,
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
    if (
      !skill ||
      skill.skill_type !== "active" ||
      !availableSkillIds.has(skillId) ||
      !learnedSkillIds.has(skillId)
    ) {
      throw new BadRequestException("主动技能未掌握或不属于当前路线");
    }
  }

  const treasureSkill = skillConfigs.find((item) => item.skill_id === treasureSkillId);
  if (
    !treasureSkill ||
    treasureSkill.skill_type !== "treasure" ||
    !availableSkillIds.has(treasureSkillId) ||
    !learnedSkillIds.has(treasureSkillId)
  ) {
    throw new BadRequestException("本命法宝技能未掌握或不合法");
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

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
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

type PillRuntimeEffect = {
  pill_effect: "cultivation" | "breakthrough_support" | "explore_boost";
  pill_type: string;
  pill_rank: number;
  effect_value: number;
  next_explore_bonus_percent?: number;
  formula_id: string | null;
};

/** 历史背包丹药仅用于兼容存量，不再对应任何可选默认药方。 */
const legacyPillEffects: Record<string, Omit<PillRuntimeEffect, "formula_id">> = {
  pill_juling_1: {
    pill_effect: "cultivation",
    pill_type: "cultivation",
    pill_rank: 1,
    effect_value: 100,
  },
  pill_feixue_1: {
    pill_effect: "cultivation",
    pill_type: "cultivation",
    pill_rank: 1,
    effect_value: 100,
  },
  pill_pojing_1: {
    pill_effect: "breakthrough_support",
    pill_type: "breakthrough",
    pill_rank: 1,
    effect_value: 500,
  },
};

function getPillEffectFromItem(item: PlayerItem): PillRuntimeEffect | null {
  const metadata = asRecord(item.metadata);
  const pillEffect = metadata.pill_effect;
  const effectValue = Number(metadata.effect_value);
  const pillRank = Number(metadata.pill_rank);
  const pillType = metadata.pill_type;
  if (
    (pillEffect === "cultivation" ||
      pillEffect === "breakthrough_support" ||
      pillEffect === "explore_boost") &&
    Number.isSafeInteger(effectValue) &&
    effectValue > 0 &&
    Number.isSafeInteger(pillRank) &&
    pillRank > 0 &&
    typeof pillType === "string" &&
    pillType
  ) {
    const nextExploreBonus = Number(metadata.next_explore_bonus_percent);
    return {
      pill_effect: pillEffect,
      pill_type: pillType,
      pill_rank: pillRank,
      effect_value: effectValue,
      ...(Number.isSafeInteger(nextExploreBonus) && nextExploreBonus > 0
        ? { next_explore_bonus_percent: nextExploreBonus }
        : {}),
      formula_id: typeof metadata.formula_id === "string" ? metadata.formula_id : null,
    };
  }

  const legacy = legacyPillEffects[item.itemId];
  return legacy ? { ...legacy, formula_id: null } : null;
}

function pillEffectNote(
  effectKind: PillRuntimeEffect["pill_effect"],
  effectValue: number,
  effect: PillRuntimeEffect,
): string {
  if (effectKind === "cultivation") {
    return `药力化为 ${effectValue} 点修为。`;
  }
  if (effectKind === "breakthrough_support") {
    return `获得 ${effectValue} 点破境辅助药力，将在下一次突破时结算。`;
  }
  return `获得下一次探索 +${effect.next_explore_bonus_percent ?? effectValue}% 的行云增益。`;
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

function createForgeAffixRows(
  seed: string,
  profile: "weapon" | "armor" | "talisman",
  rarity: string,
): Prisma.EquipmentAffixCreateWithoutEquipmentInput[] {
  const mainPool =
    profile === "weapon"
      ? mainAffixes.filter((affix) => affix.affixKey === "attack")
      : profile === "armor"
        ? mainAffixes.filter((affix) => affix.affixKey === "life" || affix.affixKey === "defense")
        : mainAffixes.filter((affix) => affix.affixKey === "attack" || affix.affixKey === "life");
  const subPool =
    profile === "weapon"
      ? subAffixes.filter((affix) => affix.affixKey === "crit" || affix.affixKey === "speed")
      : profile === "armor"
        ? subAffixes.filter(
            (affix) => affix.affixKey === "anti_crit" || affix.affixKey === "forge_bonus",
          )
        : subAffixes.filter(
            (affix) =>
              affix.affixKey === "speed" ||
              affix.affixKey === "alchemy_bonus" ||
              affix.affixKey === "forge_bonus",
          );
  const main = pickAffix(mainPool, `${seed}:main`);
  const firstSub = pickAffix(subPool, `${seed}:sub:1`);
  const secondSub = pickAffix(
    subPool.filter((affix) => affix.affixKey !== firstSub.affixKey),
    `${seed}:sub:2`,
  );
  const multiplier = forgeRarityMultiplier(rarity);
  const rows: Prisma.EquipmentAffixCreateWithoutEquipmentInput[] = [
    affixCreateInput(scaleAffix(main, multiplier), "main", `${seed}:main:value`),
    affixCreateInput(scaleAffix(firstSub, multiplier), "sub", `${seed}:sub:1:value`),
    affixCreateInput(scaleAffix(secondSub, multiplier), "sub", `${seed}:sub:2:value`),
  ];
  const hiddenThreshold =
    rarity === "heaven" ? 4200 : rarity === "immortal" ? 6000 : rarity === "earth" ? 2500 : 1200;
  if (roll10000(`${seed}:hidden`) < hiddenThreshold) {
    const hiddenPool =
      profile === "armor"
        ? hiddenAffixes.filter((affix) => affix.affixKey === "hidden_body")
        : profile === "weapon"
          ? hiddenAffixes.filter((affix) => affix.affixKey === "hidden_spirit")
          : hiddenAffixes;
    rows.push(
      affixCreateInput(
        scaleAffix(pickAffix(hiddenPool, `${seed}:hidden:key`), multiplier),
        "hidden",
        `${seed}:hidden:value`,
      ),
    );
  }
  return rows;
}

function forgeRarityMultiplier(rarity: string): number {
  const multipliers: Record<string, number> = {
    ordinary: 1,
    earth: 1.2,
    heaven: 1.5,
    immortal: 1.8,
    ancient_craft: 1.1,
  };
  return multipliers[rarity] ?? 1;
}

function scaleAffix(
  affix: { affixKey: string; name: string; minValue: number; maxValue: number },
  multiplier: number,
) {
  return {
    ...affix,
    minValue: Math.max(1, Math.floor(affix.minValue * multiplier)),
    maxValue: Math.max(1, Math.floor(affix.maxValue * multiplier)),
  };
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
  player: Player,
  loadout: {
    activeSkillIds: Prisma.JsonValue;
    treasureSkillId: string;
    autoPriority: Prisma.JsonValue;
  },
  learnedSkillIds: Set<string>,
  recentBattles: BattleSummary[],
): SkillLoadoutResponse {
  return buildSkillLoadoutResponse({
    activeSkillIds: normalizeStringArray(loadout.activeSkillIds),
    autoPriority: normalizeStringArray(loadout.autoPriority),
    learnedSkillIds,
    player,
    recentBattles,
    treasureSkillId: loadout.treasureSkillId,
  });
}

function defaultSkillLoadoutToResponse(
  player: Player,
  learnedSkillIds: Set<string>,
  recentBattles: BattleSummary[],
): SkillLoadoutResponse {
  const fallback = getDefaultSkillLoadout(player.route as CultivationRoute);
  return buildSkillLoadoutResponse({
    activeSkillIds: fallback.active_skill_ids,
    autoPriority: fallback.auto_priority,
    learnedSkillIds,
    player,
    recentBattles,
    treasureSkillId: fallback.treasure_skill_id,
  });
}

function buildSkillLoadoutResponse(input: {
  player: Player;
  activeSkillIds: string[];
  treasureSkillId: string;
  autoPriority: string[];
  learnedSkillIds: Set<string>;
  recentBattles: BattleSummary[];
}): SkillLoadoutResponse {
  const availableSkills = getAvailableSkills(input.player.route as CultivationRoute).map((skill) =>
    skillToLearningState(skill, input.player, input.learnedSkillIds),
  );
  const availableSkillMap = new Map(availableSkills.map((skill) => [skill.skill_id, skill]));
  const activeSkillIds = input.activeSkillIds.filter((skillId) => {
    const skill = availableSkillMap.get(skillId);
    return skill?.skill_type === "active" && skill.learned;
  });
  const fallbackActiveIds = availableSkills
    .filter((skill) => skill.skill_type === "active" && skill.learned)
    .sort((a, b) => a.priority_hint - b.priority_hint)
    .slice(0, 3)
    .map((skill) => skill.skill_id);
  const treasureSkill = availableSkillMap.get(input.treasureSkillId);
  const treasureSkillId =
    treasureSkill?.skill_type === "treasure" && treasureSkill.learned
      ? treasureSkill.skill_id
      : (availableSkills.find((skill) => skill.skill_type === "treasure" && skill.learned)
          ?.skill_id ?? "skill_benming_faguang");
  const nextActiveSkillIds = activeSkillIds.length ? activeSkillIds : fallbackActiveIds;
  const autoPriority = normalizeSkillPriorityForResponse(
    input.autoPriority,
    nextActiveSkillIds,
    treasureSkillId,
  );

  return {
    active_skill_ids: nextActiveSkillIds,
    auto_priority: autoPriority,
    available_skills: availableSkills,
    preset_suggestions: buildSkillPresetSuggestions(availableSkills, input.recentBattles),
    treasure_skill_id: treasureSkillId,
  };
}

function normalizeStringArray(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeSkillPriorityForResponse(
  currentPriorityIds: string[],
  activeSkillIds: string[],
  treasureSkillId: string,
): string[] {
  const allowedSkillIds = new Set([treasureSkillId, ...activeSkillIds].filter(Boolean));
  const nextPriorityIds = Array.from(new Set(currentPriorityIds)).filter((skillId) =>
    allowedSkillIds.has(skillId),
  );

  if (treasureSkillId && !nextPriorityIds.includes(treasureSkillId)) {
    nextPriorityIds.unshift(treasureSkillId);
  }
  for (const skillId of activeSkillIds) {
    if (!nextPriorityIds.includes(skillId)) {
      nextPriorityIds.push(skillId);
    }
  }
  return nextPriorityIds;
}

function skillToLearningState(
  skill: SkillSummary,
  player: Player,
  learnedSkillIds: Set<string>,
): SkillLearningState {
  const learningConfig = getSkillLearningConfig(skill.skill_id);
  const learned = learnedSkillIds.has(skill.skill_id);
  const unlockReasons = learned ? [] : skillUnlockReasons(skill, player, learnedSkillIds);

  return {
    ...skill,
    counter_traits: learningConfig?.counterTraits ?? [],
    learn_cost: learned ? undefined : learningConfig?.cost,
    learnable: !learned && unlockReasons.length === 0,
    learned,
    preset_hint: learningConfig?.presetHint,
    unlock_reasons: unlockReasons,
  };
}

function skillUnlockReasons(
  skill: { skill_id: string; route: CultivationRoute | "all" },
  player: Player,
  learnedSkillIds: Set<string>,
): string[] {
  if (learnedSkillIds.has(skill.skill_id)) {
    return [];
  }
  if (!isRouteAvailable(skill.route, player.route)) {
    return ["当前路线不可学习"];
  }
  const learningConfig = getSkillLearningConfig(skill.skill_id);
  if (!learningConfig) {
    return ["该技能暂未开放学习"];
  }
  const reasons: string[] = [];
  if (player.currentRealm < learningConfig.minRealmId) {
    reasons.push(`需要达到第 ${learningConfig.minRealmId} 境`);
  }
  if (player.currentLevel < learningConfig.minLevel) {
    reasons.push(`需要达到 ${learningConfig.minLevel} 级`);
  }
  return reasons;
}

function buildSkillPresetSuggestions(
  skills: SkillLearningState[],
  recentBattles: BattleSummary[],
): SkillPresetSuggestionState[] {
  const learnedActiveSkills = skills.filter(
    (skill) => skill.skill_type === "active" && skill.learned,
  );
  const treasureSkillId =
    skills.find((skill) => skill.skill_type === "treasure" && skill.learned)?.skill_id ??
    "skill_benming_faguang";
  const traits = uniqueStrings(recentBattles.flatMap((battle) => battle.enemy_traits ?? []));
  const suggestions: SkillPresetSuggestionState[] = [];

  for (const trait of traits.slice(0, 3)) {
    const matchedLearned = learnedActiveSkills.filter((skill) =>
      skill.counter_traits?.includes(trait),
    );
    const matchedLearnable = skills.find(
      (skill) =>
        skill.skill_type === "active" &&
        !skill.learned &&
        skill.learnable &&
        skill.counter_traits?.includes(trait),
    );
    const activeSkillIds = [
      ...matchedLearned.map((skill) => skill.skill_id),
      ...learnedActiveSkills.map((skill) => skill.skill_id),
    ].slice(0, 3);
    if (!activeSkillIds.length) {
      continue;
    }
    suggestions.push({
      active_skill_ids: activeSkillIds,
      auto_priority: normalizeSkillPriorityForResponse(
        activeSkillIds,
        activeSkillIds,
        treasureSkillId,
      ),
      enemy_traits: [trait],
      reason: matchedLearned.length
        ? `最近战报出现${trait}，可把${matchedLearned[0].name}提前。`
        : matchedLearnable
          ? `最近战报出现${trait}，学习${matchedLearnable.name}后可补进预设。`
          : `最近战报出现${trait}，可调整现有技能顺序观察表现。`,
      suggestion_id: `trait_${trait}`,
      title: `${trait}应对预设`,
      treasure_skill_id: treasureSkillId,
    });
  }

  if (!suggestions.length && learnedActiveSkills.length) {
    const activeSkillIds = learnedActiveSkills
      .sort((a, b) => b.priority_hint - a.priority_hint)
      .slice(0, 3)
      .map((skill) => skill.skill_id);
    suggestions.push({
      active_skill_ids: activeSkillIds,
      auto_priority: normalizeSkillPriorityForResponse(
        activeSkillIds,
        activeSkillIds,
        treasureSkillId,
      ),
      enemy_traits: [],
      reason: "暂无明显克制需求，保持基础输出、防护和本命技能顺序即可。",
      suggestion_id: "default_auto",
      title: "稳妥自动预设",
      treasure_skill_id: treasureSkillId,
    });
  }

  return suggestions.slice(0, 3);
}
