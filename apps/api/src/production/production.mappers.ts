import type {
  AlchemyRecordState,
  BagItemState,
  EquipmentAffixState,
  EquipmentOperationRecordState,
  EquipmentState,
  RewardBundle,
} from "@nextday/shared";
import type {
  AlchemyRecord,
  EquipmentAffix,
  EquipmentInstance,
  EquipmentOperationRecord,
  PlayerItem,
} from "@prisma/client";
import { normalizeRewardBundle } from "../game/game.mappers";
import { getItemMeta, pillQualityConfigs } from "./production.constants";

export function toBagItemState(item: PlayerItem, now = new Date()): BagItemState {
  const meta = getItemMeta(item.itemId);
  const expired = Boolean(item.expireAt && item.expireAt.getTime() <= now.getTime());
  const quality = extractPillQuality(item);

  return {
    item_instance_id: item.itemInstanceId,
    item_id: item.itemId,
    name: meta.name,
    usage_hint: meta.usageHint,
    category: meta.category,
    count: item.count.toString(),
    quality,
    bind_type: item.bindType,
    locked: item.locked,
    tradeable: meta.tradeable && item.bindType === "unbound" && !expired,
    expired,
    expire_at: item.expireAt?.toISOString() ?? null,
    source_type: item.sourceType,
  };
}

function extractPillQuality(item: PlayerItem): BagItemState["quality"] {
  const meta = getItemMeta(item.itemId);
  if (meta.category !== "pill") {
    return null;
  }

  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : {};
  const quality = metadata.quality;
  return typeof quality === "string" &&
    pillQualityConfigs.some((config) => config.quality === quality)
    ? (quality as BagItemState["quality"])
    : null;
}

export function toAlchemyRecordState(record: AlchemyRecord): AlchemyRecordState {
  const extendedRecord = record as AlchemyRecord & {
    formulaId?: string | null;
    compositionHash?: string | null;
  };
  const context = getFormulaContext(record.resultSnapshot);

  return {
    record_id: record.recordId,
    formula_id:
      extendedRecord.formulaId ??
      (typeof context.formula_id === "string" ? context.formula_id : null),
    composition_hash:
      extendedRecord.compositionHash ??
      (typeof context.composition_hash === "string" ? context.composition_hash : record.recipeId),
    pill_item_id: record.pillItemId,
    quality: record.quality as AlchemyRecordState["quality"],
    success: record.success,
    count: record.count,
    materials: normalizeRewardBundle(record.materialSnapshot),
    failure_returns: record.failureReturnSnapshot
      ? normalizeRewardBundle(record.failureReturnSnapshot)
      : null,
    result: normalizeRewardBundle(record.resultSnapshot),
    config_version: record.configVersion,
    reward_config_version: record.rewardConfigVersion,
    created_at: record.createdAt.toISOString(),
  } as unknown as AlchemyRecordState;
}

function getFormulaContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const context = (value as Record<string, unknown>).formula_context;
  return context && typeof context === "object" && !Array.isArray(context)
    ? (context as Record<string, unknown>)
    : {};
}

export function toEquipmentState(
  equipment: EquipmentInstance & { affixes: EquipmentAffix[] },
): EquipmentState {
  return {
    equipment_instance_id: equipment.equipmentInstanceId,
    equipment_id: equipment.equipmentId,
    name: equipment.name,
    equipment_type: equipment.equipmentType,
    rarity: equipment.rarity,
    star_level: equipment.starLevel,
    bind_type: equipment.bindType,
    locked: equipment.locked,
    equipped_slot: equipment.equippedSlot,
    durability: equipment.durability,
    max_durability: equipment.maxDurability,
    source_type: equipment.sourceType,
    status: equipment.status,
    affixes: equipment.affixes
      .slice()
      .sort((left, right) => compareAffixType(left.affixType, right.affixType))
      .map(toEquipmentAffixState),
    created_at: equipment.createdAt.toISOString(),
  };
}

export function toEquipmentAffixState(affix: EquipmentAffix): EquipmentAffixState {
  return {
    affix_id: affix.affixId,
    affix_type: affix.affixType as EquipmentAffixState["affix_type"],
    affix_key: affix.affixKey,
    name: affix.name,
    value: affix.value,
    locked: affix.locked,
  };
}

export function toEquipmentOperationRecordState(
  record: EquipmentOperationRecord,
): EquipmentOperationRecordState {
  const result =
    record.resultSnapshot && typeof record.resultSnapshot === "object"
      ? (record.resultSnapshot as Record<string, unknown>)
      : {};

  return {
    record_id: record.recordId,
    equipment_instance_id: record.equipmentInstanceId,
    operation_type: record.operationType,
    materials: normalizeRewardBundle(record.materialSnapshot),
    result,
    config_version: record.configVersion,
    created_at: record.createdAt.toISOString(),
  };
}

export function rewardItemsToBundle(
  items: Array<{ item_id: string; count: number; bind_type?: string }>,
): RewardBundle {
  return {
    items: items.map((item) => {
      const meta = getItemMeta(item.item_id);
      return {
        item_id: item.item_id,
        name: meta.name,
        count: item.count,
        bind_type: item.bind_type ?? "bound",
      };
    }),
  };
}

function compareAffixType(left: string, right: string): number {
  const weight: Record<string, number> = { main: 1, sub: 2, hidden: 3 };
  return (weight[left] ?? 9) - (weight[right] ?? 9);
}
