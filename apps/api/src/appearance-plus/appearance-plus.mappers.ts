import type {
  AppearancePlusDisplaySlotState,
  AppearancePlusPermission,
  AppearancePlusPreview,
  AppearancePlusState,
} from "@nextday/shared";
import type { AppearanceOwnershipRecord } from "@prisma/client";
import {
  type AppearancePlusConfig,
  appearancePlusConfigVersion,
  appearancePlusSlots,
} from "./appearance-plus.constants";

export function toAppearancePlusState(
  config: AppearancePlusConfig,
  record: AppearanceOwnershipRecord | null,
  permission: AppearancePlusPermission,
): AppearancePlusState {
  return {
    ownership_record_id: record?.ownershipRecordId ?? null,
    appearance_id: config.appearanceId,
    name: config.name,
    appearance_type: config.appearanceType,
    display_slot: config.displaySlot,
    source_type: record?.sourceType ?? config.sourceType,
    source_hint: config.sourceHint,
    owner_type: record?.ownerType ?? config.ownerScope,
    owner_id: record?.ownerId ?? null,
    owned: Boolean(record),
    equipped: record?.equipped ?? false,
    inherited: record?.inherited ?? config.inherited,
    limited: record?.limited ?? config.limited,
    expires_at: record?.expiresAt?.toISOString() ?? null,
    preview: toPreview(config),
    permission,
    stat_bonus: null,
    config_version: record?.configVersion ?? appearancePlusConfigVersion,
  };
}

export function toAppearancePlusDisplaySlots(
  states: AppearancePlusState[],
): AppearancePlusDisplaySlotState[] {
  return appearancePlusSlots.map((slot) => {
    const equipped = states.find(
      (appearance) => appearance.display_slot === slot.slotId && appearance.equipped,
    );

    return {
      slot_id: slot.slotId,
      name: slot.name,
      allowed_types: slot.allowedTypes,
      equipped_appearance_id: equipped?.appearance_id ?? null,
      equipped_name: equipped?.name ?? null,
    };
  });
}

export function toPreview(config: AppearancePlusConfig): AppearancePlusPreview {
  return {
    title: config.preview.title,
    subtitle: config.preview.subtitle,
    sample_text: config.preview.sampleText,
    display_positions: config.preview.displayPositions,
    color_token: config.preview.colorToken,
  };
}
