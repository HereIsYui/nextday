import type {
  CollectionBlessingSummary,
  CollectionDisplaySlotState,
  EraCollectionItemState,
} from "@nextday/shared";
import type { EraCollectionRecord } from "@prisma/client";
import {
  type EraCollectionConfig,
  collectionBlessingCapPercent,
  collectionDisplaySlots,
} from "./collection.constants";

export function toEraCollectionItem(
  config: EraCollectionConfig,
  record: EraCollectionRecord | null,
): EraCollectionItemState {
  return {
    collection_record_id: record?.collectionRecordId ?? null,
    collection_id: config.collectionId,
    name: config.name,
    collection_type: config.collectionType,
    rarity: config.rarity,
    source_type: record?.sourceType ?? config.sourceType,
    source_id: record?.sourceId ?? config.sourceId,
    source_hint: config.sourceHint,
    era_id: record?.eraId ?? config.eraId,
    owned: Boolean(record),
    inherited: record?.inherited ?? false,
    duplicate_count: record?.duplicateCount ?? 0,
    display_level: record?.displayLevel ?? 0,
    display_slot: record?.displaySlot ?? null,
    display_positions: config.displayPositions,
    inherit_rule: record?.inheritRule ?? config.inheritRule,
    duplicate_convert: config.duplicateConvert,
    blessing_percent: record?.blessingPercent ?? config.blessingPercent,
    effective_blessing_percent: Math.min(
      record?.blessingPercent ?? config.blessingPercent,
      collectionBlessingCapPercent,
    ),
    stat_bonus: null,
    unlock_hint: config.unlockHint,
    public_summary: config.publicSummary,
    updated_at: record?.updatedAt.toISOString() ?? null,
  };
}

export function toCollectionDisplaySlots(
  collections: EraCollectionItemState[],
): CollectionDisplaySlotState[] {
  return collectionDisplaySlots.map((slot) => {
    const equipped = collections.find((collection) => collection.display_slot === slot.slotId);

    return {
      slot_id: slot.slotId,
      name: slot.name,
      allowed_types: slot.allowedTypes,
      equipped_collection_id: equipped?.collection_id ?? null,
      equipped_name: equipped?.name ?? null,
    };
  });
}

export function buildCollectionBlessingSummary(
  collections: EraCollectionItemState[],
): CollectionBlessingSummary {
  const equippedCollections = collections.filter((collection) => collection.display_slot);
  const rawPercent = equippedCollections.reduce(
    (sum, collection) => sum + collection.blessing_percent,
    0,
  );

  return {
    cap_percent: collectionBlessingCapPercent,
    effective_percent: Math.min(rawPercent, collectionBlessingCapPercent),
    stacking_rule: "多纪元收藏只继承展示，纪元祝福有效值最多 1%，不叠加滚雪球。",
  };
}
