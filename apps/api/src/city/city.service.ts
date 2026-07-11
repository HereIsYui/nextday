import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  CityBirthOptionState,
  CityBuildingState,
  CityBuildingType,
  CityDefenseSnapshot,
  CityExpansionState,
  CityManagementResponse,
  CityOverviewResponse,
  CityResourceSnapshot,
  CollectTerritoryResponse,
  EstablishSubCityRequest,
  EstablishSubCityResponse,
  ExpandCityResponse,
  PlayerCityState,
  PlayerCityStatus,
  PlayerCityType,
  SettleMainCityRequest,
  SettleMainCityResponse,
  TerritoryCollectState,
  TerritoryHourlyOutputState,
  UpgradeCityBuildingRequest,
  UpgradeCityBuildingResponse,
  WorldTerrainType,
} from "@nextday/shared";
import type { CityBuilding, PlayerCity, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { hashRequestBody } from "../platform/utils/hash";
import {
  buildCityExpansionState,
  cityBuildingTypes,
  emptyTerritoryHourlyOutput,
  getBuildingUpgradeCost,
  getBuildingUpgradeSeconds,
  getCityBuildingEffectSummary,
  getCityBuildingName,
  getMaximumBuildingLevel,
  getStorageCapacity,
  sumTerritoryHourlyOutput,
  territoryCollectionCapSeconds,
  territoryConfigVersion,
} from "../world/territory.constants";
import {
  type MapTileConfig,
  type WorldCommanderyConfig,
  type WorldProvinceConfig,
  findWorldTile,
  isBirthPlainTile,
  recommendedBirthProvinceId,
  worldConfigVersion,
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

  async getManagement(accountId: string): Promise<CityManagementResponse> {
    const player = await this.requirePlayer(accountId);
    return this.prisma.$transaction((tx) => this.buildManagement(player.playerId, tx));
  }

  async collectTerritory(input: {
    accountId: string;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<CollectTerritoryResponse> {
    const requestHash = hashRequestBody({});
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingRecord) {
      this.assertMatchingIdempotencyRecord(existingRecord, input, requestHash);
      return existingRecord.responseData as unknown as CollectTerritoryResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) {
        throw new BadRequestException("请先创建角色");
      }
      const initialCity = await this.requireMainCity(player.playerId, tx);
      const city = await this.settleCompletedBuildingUpgrades(tx, initialCity);
      const buildings = await this.ensureCityBuildings(tx, city.cityId);
      const ownerships = await tx.worldBlockOwnership.findMany({
        where: { playerId: player.playerId, eraId: defaultEraId, status: "owned" },
        select: { terrainType: true },
      });
      const hourlyOutput = sumTerritoryHourlyOutput(
        ownerships.map((ownership) => normalizeTerrainType(ownership.terrainType)),
      );
      const warehouse = requireBuilding(buildings, "warehouse");
      const now = new Date();
      const collectState = buildTerritoryCollectState({
        city,
        hourlyOutput,
        storageCapacity: getStorageCapacity(warehouse.level),
        now,
      });
      const resources = normalizeResourceSnapshot(city.resourceSnapshot);
      const collected = capCollectionToStorage(
        collectState.claimable,
        resources,
        collectState.storage_capacity,
      );
      const overflow = subtractHourlyOutput(collectState.claimable, collected);
      const nextResources: CityResourceSnapshot = {
        ...resources,
        spirit_stone: String(Number(resources.spirit_stone) + collected.spirit_stone),
        grain: String(Number(resources.grain) + collected.grain),
        ore: String(Number(resources.ore) + collected.ore),
        wood: String(Number(resources.wood) + collected.wood),
        herb: String(Number(resources.herb) + collected.herb),
      };
      const updatedCity = await tx.playerCity.update({
        where: { cityId: city.cityId },
        data: {
          resourceSnapshot: nextResources as unknown as Prisma.InputJsonValue,
          territoryCollectedAt: now,
        },
      });
      const management = await this.buildManagement(player.playerId, tx, updatedCity);
      const responseData: CollectTerritoryResponse = {
        record_id: `territory_collect_${randomUUID()}`,
        city: this.toCityState(updatedCity),
        collected,
        overflow,
        territory_collect:
          management.territory_collect ??
          buildTerritoryCollectState({
            city: updatedCity,
            hourlyOutput,
            storageCapacity: getStorageCapacity(warehouse.level),
            now,
          }),
        buildings: management.buildings,
      };
      await this.createCityActionRecord(tx, {
        accountId: input.accountId,
        action: "city_territory_collect",
        afterSnapshot: responseData,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        reason: "收取领地产出",
        requestHash,
        targetId: city.cityId,
      });
      return responseData;
    });
  }

  async upgradeBuilding(input: {
    accountId: string;
    body: UpgradeCityBuildingRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<UpgradeCityBuildingResponse> {
    const body = normalizeUpgradeBuildingBody(input.body);
    const requestHash = hashRequestBody(body);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingRecord) {
      this.assertMatchingIdempotencyRecord(existingRecord, input, requestHash);
      return existingRecord.responseData as unknown as UpgradeCityBuildingResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) {
        throw new BadRequestException("请先创建角色");
      }
      const initialCity = await this.requireMainCity(player.playerId, tx);
      const city = await this.settleCompletedBuildingUpgrades(tx, initialCity);
      const buildings = await this.ensureCityBuildings(tx, city.cityId);
      if (buildings.some((building) => building.status === "upgrading")) {
        throw new BadRequestException("已有建筑正在升级，请等待队列完成");
      }
      const building = requireBuilding(buildings, body.building_type);
      if (building.level >= getMaximumBuildingLevel(city.cityLevel)) {
        throw new BadRequestException("主城等级不足，无法继续升级该建筑");
      }
      const cost = getBuildingUpgradeCost(body.building_type, building.level);
      const resources = normalizeResourceSnapshot(city.resourceSnapshot);
      if (!canAffordCityCost(resources, cost)) {
        throw new BadRequestException("主城库存不足，无法升级建筑");
      }

      const now = new Date();
      const upgradeEndsAt = new Date(
        now.getTime() + getBuildingUpgradeSeconds(building.level) * 1000,
      );
      const nextResources = subtractCityCost(resources, cost);
      const [updatedCity, updatedBuilding] = await Promise.all([
        tx.playerCity.update({
          where: { cityId: city.cityId },
          data: { resourceSnapshot: nextResources as unknown as Prisma.InputJsonValue },
        }),
        tx.cityBuilding.update({
          where: { buildingId: building.buildingId },
          data: {
            status: "upgrading",
            targetLevel: building.level + 1,
            upgradeStartedAt: now,
            upgradeEndsAt,
            costSnapshot: cost as unknown as Prisma.InputJsonValue,
          },
        }),
      ]);
      const refreshedBuildings = await this.ensureCityBuildings(tx, city.cityId);
      const responseData: UpgradeCityBuildingResponse = {
        record_id: `city_building_upgrade_${randomUUID()}`,
        city: this.toCityState(updatedCity),
        building: this.toBuildingState(updatedBuilding, updatedCity.cityLevel, now),
        buildings: refreshedBuildings.map((item) =>
          this.toBuildingState(item, updatedCity.cityLevel, now),
        ),
      };
      await this.createCityActionRecord(tx, {
        accountId: input.accountId,
        action: "city_building_upgrade",
        afterSnapshot: responseData,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        reason: `升级${getCityBuildingName(body.building_type)}`,
        requestHash,
        targetId: building.buildingId,
      });
      return responseData;
    });
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

      const tile = await pickAvailableBirthTile(tx, {
        commanderyId: commandery.commanderyId,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        provinceId: province.provinceId,
      });
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
          commanderyId: tile.commanderyId,
          tileId: tile.tileId,
          cityName: normalizedBody.city_name ?? `${player.name}仙城`,
          cityLevel: 1,
          status: "protected",
          protectionUntil,
          ownerSectId: player.sectId,
          defenseSnapshot: initialCityDefense as unknown as Prisma.InputJsonValue,
          resourceSnapshot: initialCityResources as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.worldBlockOwnership.create({
        data: {
          ownershipId: `block_owner_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          tileId: tile.tileId,
          provinceId: tile.provinceId,
          commanderyId: tile.commanderyId,
          terrainType: tile.terrainType,
          ownershipType: "main_city",
          status: "owned",
          sourceType: "main_city",
          sourceId: city.cityId,
          purchaseCost: 0n,
          idempotencyKey: `${input.idempotencyKey}:main_city_block`,
          configVersion: worldConfigVersion,
        },
      });
      await this.ensureCityBuildings(tx, city.cityId);
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

  async establishSubCity(input: {
    accountId: string;
    body: EstablishSubCityRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<EstablishSubCityResponse> {
    const body = normalizeEstablishSubCityBody(input.body);
    const requestHash = hashRequestBody(body);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingRecord) {
      this.assertMatchingIdempotencyRecord(existingRecord, input, requestHash);
      return existingRecord.responseData as unknown as EstablishSubCityResponse;
    }
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const mainCity = await this.requireMainCity(player.playerId, tx);
      if (mainCity.cityLevel < 2) throw new BadRequestException("主城达到 2 级后才能建立分城");
      const targetTile = findWorldTile(body.tile_id);
      if (!targetTile || targetTile.terrainType !== "plain") {
        throw new BadRequestException("只能在已拥有的平原区块建立分城");
      }
      const ownership = await tx.worldBlockOwnership.findUnique({
        where: { eraId_tileId: { eraId: defaultEraId, tileId: targetTile.tileId } },
      });
      if (!ownership || ownership.playerId !== player.playerId) {
        throw new BadRequestException("该平原区块不属于你");
      }
      const existingCity = await tx.playerCity.findUnique({ where: { tileId: targetTile.tileId } });
      if (existingCity) throw new BadRequestException("该区块已经建有城池");
      const subCityCount = await tx.playerCity.count({
        where: { playerId: player.playerId, cityType: "sub" },
      });
      if (subCityCount >= Math.floor(mainCity.cityLevel / 2)) {
        throw new BadRequestException("当前主城等级可管理的分城数量已满");
      }
      const resources = normalizeResourceSnapshot(mainCity.resourceSnapshot);
      const cost = { spirit_stone: 180, grain: 300, ore: 140, wood: 220 };
      if (!canAffordCityCost(resources, cost))
        throw new BadRequestException("主城库存不足，无法建立分城");
      const city = await tx.playerCity.create({
        data: {
          cityId: `city_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          cityType: "sub",
          provinceId: targetTile.provinceId,
          commanderyId: targetTile.commanderyId,
          tileId: targetTile.tileId,
          cityName: body.city_name ?? `${targetTile.tileName}分城`,
          cityLevel: 1,
          status: "protected",
          protectionUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
          ownerSectId: player.sectId,
          defenseSnapshot: {
            ...initialCityDefense,
            wall_durability: 500,
            wall_durability_cap: 500,
            garrison_power: 80,
          } as Prisma.InputJsonValue,
          resourceSnapshot: {
            spirit_stone: "0",
            grain: "0",
            ore: "0",
            wood: "0",
            herb: "0",
            soldier: "0",
          } as Prisma.InputJsonValue,
        },
      });
      await tx.playerCity.update({
        where: { cityId: mainCity.cityId },
        data: {
          resourceSnapshot: subtractCityCost(resources, cost) as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.worldBlockOwnership.update({
        where: { ownershipId: ownership.ownershipId },
        data: { ownershipType: "sub_city", sourceType: "sub_city", sourceId: city.cityId },
      });
      const overview = await this.buildOverview(player.playerId, tx);
      const responseData: EstablishSubCityResponse = {
        record_id: `sub_city_${randomUUID()}`,
        city: this.toCityState(city),
        overview,
      };
      await this.createCityActionRecord(tx, {
        accountId: input.accountId,
        action: "city_establish_sub",
        afterSnapshot: responseData,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        reason: "建立平原分城",
        requestHash,
        targetId: city.cityId,
      });
      return responseData;
    });
  }

  async expandMainCity(input: {
    accountId: string;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<ExpandCityResponse> {
    const requestHash = hashRequestBody({});
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

      return existingRecord.responseData as unknown as ExpandCityResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) {
        throw new BadRequestException("请先创建角色");
      }

      const city = await tx.playerCity.findFirst({
        where: { playerId: player.playerId, cityType: "main" },
        orderBy: { createdAt: "asc" },
      });
      if (!city) {
        throw new BadRequestException("请先建立主城");
      }

      const ownedPlainBlocks = await tx.worldBlockOwnership.count({
        where: {
          playerId: player.playerId,
          eraId: defaultEraId,
          status: "owned",
          terrainType: "plain",
        },
      });
      const resources = normalizeResourceSnapshot(city.resourceSnapshot);
      const expansion = buildCityExpansionState({
        cityLevel: city.cityLevel,
        ownedPlainBlocks,
        resources,
      });
      if (!expansion.eligible || !expansion.cost) {
        throw new BadRequestException(expansion.reason);
      }

      const nextResources: CityResourceSnapshot = {
        ...resources,
        spirit_stone: String(Number(resources.spirit_stone) - expansion.cost.spirit_stone),
        grain: String(Number(resources.grain) - expansion.cost.grain),
        ore: String(Number(resources.ore) - expansion.cost.ore),
        wood: String(Number(resources.wood) - expansion.cost.wood),
      };
      const defense = normalizeDefenseSnapshot(city.defenseSnapshot);
      const nextDefense: CityDefenseSnapshot = {
        ...defense,
        garrison_power: defense.garrison_power + 20,
        wall_durability: defense.wall_durability + 250,
        wall_durability_cap: defense.wall_durability_cap + 250,
      };
      const updatedCity = await tx.playerCity.update({
        where: { cityId: city.cityId },
        data: {
          cityLevel: { increment: 1 },
          defenseSnapshot: nextDefense as unknown as Prisma.InputJsonValue,
          resourceSnapshot: nextResources as unknown as Prisma.InputJsonValue,
        },
      });
      const responseData: ExpandCityResponse = {
        record_id: `city_expand_${randomUUID()}`,
        city: this.toCityState(updatedCity),
        expansion: buildCityExpansionState({
          cityLevel: updatedCity.cityLevel,
          ownedPlainBlocks,
          resources: nextResources,
        }),
      };

      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "city_expand",
          targetType: "player_city",
          targetId: city.cityId,
          afterSnapshot: responseData as unknown as Prisma.InputJsonValue,
          reason: "平原领地支撑主城扩建",
          idempotencyKey: input.idempotencyKey,
          configVersion: territoryConfigVersion,
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

  private async buildManagement(
    playerId: string,
    tx: Prisma.TransactionClient,
    knownCity?: PlayerCity,
  ): Promise<CityManagementResponse> {
    const initialCity =
      knownCity ??
      (await tx.playerCity.findFirst({
        where: { playerId, cityType: "main" },
        orderBy: { createdAt: "asc" },
      }));
    if (!initialCity) {
      return {
        city: null,
        buildings: [],
        territory_collect: null,
        active_building: null,
        config_version: territoryConfigVersion,
      };
    }
    const city = await this.settleCompletedBuildingUpgrades(tx, initialCity);
    const buildings = await this.ensureCityBuildings(tx, city.cityId);
    const ownerships = await tx.worldBlockOwnership.findMany({
      where: { playerId, eraId: defaultEraId, status: "owned" },
      select: { terrainType: true },
    });
    const hourlyOutput = sumTerritoryHourlyOutput(
      ownerships.map((ownership) => normalizeTerrainType(ownership.terrainType)),
    );
    const now = new Date();
    const buildingStates = buildings.map((building) =>
      this.toBuildingState(building, city.cityLevel, now),
    );
    const warehouse = requireBuilding(buildings, "warehouse");

    return {
      city: this.toCityState(city),
      buildings: buildingStates,
      territory_collect: buildTerritoryCollectState({
        city,
        hourlyOutput,
        storageCapacity: getStorageCapacity(warehouse.level),
        now,
      }),
      active_building: buildingStates.find((building) => building.status === "upgrading") ?? null,
      config_version: territoryConfigVersion,
    };
  }

  private async requireMainCity(
    playerId: string,
    tx: Prisma.TransactionClient,
  ): Promise<PlayerCity> {
    const city = await tx.playerCity.findFirst({
      where: { playerId, cityType: "main" },
      orderBy: { createdAt: "asc" },
    });
    if (!city) {
      throw new BadRequestException("请先建立主城");
    }
    return city;
  }

  private async ensureCityBuildings(
    tx: Prisma.TransactionClient,
    cityId: string,
  ): Promise<CityBuilding[]> {
    await tx.cityBuilding.createMany({
      data: cityBuildingTypes.map((buildingType) => ({
        buildingId: `city_building_${randomUUID()}`,
        cityId,
        buildingType,
        level: 1,
        status: "idle",
        costSnapshot: {} as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });
    return tx.cityBuilding.findMany({ where: { cityId }, orderBy: { buildingType: "asc" } });
  }

  private async settleCompletedBuildingUpgrades(
    tx: Prisma.TransactionClient,
    city: PlayerCity,
  ): Promise<PlayerCity> {
    const now = new Date();
    const completedBuildings = await tx.cityBuilding.findMany({
      where: { cityId: city.cityId, status: "upgrading", upgradeEndsAt: { lte: now } },
    });
    if (completedBuildings.length === 0) {
      return city;
    }

    let garrisonIncrease = 0;
    let wallIncrease = 0;
    for (const building of completedBuildings) {
      const targetLevel = building.targetLevel ?? building.level + 1;
      if (building.buildingType === "barracks") {
        garrisonIncrease += 35 * targetLevel;
      }
      if (building.buildingType === "fortification") {
        wallIncrease += 260 * targetLevel;
      }
      await tx.cityBuilding.update({
        where: { buildingId: building.buildingId },
        data: {
          level: targetLevel,
          status: "idle",
          targetLevel: null,
          upgradeStartedAt: null,
          upgradeEndsAt: null,
          costSnapshot: {} as Prisma.InputJsonValue,
        },
      });
    }
    if (garrisonIncrease === 0 && wallIncrease === 0) {
      return city;
    }
    const defense = normalizeDefenseSnapshot(city.defenseSnapshot);
    return tx.playerCity.update({
      where: { cityId: city.cityId },
      data: {
        defenseSnapshot: {
          ...defense,
          garrison_power: defense.garrison_power + garrisonIncrease,
          wall_durability: defense.wall_durability + wallIncrease,
          wall_durability_cap: defense.wall_durability_cap + wallIncrease,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private toBuildingState(building: CityBuilding, cityLevel: number, now: Date): CityBuildingState {
    const buildingType = normalizeBuildingType(building.buildingType);
    const targetLevel =
      building.status === "upgrading" ? (building.targetLevel ?? building.level + 1) : null;
    const remainingSeconds = building.upgradeEndsAt
      ? Math.max(0, Math.ceil((building.upgradeEndsAt.getTime() - now.getTime()) / 1000))
      : 0;
    const canUpgrade =
      building.status !== "upgrading" && building.level < getMaximumBuildingLevel(cityLevel);

    return {
      building_id: building.buildingId,
      building_type: buildingType,
      name: getCityBuildingName(buildingType),
      level: building.level,
      target_level: targetLevel,
      status: building.status === "upgrading" ? "upgrading" : "idle",
      upgrade_started_at: building.upgradeStartedAt?.toISOString() ?? null,
      upgrade_ends_at: building.upgradeEndsAt?.toISOString() ?? null,
      remaining_seconds: remainingSeconds,
      next_cost: canUpgrade ? getBuildingUpgradeCost(buildingType, building.level) : null,
      effect_summary: getCityBuildingEffectSummary(buildingType, targetLevel ?? building.level),
    };
  }

  private assertMatchingIdempotencyRecord(
    record: { accountId: string | null; endpoint: string; requestHash: string },
    input: { accountId: string; endpoint: string },
    requestHash: string,
  ): void {
    if (
      record.accountId !== input.accountId ||
      record.endpoint !== input.endpoint ||
      record.requestHash !== requestHash
    ) {
      throw new BadRequestException("幂等键已被其他请求使用");
    }
  }

  private async createCityActionRecord(
    tx: Prisma.TransactionClient,
    input: {
      accountId: string;
      action: string;
      afterSnapshot: unknown;
      endpoint: string;
      idempotencyKey: string;
      playerId: string;
      reason: string;
      requestHash: string;
      targetId: string;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        auditLogId: `audit_${randomUUID()}`,
        accountId: input.accountId,
        playerId: input.playerId,
        action: input.action,
        targetType: "player_city",
        targetId: input.targetId,
        afterSnapshot: input.afterSnapshot as Prisma.InputJsonValue,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        configVersion: territoryConfigVersion,
      },
    });
    await tx.idempotencyRecord.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        accountId: input.accountId,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        responseData: input.afterSnapshot as Prisma.InputJsonValue,
        statusCode: 200,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
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
    db: Pick<PrismaService, "playerCity" | "worldBlockOwnership"> | Prisma.TransactionClient = this
      .prisma,
  ): Promise<CityOverviewResponse> {
    const cities = await db.playerCity.findMany({
      where: { playerId },
      orderBy: [{ cityType: "asc" }, { createdAt: "asc" }],
    });
    const mainCity = cities.find((city) => city.cityType === "main") ?? null;
    const subCities = cities.filter((city) => city.cityType === "sub");
    const ownedBirthTileIds = mainCity
      ? new Set<string>()
      : new Set(
          (
            await db.worldBlockOwnership.findMany({
              where: {
                eraId: defaultEraId,
                status: "owned",
                tileId: {
                  in: worldTileConfigs.filter(isBirthPlainTile).map((tile) => tile.tileId),
                },
              },
              select: { tileId: true },
            })
          ).map((ownership) => ownership.tileId),
        );

    return {
      main_city: mainCity ? this.toCityState(mainCity) : null,
      sub_cities: subCities.map((city) => this.toCityState(city)),
      birth_options: mainCity ? [] : buildBirthOptions(ownedBirthTileIds),
      strategic_hint: mainCity
        ? `${mainCity.cityName}已在${getProvinceName(mainCity.provinceId)}立稳根基，下一步可清理城外野地。`
        : "选择出生州后，系统会在该州安全平原随机划出一块无主区块建立主城。",
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

function normalizeEstablishSubCityBody(body: EstablishSubCityRequest): EstablishSubCityRequest {
  const tileId = body?.tile_id?.trim();
  const cityName = body?.city_name?.trim();
  if (!tileId) throw new BadRequestException("请选择建立分城的区块");
  if (cityName && (cityName.length < 2 || cityName.length > 16)) {
    throw new BadRequestException("分城名需为 2-16 个字符");
  }
  return { tile_id: tileId, ...(cityName ? { city_name: cityName } : {}) };
}

function buildBirthOptions(ownedBirthTileIds: Set<string>): CityBirthOptionState[] {
  return worldProvinceConfigs
    .flatMap((province) =>
      province.commanderies
        .filter((commandery) => commandery.birthAvailable)
        .map((commandery) => {
          const tile = getBirthOptionTile(province, commandery);
          const available =
            province.birthAvailable &&
            commandery.birthAvailable &&
            worldTileConfigs.some(
              (candidate) =>
                candidate.provinceId === province.provinceId &&
                candidate.commanderyId === commandery.commanderyId &&
                isBirthPlainTile(candidate) &&
                !ownedBirthTileIds.has(candidate.tileId),
            );

          return {
            province_id: province.provinceId,
            province_name: province.name,
            commandery_id: commandery.commanderyId,
            commandery_name: commandery.name,
            tile_id: tile.tileId,
            tile_name: `${province.name}安全平原随机建城`,
            available,
            recommended:
              province.provinceId === recommendedBirthProvinceId || commandery.recommendedBirth,
            congestion: commandery.congestion,
            safety_level: commandery.safetyLevel,
            unavailable_reason: available ? null : "该郡安全平原暂时没有空位",
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

function getBirthOptionTile(
  province: WorldProvinceConfig,
  commandery: WorldCommanderyConfig,
): MapTileConfig {
  const tile = worldTileConfigs.find(
    (item) =>
      item.provinceId === province.provinceId &&
      item.commanderyId === commandery.commanderyId &&
      isBirthPlainTile(item),
  );

  if (!tile) {
    throw new BadRequestException("安全平原出生池配置缺失");
  }

  return tile;
}

async function pickAvailableBirthTile(
  tx: Prisma.TransactionClient,
  input: {
    provinceId: string;
    commanderyId: string;
    playerId: string;
    idempotencyKey: string;
  },
): Promise<MapTileConfig> {
  const candidates = worldTileConfigs.filter(
    (tile) =>
      tile.provinceId === input.provinceId &&
      tile.commanderyId === input.commanderyId &&
      isBirthPlainTile(tile),
  );
  const provinceCandidates = worldTileConfigs.filter(
    (tile) => tile.provinceId === input.provinceId && isBirthPlainTile(tile),
  );

  if (provinceCandidates.length === 0) {
    throw new BadRequestException("该州暂无可用安全平原");
  }

  const existingOwners = await tx.worldBlockOwnership.findMany({
    where: {
      eraId: defaultEraId,
      tileId: { in: provinceCandidates.map((tile) => tile.tileId) },
      status: "owned",
    },
    select: { tileId: true },
  });
  const ownedTileIds = new Set(existingOwners.map((owner) => owner.tileId));
  const availableTiles =
    candidates.filter((tile) => !ownedTileIds.has(tile.tileId)).length > 0
      ? candidates.filter((tile) => !ownedTileIds.has(tile.tileId))
      : provinceCandidates.filter((tile) => !ownedTileIds.has(tile.tileId));

  if (availableTiles.length === 0) {
    throw new BadRequestException("该州安全平原已被占满，请选择其他出生州");
  }

  const seed = stableNumber(`${input.playerId}:${input.provinceId}:${input.idempotencyKey}`);
  return availableTiles[seed % availableTiles.length];
}

function stableNumber(value: string): number {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 8);
  return Number.parseInt(hex, 16);
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

function normalizeUpgradeBuildingBody(
  body: UpgradeCityBuildingRequest,
): UpgradeCityBuildingRequest {
  const buildingType = body?.building_type;
  if (!buildingType || !cityBuildingTypes.includes(buildingType)) {
    throw new BadRequestException("请选择要升级的建筑");
  }

  return { building_type: buildingType };
}

function normalizeBuildingType(value: string): CityBuildingType {
  return cityBuildingTypes.includes(value as CityBuildingType)
    ? (value as CityBuildingType)
    : "warehouse";
}

function normalizeTerrainType(value: string): WorldTerrainType {
  if (value === "swamp" || value === "forest" || value === "mountain" || value === "desert") {
    return value;
  }

  return "plain";
}

function requireBuilding(buildings: CityBuilding[], buildingType: CityBuildingType): CityBuilding {
  const building = buildings.find((item) => item.buildingType === buildingType);
  if (!building) {
    throw new BadRequestException("建筑状态初始化失败");
  }

  return building;
}

function buildTerritoryCollectState(input: {
  city: PlayerCity;
  hourlyOutput: TerritoryHourlyOutputState;
  storageCapacity: ReturnType<typeof getStorageCapacity>;
  now: Date;
}): TerritoryCollectState {
  const elapsedSeconds = Math.max(
    0,
    Math.floor((input.now.getTime() - input.city.territoryCollectedAt.getTime()) / 1000),
  );
  const cappedSeconds = Math.min(elapsedSeconds, territoryCollectionCapSeconds);
  const multiplier = cappedSeconds / 3600;

  return {
    last_collected_at: input.city.territoryCollectedAt.toISOString(),
    elapsed_seconds: elapsedSeconds,
    capped_seconds: cappedSeconds,
    remaining_cap_seconds: Math.max(0, territoryCollectionCapSeconds - cappedSeconds),
    claimable: {
      spirit_stone: Math.floor(input.hourlyOutput.spirit_stone * multiplier),
      grain: Math.floor(input.hourlyOutput.grain * multiplier),
      ore: Math.floor(input.hourlyOutput.ore * multiplier),
      wood: Math.floor(input.hourlyOutput.wood * multiplier),
      herb: Math.floor(input.hourlyOutput.herb * multiplier),
    },
    storage_capacity: input.storageCapacity,
  };
}

function capCollectionToStorage(
  claimable: TerritoryHourlyOutputState,
  resources: CityResourceSnapshot,
  capacity: ReturnType<typeof getStorageCapacity>,
): TerritoryHourlyOutputState {
  return {
    spirit_stone: Math.max(
      0,
      Math.min(claimable.spirit_stone, capacity.spirit_stone - Number(resources.spirit_stone)),
    ),
    grain: Math.max(0, Math.min(claimable.grain, capacity.grain - Number(resources.grain))),
    ore: Math.max(0, Math.min(claimable.ore, capacity.ore - Number(resources.ore))),
    wood: Math.max(0, Math.min(claimable.wood, capacity.wood - Number(resources.wood))),
    herb: Math.max(0, Math.min(claimable.herb, capacity.herb - Number(resources.herb))),
  };
}

function subtractHourlyOutput(
  source: TerritoryHourlyOutputState,
  deducted: TerritoryHourlyOutputState,
): TerritoryHourlyOutputState {
  return {
    spirit_stone: source.spirit_stone - deducted.spirit_stone,
    grain: source.grain - deducted.grain,
    ore: source.ore - deducted.ore,
    wood: source.wood - deducted.wood,
    herb: source.herb - deducted.herb,
  };
}

function canAffordCityCost(
  resources: CityResourceSnapshot,
  cost: ReturnType<typeof getBuildingUpgradeCost>,
): boolean {
  return (
    Number(resources.spirit_stone) >= cost.spirit_stone &&
    Number(resources.grain) >= cost.grain &&
    Number(resources.ore) >= cost.ore &&
    Number(resources.wood) >= cost.wood
  );
}

function subtractCityCost(
  resources: CityResourceSnapshot,
  cost: ReturnType<typeof getBuildingUpgradeCost>,
): CityResourceSnapshot {
  return {
    ...resources,
    spirit_stone: String(Number(resources.spirit_stone) - cost.spirit_stone),
    grain: String(Number(resources.grain) - cost.grain),
    ore: String(Number(resources.ore) - cost.ore),
    wood: String(Number(resources.wood) - cost.wood),
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
