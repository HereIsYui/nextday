import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  AppearancePlusCatalogResponse,
  AppearancePlusPermission,
  AppearancePlusState,
  EquipAppearancePlusRequest,
  EquipAppearancePlusResponse,
} from "@nextday/shared";
import type { AppearanceOwnershipRecord, Player, Prisma, SectMember } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { hashRequestBody } from "../platform/utils/hash";
import {
  type AppearancePlusConfig,
  appearancePlusConfigVersion,
  appearancePlusConfigs,
  appearancePlusRewardBoundaryVersion,
  appearancePlusRulesetVersion,
} from "./appearance-plus.constants";
import { toAppearancePlusDisplaySlots, toAppearancePlusState } from "./appearance-plus.mappers";

type PlayerWithMembership = Player & { sectMembership: SectMember | null };
type Tx = Prisma.TransactionClient;

@Injectable()
export class AppearancePlusService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getCatalog(accountId: string): Promise<AppearancePlusCatalogResponse> {
    const player = await this.requirePlayer(accountId);
    const records = await this.ensureOwnershipRecords(player);
    const states = this.buildStates(player, records);
    const sectRecords = records.filter((record) => record.ownerType === "sect");
    const equippedSectDecoration = sectRecords.find(
      (record) => record.displaySlot === "sect_hall" && record.equipped,
    );
    const sect = player.sectId
      ? await this.prisma.sect.findUnique({ where: { sectId: player.sectId } })
      : null;

    return {
      appearances: states,
      display_slots: toAppearancePlusDisplaySlots(states),
      sect_decoration: {
        sect_id: sect?.sectId ?? null,
        sect_name: sect?.name ?? null,
        equipped_appearance_id: equippedSectDecoration?.appearanceId ?? null,
        equipped_name: equippedSectDecoration
          ? requireAppearanceConfig(equippedSectDecoration.appearanceId).name
          : null,
      },
      boundary: {
        stat_bonus_allowed: false,
        reward_mutation_allowed: false,
        contribution_multiplier_allowed: false,
        drop_rate_allowed: false,
      },
      config_version: appearancePlusConfigVersion,
      ruleset_version: appearancePlusRulesetVersion,
    };
  }

  async equip(input: {
    accountId: string;
    body: EquipAppearancePlusRequest;
    idempotencyKey: string;
  }): Promise<EquipAppearancePlusResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeEquipRequest(input.body);
    const config = requireAppearanceConfig(body.appearance_id);
    if (body.display_slot && body.display_slot !== config.displaySlot) {
      throw new BadRequestException("外观不能装备到该展示位置");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/appearance-plus/equip",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const records = await this.ensureOwnershipRecords(player, tx);
        const targetOwner = ownerForConfig(player, config);
        const record = records.find(
          (item) =>
            item.ownerType === targetOwner.ownerType &&
            item.ownerId === targetOwner.ownerId &&
            item.appearanceId === config.appearanceId,
        );
        const permission = buildPermission(config, player, record ?? null);
        if (!record || !permission.can_equip) {
          throw new BadRequestException(permission.reason ?? "暂不能装备该外观");
        }

        await tx.appearanceOwnershipRecord.updateMany({
          where: {
            ownerType: record.ownerType,
            ownerId: record.ownerId,
            displaySlot: record.displaySlot,
          },
          data: { equipped: false },
        });
        const equipped = await tx.appearanceOwnershipRecord.update({
          where: { ownershipRecordId: record.ownershipRecordId },
          data: {
            equipped: true,
            permissionSnapshot: permission as unknown as Prisma.InputJsonValue,
          },
        });
        const updatedRecords = await tx.appearanceOwnershipRecord.findMany({
          where: {
            OR: [
              { ownerType: "player", ownerId: player.playerId },
              ...(player.sectId ? [{ ownerType: "sect", ownerId: player.sectId }] : []),
            ],
          },
        });
        const states = this.buildStates(player, updatedRecords);

        return {
          record_id: `appearance_plus_equip_${randomUUID()}`,
          appearance: toAppearancePlusState(
            config,
            equipped,
            buildPermission(config, player, equipped),
          ),
          display_slots: toAppearancePlusDisplaySlots(states),
        };
      },
    });
  }

  private async requirePlayer(accountId: string): Promise<PlayerWithMembership> {
    const player = await this.prisma.player.findUnique({
      where: { accountId },
      include: { sectMembership: true },
    });

    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
  }

  private async ensureOwnershipRecords(
    player: PlayerWithMembership,
    client: Tx | PrismaService = this.prisma,
  ): Promise<AppearanceOwnershipRecord[]> {
    const baseAppearances = await client.playerAppearance.findMany({
      where: { playerId: player.playerId },
    });
    const ownedBaseIds = new Set(baseAppearances.map((appearance) => appearance.appearanceId));

    await Promise.all(
      appearancePlusConfigs.map((config) => {
        const owner = ownerForConfig(player, config);
        if (!owner.ownerId) {
          return Promise.resolve(null);
        }
        const baseAppearance = config.baseAppearanceId
          ? baseAppearances.find(
              (appearance) => appearance.appearanceId === config.baseAppearanceId,
            )
          : null;
        const owned =
          config.defaultOwned ||
          (config.baseAppearanceId ? ownedBaseIds.has(config.baseAppearanceId) : false);
        if (!owned) {
          return Promise.resolve(null);
        }
        const permission = buildPermission(config, player, null);

        return client.appearanceOwnershipRecord.upsert({
          where: {
            ownerType_ownerId_appearanceId: {
              ownerType: owner.ownerType,
              ownerId: owner.ownerId,
              appearanceId: config.appearanceId,
            },
          },
          create: {
            ownershipRecordId: `appearance_plus_${randomUUID()}`,
            ownerType: owner.ownerType,
            ownerId: owner.ownerId,
            playerId: owner.ownerType === "player" ? player.playerId : null,
            sectId: owner.ownerType === "sect" ? player.sectId : null,
            appearanceId: config.appearanceId,
            appearanceType: config.appearanceType,
            displaySlot: config.displaySlot,
            sourceType: config.sourceType,
            sourceRecordId: baseAppearance?.playerAppearanceId ?? null,
            inherited: baseAppearance?.inherited ?? config.inherited,
            equipped: false,
            limited: config.limited,
            previewPayload: previewPayload(config) as unknown as Prisma.InputJsonValue,
            permissionSnapshot: permission as unknown as Prisma.InputJsonValue,
            configVersion: appearancePlusConfigVersion,
            rulesetVersion: appearancePlusRulesetVersion,
            rewardBoundaryVersion: appearancePlusRewardBoundaryVersion,
          },
          update: {
            appearanceType: config.appearanceType,
            displaySlot: config.displaySlot,
            sourceType: config.sourceType,
            sourceRecordId: baseAppearance?.playerAppearanceId ?? null,
            inherited: baseAppearance?.inherited ?? config.inherited,
            limited: config.limited,
            previewPayload: previewPayload(config) as unknown as Prisma.InputJsonValue,
            permissionSnapshot: permission as unknown as Prisma.InputJsonValue,
            configVersion: appearancePlusConfigVersion,
            rulesetVersion: appearancePlusRulesetVersion,
            rewardBoundaryVersion: appearancePlusRewardBoundaryVersion,
          },
        });
      }),
    );

    return client.appearanceOwnershipRecord.findMany({
      where: {
        OR: [
          { ownerType: "player", ownerId: player.playerId },
          ...(player.sectId ? [{ ownerType: "sect", ownerId: player.sectId }] : []),
        ],
      },
      orderBy: [{ displaySlot: "asc" }, { createdAt: "asc" }],
    });
  }

  private buildStates(
    player: PlayerWithMembership,
    records: AppearanceOwnershipRecord[],
  ): AppearancePlusState[] {
    return appearancePlusConfigs.map((config) => {
      const owner = ownerForConfig(player, config);
      const record =
        owner.ownerId === null
          ? null
          : (records.find(
              (item) =>
                item.ownerType === owner.ownerType &&
                item.ownerId === owner.ownerId &&
                item.appearanceId === config.appearanceId,
            ) ?? null);

      return toAppearancePlusState(config, record, buildPermission(config, player, record));
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

function normalizeEquipRequest(body: EquipAppearancePlusRequest): EquipAppearancePlusRequest {
  const appearanceId = body?.appearance_id?.trim();
  const displaySlot = body?.display_slot?.trim();
  if (!appearanceId) {
    throw new BadRequestException("请选择要装备的外观");
  }

  return displaySlot
    ? { appearance_id: appearanceId, display_slot: displaySlot }
    : { appearance_id: appearanceId };
}

function requireAppearanceConfig(appearanceId: string): AppearancePlusConfig {
  const config = appearancePlusConfigs.find((item) => item.appearanceId === appearanceId);
  if (!config) {
    throw new BadRequestException("外观不存在");
  }

  return config;
}

function ownerForConfig(
  player: PlayerWithMembership,
  config: AppearancePlusConfig,
): { ownerType: "player" | "sect"; ownerId: string | null } {
  if (config.ownerScope === "sect") {
    return { ownerType: "sect", ownerId: player.sectId ?? null };
  }

  return { ownerType: "player", ownerId: player.playerId };
}

function buildPermission(
  config: AppearancePlusConfig,
  player: PlayerWithMembership,
  record: AppearanceOwnershipRecord | null,
): AppearancePlusPermission {
  if (config.ownerScope === "sect" && !player.sectId) {
    return { can_equip: false, reason: "未加入宗门", required_role: config.requiredRole ?? null };
  }
  if (!record) {
    return { can_equip: false, reason: "尚未拥有", required_role: config.requiredRole ?? null };
  }
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    return { can_equip: false, reason: "外观已过期", required_role: config.requiredRole ?? null };
  }
  if (
    config.requiredRole &&
    !hasRequiredRole(player.sectMembership?.role ?? null, config.requiredRole)
  ) {
    return {
      can_equip: false,
      reason: "需要宗主或长老权限",
      required_role: config.requiredRole,
    };
  }

  return { can_equip: true, reason: null, required_role: config.requiredRole ?? null };
}

function hasRequiredRole(role: string | null, requiredRole: string): boolean {
  const rank: Record<string, number> = {
    leader: 4,
    elder: 3,
    deacon: 2,
    disciple: 1,
  };

  return (rank[role ?? ""] ?? 0) >= (rank[requiredRole] ?? 99);
}

function previewPayload(config: AppearancePlusConfig): Record<string, unknown> {
  return {
    title: config.preview.title,
    subtitle: config.preview.subtitle,
    sample_text: config.preview.sampleText,
    display_positions: config.preview.displayPositions,
    color_token: config.preview.colorToken,
    stat_bonus: null,
  };
}
