import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  CityBirthOptionState,
  CityDefenseSnapshot,
  CityOverviewResponse,
  CityResourceSnapshot,
  PlayerCityState,
  PlayerCityStatus,
  PlayerCityType,
  SettleMainCityRequest,
  SettleMainCityResponse,
} from "@nextday/shared";
import type { PlayerCity, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { hashRequestBody } from "../platform/utils/hash";
import {
  type MapTileConfig,
  type WorldCommanderyConfig,
  type WorldProvinceConfig,
  recommendedBirthProvinceId,
  worldProvinceConfigs,
  worldTileConfigs,
} from "../world/world.constants";
import {
  cityConfigVersion,
  cityProtectionHours,
  initialCityDefense,
  initialCityResources,
} from "./city.constants";

@Injectable()
export class CityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getOverview(accountId: string): Promise<CityOverviewResponse> {
    const player = await this.requirePlayer(accountId);
    return this.buildOverview(player.playerId);
  }

  async settleMainCity(input: {
    accountId: string;
    body: SettleMainCityRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<SettleMainCityResponse> {
    const normalizedBody = normalizeSettleMainCityBody(input.body);
    const requestHash = hashRequestBody(normalizedBody);
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

      return existingRecord.responseData as unknown as SettleMainCityResponse;
    }

    const province = requireBirthProvince(normalizedBody.province_id);
    const commandery = requireBirthCommandery(province, normalizedBody.commandery_id);
    const tile = requireBirthTile(province, commandery);

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { accountId: input.accountId },
        include: { progress: true },
      });

      if (!player) {
        throw new BadRequestException("请先创建角色");
      }

      const existingMainCity = await tx.playerCity.findFirst({
        where: { playerId: player.playerId, cityType: "main" },
      });

      if (existingMainCity) {
        throw new BadRequestException("已经建立主城");
      }

      const protectionUntil =
        player.progress?.newbieProtectionUntil ??
        new Date(Date.now() + cityProtectionHours * 60 * 60 * 1000);
      const city = await tx.playerCity.create({
        data: {
          cityId: `city_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          cityType: "main",
          provinceId: province.provinceId,
          commanderyId: commandery.commanderyId,
          tileId: `${tile.tileId}_${player.playerId}`,
          cityName: normalizedBody.city_name ?? `${player.name}仙城`,
          cityLevel: 1,
          status: "protected",
          protectionUntil,
          ownerSectId: player.sectId,
          defenseSnapshot: initialCityDefense as unknown as Prisma.InputJsonValue,
          resourceSnapshot: initialCityResources as unknown as Prisma.InputJsonValue,
        },
      });
      const overview = await this.buildOverview(player.playerId, tx);
      const responseData: SettleMainCityResponse = {
        record_id: `settle_city_${randomUUID()}`,
        city: this.toCityState(city),
        overview,
      };

      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "city_settle_main",
          targetType: "player_city",
          targetId: city.cityId,
          afterSnapshot: responseData.city as unknown as Prisma.InputJsonValue,
          reason: "九州城池纪元建立主城",
          idempotencyKey: input.idempotencyKey,
          configVersion: cityConfigVersion,
        },
      });

      await tx.idempotencyRecord.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          accountId: input.accountId,
          endpoint: input.endpoint,
          requestHash,
          responseData: responseData as unknown as Prisma.InputJsonValue,
          statusCode: 200,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return responseData;
    });
  }

  private async requirePlayer(accountId: string) {
    const player = await this.prisma.player.findUnique({
      where: { accountId },
    });

    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
  }

  private async buildOverview(
    playerId: string,
    db: Pick<PrismaService, "playerCity"> | Prisma.TransactionClient = this.prisma,
  ): Promise<CityOverviewResponse> {
    const cities = await db.playerCity.findMany({
      where: { playerId },
      orderBy: [{ cityType: "asc" }, { createdAt: "asc" }],
    });
    const mainCity = cities.find((city) => city.cityType === "main") ?? null;
    const subCities = cities.filter((city) => city.cityType === "sub");

    return {
      main_city: mainCity ? this.toCityState(mainCity) : null,
      sub_cities: subCities.map((city) => this.toCityState(city)),
      birth_options: mainCity ? [] : buildBirthOptions(),
      strategic_hint: mainCity
        ? `${mainCity.cityName}已在${getProvinceName(mainCity.provinceId)}立稳根基，下一步可清理城外野地。`
        : "先选择一个开放出生州建立主城，再从城外野地开始扩张。",
      config_version: cityConfigVersion,
    };
  }

  private toCityState(city: PlayerCity): PlayerCityState {
    const province = requireProvince(city.provinceId);
    const commandery = requireCommandery(province, city.commanderyId);

    return {
      city_id: city.cityId,
      city_type: normalizeCityType(city.cityType),
      province_id: city.provinceId,
      province_name: province.name,
      commandery_id: city.commanderyId,
      commandery_name: commandery.name,
      tile_id: city.tileId,
      city_name: city.cityName,
      city_level: city.cityLevel,
      status: normalizeCityStatus(city.status),
      protection_until: city.protectionUntil?.toISOString() ?? null,
      owner_sect_id: city.ownerSectId,
      defense: normalizeDefenseSnapshot(city.defenseSnapshot),
      resources: normalizeResourceSnapshot(city.resourceSnapshot),
      created_at: city.createdAt.toISOString(),
      updated_at: city.updatedAt.toISOString(),
    };
  }
}

function normalizeSettleMainCityBody(body: SettleMainCityRequest): SettleMainCityRequest {
  const provinceId = body?.province_id?.trim();
  const commanderyId = body?.commandery_id?.trim();
  const cityName = body?.city_name?.trim();

  if (!provinceId) {
    throw new BadRequestException("请选择出生州");
  }

  if (cityName && (cityName.length < 2 || cityName.length > 16)) {
    throw new BadRequestException("城池名需为 2-16 个字符");
  }

  return {
    province_id: provinceId,
    ...(commanderyId ? { commandery_id: commanderyId } : {}),
    ...(cityName ? { city_name: cityName } : {}),
  };
}

function buildBirthOptions(): CityBirthOptionState[] {
  return worldProvinceConfigs
    .flatMap((province) =>
      province.commanderies
        .filter((commandery) => commandery.birthAvailable)
        .map((commandery) => {
          const tile = requireBirthTile(province, commandery);
          const available = province.birthAvailable && commandery.birthAvailable;

          return {
            province_id: province.provinceId,
            province_name: province.name,
            commandery_id: commandery.commanderyId,
            commandery_name: commandery.name,
            tile_id: tile.tileId,
            tile_name: tile.tileName,
            available,
            recommended:
              province.provinceId === recommendedBirthProvinceId || commandery.recommendedBirth,
            congestion: commandery.congestion,
            safety_level: commandery.safetyLevel,
            unavailable_reason: available ? null : "本季暂未开放出生",
          };
        }),
    )
    .sort((left, right) => Number(right.recommended) - Number(left.recommended));
}

function requireBirthProvince(provinceId: string): WorldProvinceConfig {
  const province = requireProvince(provinceId);

  if (!province.birthAvailable) {
    throw new BadRequestException("该州暂未开放出生");
  }

  return province;
}

function requireProvince(provinceId: string): WorldProvinceConfig {
  const province = worldProvinceConfigs.find((item) => item.provinceId === provinceId);

  if (!province) {
    throw new BadRequestException("未知州域");
  }

  return province;
}

function requireBirthCommandery(
  province: WorldProvinceConfig,
  commanderyId: string | undefined,
): WorldCommanderyConfig {
  const commandery = commanderyId
    ? province.commanderies.find((item) => item.commanderyId === commanderyId)
    : (province.commanderies.find((item) => item.recommendedBirth) ??
      province.commanderies.find((item) => item.birthAvailable));

  if (!commandery) {
    throw new BadRequestException("该州暂无可出生郡域");
  }

  if (!commandery.birthAvailable) {
    throw new BadRequestException("该郡暂未开放出生");
  }

  return commandery;
}

function requireCommandery(
  province: WorldProvinceConfig,
  commanderyId: string,
): WorldCommanderyConfig {
  const commandery = province.commanderies.find((item) => item.commanderyId === commanderyId);

  if (!commandery) {
    throw new BadRequestException("未知郡域");
  }

  return commandery;
}

function requireBirthTile(
  province: WorldProvinceConfig,
  commandery: WorldCommanderyConfig,
): MapTileConfig {
  const tile = worldTileConfigs.find(
    (item) =>
      item.provinceId === province.provinceId &&
      item.commanderyId === commandery.commanderyId &&
      item.tileType === "main_city",
  );

  if (!tile) {
    throw new BadRequestException("出生地块配置缺失");
  }

  return tile;
}

function getProvinceName(provinceId: string): string {
  return requireProvince(provinceId).name;
}

function normalizeCityType(value: string): PlayerCityType {
  return value === "sub" ? "sub" : "main";
}

function normalizeCityStatus(value: string): PlayerCityStatus {
  if (value === "normal" || value === "damaged" || value === "besieged" || value === "vassal") {
    return value;
  }

  return "protected";
}

function normalizeDefenseSnapshot(value: Prisma.JsonValue): CityDefenseSnapshot {
  const record = isRecord(value) ? value : {};

  return {
    wall_durability: toNumber(record.wall_durability, initialCityDefense.wall_durability),
    wall_durability_cap: toNumber(
      record.wall_durability_cap,
      initialCityDefense.wall_durability_cap,
    ),
    garrison_power: toNumber(record.garrison_power, initialCityDefense.garrison_power),
    protection_label: toStringValue(record.protection_label, initialCityDefense.protection_label),
  };
}

function normalizeResourceSnapshot(value: Prisma.JsonValue): CityResourceSnapshot {
  const record = isRecord(value) ? value : {};

  return {
    spirit_stone: toStringValue(record.spirit_stone, initialCityResources.spirit_stone),
    grain: toStringValue(record.grain, initialCityResources.grain),
    ore: toStringValue(record.ore, initialCityResources.ore),
    wood: toStringValue(record.wood, initialCityResources.wood),
    herb: toStringValue(record.herb, initialCityResources.herb),
    soldier: toStringValue(record.soldier, initialCityResources.soldier),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }

  return fallback;
}
