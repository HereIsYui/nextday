import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ArmyFormation,
  ArmyPresetType,
  CityArmyPresetState,
  CityArmyState,
  CityBirthOptionState,
  CityBuildingState,
  CityBuildingType,
  CityDefenseSnapshot,
  CityExpansionState,
  CityManagementResponse,
  CityOverviewResponse,
  CityResourceSnapshot,
  CityResourceStatusState,
  CityStoredResourceType,
  CollectTerritoryResponse,
  EstablishSubCityRequest,
  EstablishSubCityResponse,
  ExpandCityResponse,
  HarvestHerbRequest,
  HarvestHerbResponse,
  HerbGardenPlotState,
  HerbGardenState,
  PlantHerbRequest,
  PlantHerbResponse,
  PlayerCityState,
  PlayerCityStatus,
  PlayerCityType,
  SaveCityArmyPresetRequest,
  SaveCityArmyPresetResponse,
  SettleMainCityRequest,
  SettleMainCityResponse,
  TerritoryCollectState,
  TerritoryHourlyOutputState,
  TrainCitySoldiersRequest,
  TrainCitySoldiersResponse,
  UpgradeCityBuildingRequest,
  UpgradeCityBuildingResponse,
  WorldTerrainType,
} from "@nextday/shared";
import type {
  CityArmyPreset,
  CityBuilding,
  CityHerbGardenPlot,
  PlayerCity,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { getRealmConfig, getRealmName } from "../game/realm-progression.constants";
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
  armyCommanderConfigs,
  armyConfigVersion,
  defaultPresetName,
  getArmyPower,
  getFormationLabel,
  getFormationRequiredRealm,
  getSoldierCapacity,
  soldierTrainGrainCost,
  soldierTrainSpiritStoneCost,
} from "./army.constants";
import {
  cityConfigVersion,
  cityProtectionHours,
  herbGardenConfigVersion,
  herbGardenGrowSeconds,
  herbGardenHarvestCount,
  herbGardenPlantCost,
  herbGardenPlotCount,
  herbGardenUnlockSubCityCount,
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

  async getArmy(accountId: string): Promise<CityArmyState> {
    const player = await this.requirePlayer(accountId);
    return this.prisma.$transaction((tx) => this.buildArmyState(player.playerId, tx));
  }

  async trainSoldiers(input: {
    accountId: string;
    body: TrainCitySoldiersRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<TrainCitySoldiersResponse> {
    const body = normalizeTrainSoldiersBody(input.body);
    const requestHash = hashRequestBody(body);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingRecord) {
      this.assertMatchingIdempotencyRecord(existingRecord, input, requestHash);
      return existingRecord.responseData as unknown as TrainCitySoldiersResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const city = await this.requireMainCity(player.playerId, tx);
      const buildings = await this.ensureCityBuildings(tx, city.cityId);
      const barracks = requireBuilding(buildings, "barracks");
      const resources = normalizeResourceSnapshot(city.resourceSnapshot);
      const soldierCapacity = getSoldierCapacity(barracks.level, player.currentRealm);
      const availableSoldiers = Number(resources.soldier);
      if (availableSoldiers + body.soldier_count > soldierCapacity) {
        throw new BadRequestException(`兵营最多容纳 ${soldierCapacity} 名道兵`);
      }
      const cost = {
        spirit_stone: body.soldier_count * soldierTrainSpiritStoneCost,
        grain: body.soldier_count * soldierTrainGrainCost,
      };
      if (
        Number(resources.spirit_stone) < cost.spirit_stone ||
        Number(resources.grain) < cost.grain
      ) {
        throw new BadRequestException("主城灵石或粮草不足，无法训练道兵");
      }
      const updatedCity = await tx.playerCity.update({
        where: { cityId: city.cityId },
        data: {
          resourceSnapshot: {
            ...resources,
            spirit_stone: String(Number(resources.spirit_stone) - cost.spirit_stone),
            grain: String(Number(resources.grain) - cost.grain),
            soldier: String(availableSoldiers + body.soldier_count),
          } as Prisma.InputJsonValue,
        },
      });
      const responseData: TrainCitySoldiersResponse = {
        record_id: `city_train_soldiers_${randomUUID()}`,
        trained_soldiers: body.soldier_count,
        cost,
        city: this.toCityState(updatedCity),
        army: await this.buildArmyState(player.playerId, tx, updatedCity),
      };
      await this.createCityActionRecord(tx, {
        accountId: input.accountId,
        action: "city_train_soldiers",
        afterSnapshot: responseData,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        reason: `兵营训练 ${body.soldier_count} 名道兵`,
        requestHash,
        targetId: city.cityId,
      });
      return responseData;
    });
  }

  async saveArmyPreset(input: {
    accountId: string;
    body: SaveCityArmyPresetRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<SaveCityArmyPresetResponse> {
    const body = normalizeArmyPresetBody(input.body);
    const requestHash = hashRequestBody(body);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingRecord) {
      this.assertMatchingIdempotencyRecord(existingRecord, input, requestHash);
      return existingRecord.responseData as unknown as SaveCityArmyPresetResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const city = await this.requireMainCity(player.playerId, tx);
      const buildings = await this.ensureCityBuildings(tx, city.cityId);
      const barracks = requireBuilding(buildings, "barracks");
      const commander = requireArmyCommander(
        body.commander_id,
        barracks.level,
        player.currentRealm,
      );
      const formationRequiredRealm = getFormationRequiredRealm(body.formation);
      if (player.currentRealm < formationRequiredRealm) {
        throw new BadRequestException(
          `${getFormationLabel(body.formation)}阵需达到第 ${formationRequiredRealm} 境`,
        );
      }
      const availableSoldiers = Number(normalizeResourceSnapshot(city.resourceSnapshot).soldier);
      if (body.soldier_count > availableSoldiers) {
        throw new BadRequestException("当前可调度道兵不足，先在兵营训练或撤回驻军");
      }
      const power = getArmyPower({
        soldierCount: body.soldier_count,
        commanderPowerBonusPercent: commander.powerBonusPercent,
        formation: body.formation,
        realmPowerBonusPercent: getRealmConfig(player.currentRealm).powerBonusPercent,
      });
      const preset = await tx.cityArmyPreset.upsert({
        where: {
          playerId_presetType: { playerId: player.playerId, presetType: body.preset_type },
        },
        create: {
          presetId: `army_preset_${randomUUID()}`,
          playerId: player.playerId,
          cityId: city.cityId,
          presetType: body.preset_type,
          presetName: body.preset_name ?? defaultPresetName(body.preset_type),
          commanderId: commander.commanderId,
          soldierCount: body.soldier_count,
          formation: body.formation,
          power,
        },
        update: {
          cityId: city.cityId,
          presetName: body.preset_name ?? defaultPresetName(body.preset_type),
          commanderId: commander.commanderId,
          soldierCount: body.soldier_count,
          formation: body.formation,
          power,
        },
      });
      const presetState = this.toArmyPresetState(preset);
      if (!presetState) throw new BadRequestException("军队预设保存失败");
      const responseData: SaveCityArmyPresetResponse = {
        record_id: `city_army_preset_${randomUUID()}`,
        preset: presetState,
        army: await this.buildArmyState(player.playerId, tx, city),
      };
      await this.createCityActionRecord(tx, {
        accountId: input.accountId,
        action: "city_army_preset_save",
        afterSnapshot: responseData,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        reason: `保存${body.preset_type === "march" ? "行军" : "驻防"}预设`,
        requestHash,
        targetId: preset.presetId,
      });
      return responseData;
    });
  }

  async getHerbGarden(accountId: string): Promise<HerbGardenState> {
    const player = await this.requirePlayer(accountId);
    return this.prisma.$transaction((tx) => this.buildHerbGarden(player.playerId, tx));
  }

  async plantHerb(input: {
    accountId: string;
    body: PlantHerbRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<PlantHerbResponse> {
    const body = normalizeGardenPlotBody(input.body);
    const requestHash = hashRequestBody(body);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingRecord) {
      this.assertMatchingIdempotencyRecord(existingRecord, input, requestHash);
      return existingRecord.responseData as unknown as PlantHerbResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const city = await this.requireMainCity(player.playerId, tx);
      await this.ensureHerbGardenUnlocked(tx, player.playerId, city);
      const plot = await tx.cityHerbGardenPlot.findFirst({
        where: { plotId: body.plot_id, playerId: player.playerId, cityId: city.cityId },
      });
      if (!plot) throw new BadRequestException("请选择自己的药圃");
      if (plot.status !== "empty") throw new BadRequestException("这块药圃尚未收获");

      const resources = normalizeResourceSnapshot(city.resourceSnapshot);
      if (Number(resources.spirit_stone) < herbGardenPlantCost) {
        throw new BadRequestException("主城灵石不足，暂无法种植");
      }
      const now = new Date();
      const readyAt = new Date(now.getTime() + herbGardenGrowSeconds * 1000);
      const updatedCity = await tx.playerCity.update({
        where: { cityId: city.cityId },
        data: {
          resourceSnapshot: {
            ...resources,
            spirit_stone: String(Number(resources.spirit_stone) - herbGardenPlantCost),
          } as Prisma.InputJsonValue,
        },
      });
      await tx.cityHerbGardenPlot.update({
        where: { plotId: plot.plotId },
        data: { herbId: "low_herb", plantedAt: now, readyAt, status: "growing" },
      });
      const garden = await this.buildHerbGarden(player.playerId, tx, updatedCity);
      const responseData: PlantHerbResponse = {
        record_id: `garden_plant_${randomUUID()}`,
        city: this.toCityState(updatedCity),
        garden,
      };
      await this.createCityActionRecord(tx, {
        accountId: input.accountId,
        action: "city_herb_garden_plant",
        afterSnapshot: responseData,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        reason: "药园种植凝露草",
        requestHash,
        targetId: plot.plotId,
      });
      return responseData;
    });
  }

  async harvestHerb(input: {
    accountId: string;
    body: HarvestHerbRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<HarvestHerbResponse> {
    const body = normalizeGardenPlotBody(input.body);
    const requestHash = hashRequestBody(body);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingRecord) {
      this.assertMatchingIdempotencyRecord(existingRecord, input, requestHash);
      return existingRecord.responseData as unknown as HarvestHerbResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const city = await this.requireMainCity(player.playerId, tx);
      await this.ensureHerbGardenUnlocked(tx, player.playerId, city);
      const plot = await tx.cityHerbGardenPlot.findFirst({
        where: { plotId: body.plot_id, playerId: player.playerId, cityId: city.cityId },
      });
      if (!plot) throw new BadRequestException("请选择自己的药圃");
      if (!plot.readyAt || plot.readyAt.getTime() > Date.now()) {
        throw new BadRequestException("灵草尚未成熟");
      }

      await tx.playerItem.create({
        data: {
          itemInstanceId: `item_${randomUUID()}`,
          playerId: player.playerId,
          itemId: "low_herb",
          count: BigInt(herbGardenHarvestCount),
          bindType: "bound",
          locked: false,
          sourceType: "city_herb_garden",
          metadata: { garden_plot_id: plot.plotId } as Prisma.InputJsonValue,
        },
      });
      await tx.cityHerbGardenPlot.update({
        where: { plotId: plot.plotId },
        data: { herbId: null, plantedAt: null, readyAt: null, status: "empty" },
      });
      const garden = await this.buildHerbGarden(player.playerId, tx, city);
      const responseData: HarvestHerbResponse = {
        record_id: `garden_harvest_${randomUUID()}`,
        garden,
        harvested_item_id: "low_herb",
        harvested_item_name: "凝露草",
        harvested_count: herbGardenHarvestCount,
      };
      await this.createCityActionRecord(tx, {
        accountId: input.accountId,
        action: "city_herb_garden_harvest",
        afterSnapshot: responseData,
        endpoint: input.endpoint,
        idempotencyKey: input.idempotencyKey,
        playerId: player.playerId,
        reason: "药园收获凝露草",
        requestHash,
        targetId: plot.plotId,
      });
      return responseData;
    });
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
      if (building.level >= getMaximumBuildingLevel(city.cityLevel, player.currentRealm)) {
        throw new BadRequestException("主城等级或城主境界不足，无法继续升级该建筑");
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
        building: this.toBuildingState(
          updatedBuilding,
          updatedCity.cityLevel,
          player.currentRealm,
          now,
        ),
        buildings: refreshedBuildings.map((item) =>
          this.toBuildingState(item, updatedCity.cityLevel, player.currentRealm, now),
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
      if (player.currentRealm < 2) {
        throw new BadRequestException("达到第 2 境后才能建立分城");
      }
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
      const subCityLimit = Math.min(
        Math.floor(mainCity.cityLevel / 2),
        Math.max(0, player.currentRealm - 1),
      );
      if (subCityCount >= subCityLimit) {
        throw new BadRequestException("当前境界与主城等级可管理的分城数量已满");
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
      if (city.cityLevel >= player.currentRealm + 1) {
        throw new BadRequestException(`城主达到第 ${city.cityLevel} 境后才能继续扩建主城`);
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
        resource_statuses: [],
        active_building: null,
        upgrade_queue_capacity: 1,
        recommended_building_type: null,
        recommendation_reason: "建立主城后可规划仓库与城内建筑。",
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
    const player = await tx.player.findUniqueOrThrow({ where: { playerId } });
    const buildingStates = buildings.map((building) =>
      this.toBuildingState(building, city.cityLevel, player.currentRealm, now),
    );
    const warehouse = requireBuilding(buildings, "warehouse");
    const territoryCollect = buildTerritoryCollectState({
      city,
      hourlyOutput,
      storageCapacity: getStorageCapacity(warehouse.level),
      now,
    });
    const resourceStatuses = buildCityResourceStatuses(
      normalizeResourceSnapshot(city.resourceSnapshot),
      territoryCollect,
    );
    const recommendation = resolveBuildingRecommendation(buildingStates, resourceStatuses);

    return {
      city: this.toCityState(city),
      buildings: buildingStates,
      territory_collect: territoryCollect,
      resource_statuses: resourceStatuses,
      active_building: buildingStates.find((building) => building.status === "upgrading") ?? null,
      upgrade_queue_capacity: 1,
      recommended_building_type: recommendation.buildingType,
      recommendation_reason: recommendation.reason,
      config_version: territoryConfigVersion,
    };
  }

  private async buildArmyState(
    playerId: string,
    tx: Prisma.TransactionClient,
    knownCity?: PlayerCity,
  ): Promise<CityArmyState> {
    const city =
      knownCity ??
      (await tx.playerCity.findFirst({
        where: { playerId, cityType: "main" },
        orderBy: { createdAt: "asc" },
      }));
    if (!city) {
      return {
        city_id: null,
        current_realm: 0,
        current_realm_name: "尚未入道",
        available_soldiers: 0,
        soldier_capacity: 0,
        train_cost_per_soldier: {
          spirit_stone: soldierTrainSpiritStoneCost,
          grain: soldierTrainGrainCost,
        },
        commanders: [],
        formations: [],
        march_preset: null,
        garrison_preset: null,
        config_version: armyConfigVersion,
      };
    }
    const [player, buildings, presets] = await Promise.all([
      tx.player.findUniqueOrThrow({ where: { playerId } }),
      this.ensureCityBuildings(tx, city.cityId),
      tx.cityArmyPreset.findMany({ where: { playerId }, orderBy: { presetType: "asc" } }),
    ]);
    const barracks = requireBuilding(buildings, "barracks");
    return {
      city_id: city.cityId,
      current_realm: player.currentRealm,
      current_realm_name: getRealmName(player.currentRealm, player.route),
      available_soldiers: Number(normalizeResourceSnapshot(city.resourceSnapshot).soldier),
      soldier_capacity: getSoldierCapacity(barracks.level, player.currentRealm),
      train_cost_per_soldier: {
        spirit_stone: soldierTrainSpiritStoneCost,
        grain: soldierTrainGrainCost,
      },
      commanders: armyCommanderConfigs.map((commander) => ({
        commander_id: commander.commanderId,
        commander_name: commander.commanderName,
        role: commander.role,
        power_bonus_percent: commander.powerBonusPercent,
        unlocked:
          barracks.level >= commander.requiredBarracksLevel &&
          player.currentRealm >= commander.requiredRealm,
        unlock_reason:
          barracks.level >= commander.requiredBarracksLevel &&
          player.currentRealm >= commander.requiredRealm
            ? "已可任命"
            : `需第 ${commander.requiredRealm} 境、兵营 ${commander.requiredBarracksLevel} 级`,
      })),
      formations: (["balanced", "defense", "scout", "assault"] as ArmyFormation[]).map(
        (formation) => ({
          formation,
          label: `${getFormationLabel(formation)}阵`,
          required_realm: getFormationRequiredRealm(formation),
          unlocked: player.currentRealm >= getFormationRequiredRealm(formation),
        }),
      ),
      march_preset: this.toArmyPresetState(
        presets.find((preset) => preset.presetType === "march") ?? null,
      ),
      garrison_preset: this.toArmyPresetState(
        presets.find((preset) => preset.presetType === "garrison") ?? null,
      ),
      config_version: armyConfigVersion,
    };
  }

  private toArmyPresetState(preset: CityArmyPreset | null): CityArmyPresetState | null {
    if (!preset) return null;
    const commander = armyCommanderConfigs.find((item) => item.commanderId === preset.commanderId);
    return {
      preset_id: preset.presetId,
      preset_type: preset.presetType === "garrison" ? "garrison" : "march",
      preset_name: preset.presetName,
      commander_id: preset.commanderId,
      commander_name: commander?.commanderName ?? "主城先锋",
      soldier_count: preset.soldierCount,
      formation: normalizeArmyFormation(preset.formation),
      power: preset.power,
      updated_at: preset.updatedAt.toISOString(),
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

  private async buildHerbGarden(
    playerId: string,
    tx: Prisma.TransactionClient,
    knownCity?: PlayerCity,
  ): Promise<HerbGardenState> {
    const city =
      knownCity ??
      (await tx.playerCity.findFirst({
        where: { playerId, cityType: "main" },
        orderBy: { createdAt: "asc" },
      }));
    if (!city) {
      return {
        unlocked: false,
        unlock_hint: "建立主城后可规划药园。",
        plot_count: 0,
        growing_count: 0,
        ready_count: 0,
        plant_cost_spirit_stone: herbGardenPlantCost,
        grow_seconds: herbGardenGrowSeconds,
        plots: [],
        config_version: herbGardenConfigVersion,
      };
    }
    const subCityCount = await tx.playerCity.count({
      where: { playerId, cityType: "sub" },
    });
    if (subCityCount < herbGardenUnlockSubCityCount) {
      return {
        unlocked: false,
        unlock_hint: `建立 ${herbGardenUnlockSubCityCount} 座分城后开放药园`,
        plot_count: 0,
        growing_count: 0,
        ready_count: 0,
        plant_cost_spirit_stone: herbGardenPlantCost,
        grow_seconds: herbGardenGrowSeconds,
        plots: [],
        config_version: herbGardenConfigVersion,
      };
    }

    const plots = await this.ensureHerbGardenPlots(tx, playerId, city.cityId);
    const now = new Date();
    const states = plots.map((plot) => this.toHerbGardenPlotState(plot, now));
    return {
      unlocked: true,
      unlock_hint: "药园已开放，凝露草可用于基础炼丹。",
      plot_count: states.length,
      growing_count: states.filter((plot) => plot.status === "growing").length,
      ready_count: states.filter((plot) => plot.status === "ready").length,
      plant_cost_spirit_stone: herbGardenPlantCost,
      grow_seconds: herbGardenGrowSeconds,
      plots: states,
      config_version: herbGardenConfigVersion,
    };
  }

  private async ensureHerbGardenUnlocked(
    tx: Prisma.TransactionClient,
    playerId: string,
    city: PlayerCity,
  ): Promise<void> {
    const subCityCount = await tx.playerCity.count({
      where: { playerId, cityType: "sub" },
    });
    if (subCityCount < herbGardenUnlockSubCityCount) {
      throw new BadRequestException(`建立 ${herbGardenUnlockSubCityCount} 座分城后开放药园`);
    }
    await this.ensureHerbGardenPlots(tx, playerId, city.cityId);
  }

  private async ensureHerbGardenPlots(
    tx: Prisma.TransactionClient,
    playerId: string,
    cityId: string,
  ): Promise<CityHerbGardenPlot[]> {
    await tx.cityHerbGardenPlot.createMany({
      data: Array.from({ length: herbGardenPlotCount }, (_, index) => ({
        plotId: `garden_plot_${randomUUID()}`,
        playerId,
        cityId,
        plotIndex: index + 1,
        status: "empty",
      })),
      skipDuplicates: true,
    });
    return tx.cityHerbGardenPlot.findMany({ where: { cityId }, orderBy: { plotIndex: "asc" } });
  }

  private toHerbGardenPlotState(plot: CityHerbGardenPlot, now: Date): HerbGardenPlotState {
    const readyAt = plot.readyAt?.getTime() ?? null;
    const ready = Boolean(readyAt && readyAt <= now.getTime());
    return {
      plot_id: plot.plotId,
      plot_index: plot.plotIndex,
      herb_id: plot.herbId,
      herb_name: plot.herbId === "low_herb" ? "凝露草" : null,
      status: plot.status === "empty" ? "empty" : ready ? "ready" : "growing",
      planted_at: plot.plantedAt?.toISOString() ?? null,
      ready_at: plot.readyAt?.toISOString() ?? null,
      remaining_seconds: readyAt ? Math.max(0, Math.ceil((readyAt - now.getTime()) / 1000)) : 0,
      harvest_count: plot.herbId ? herbGardenHarvestCount : 0,
    };
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

  private toBuildingState(
    building: CityBuilding,
    cityLevel: number,
    currentRealm: number,
    now: Date,
  ): CityBuildingState {
    const buildingType = normalizeBuildingType(building.buildingType);
    const targetLevel =
      building.status === "upgrading" ? (building.targetLevel ?? building.level + 1) : null;
    const remainingSeconds = building.upgradeEndsAt
      ? Math.max(0, Math.ceil((building.upgradeEndsAt.getTime() - now.getTime()) / 1000))
      : 0;
    const canUpgrade =
      building.status !== "upgrading" &&
      building.level < getMaximumBuildingLevel(cityLevel, currentRealm);

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

function normalizeGardenPlotBody(body: PlantHerbRequest | HarvestHerbRequest): { plot_id: string } {
  const plotId = body?.plot_id?.trim();
  if (!plotId) throw new BadRequestException("请选择药圃");
  return { plot_id: plotId };
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

function normalizeTrainSoldiersBody(body: TrainCitySoldiersRequest): TrainCitySoldiersRequest {
  const soldierCount = Math.floor(body?.soldier_count);
  if (!Number.isFinite(soldierCount) || soldierCount <= 0 || soldierCount > 200) {
    throw new BadRequestException("单次训练道兵数量必须为 1 至 200");
  }
  return { soldier_count: soldierCount };
}

function normalizeArmyPresetBody(body: SaveCityArmyPresetRequest): SaveCityArmyPresetRequest {
  const presetType: ArmyPresetType | null =
    body?.preset_type === "march" || body?.preset_type === "garrison" ? body.preset_type : null;
  const formation = normalizeArmyFormation(body?.formation);
  const soldierCount = Math.floor(body?.soldier_count);
  if (!presetType) throw new BadRequestException("请选择行军或驻防预设");
  if (!body?.commander_id?.trim()) throw new BadRequestException("请选择带队将领");
  if (!Number.isFinite(soldierCount) || soldierCount <= 0) {
    throw new BadRequestException("预设道兵数量必须为正整数");
  }
  return {
    preset_type: presetType,
    preset_name: body.preset_name?.trim().slice(0, 20) || undefined,
    commander_id: body.commander_id.trim(),
    soldier_count: soldierCount,
    formation,
  };
}

function normalizeArmyFormation(value: unknown): ArmyFormation {
  return value === "assault" || value === "defense" || value === "scout" ? value : "balanced";
}

function requireArmyCommander(commanderId: string, barracksLevel: number, currentRealm: number) {
  const commander = armyCommanderConfigs.find((item) => item.commanderId === commanderId);
  if (!commander) throw new BadRequestException("未知将领");
  if (barracksLevel < commander.requiredBarracksLevel) {
    throw new BadRequestException(`兵营达到 ${commander.requiredBarracksLevel} 级后可任命该将领`);
  }
  if (currentRealm < commander.requiredRealm) {
    throw new BadRequestException(`达到第 ${commander.requiredRealm} 境后可任命该将领`);
  }
  return commander;
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

const storedResourceLabels: Record<CityStoredResourceType, string> = {
  spirit_stone: "灵石",
  grain: "粮草",
  ore: "矿材",
  wood: "灵木",
  herb: "灵草",
};

function buildCityResourceStatuses(
  resources: CityResourceSnapshot,
  collectState: TerritoryCollectState,
): CityResourceStatusState[] {
  return (Object.keys(storedResourceLabels) as CityStoredResourceType[]).map((resourceType) => {
    const current = Number(resources[resourceType]);
    const capacity = collectState.storage_capacity[resourceType];
    const claimable = collectState.claimable[resourceType];
    const collectable = Math.max(0, Math.min(claimable, capacity - current));
    const overflow = Math.max(0, claimable - collectable);
    const fullnessPercent =
      capacity > 0 ? Math.min(100, Math.round((current / capacity) * 100)) : 0;
    return {
      resource_type: resourceType,
      resource_label: storedResourceLabels[resourceType],
      current,
      capacity,
      claimable,
      collectable,
      overflow,
      fullness_percent: fullnessPercent,
      status: overflow > 0 ? "overflow" : fullnessPercent >= 80 ? "near_full" : "normal",
    };
  });
}

function resolveBuildingRecommendation(
  buildings: CityBuildingState[],
  resourceStatuses: CityResourceStatusState[],
): { buildingType: CityBuildingType | null; reason: string } {
  const activeBuilding = buildings.find((building) => building.status === "upgrading");
  if (activeBuilding) {
    return {
      buildingType: activeBuilding.building_type,
      reason: `${activeBuilding.name}正在升级，完成后才能安排下一项工程。`,
    };
  }
  const storageRisk = resourceStatuses.find(
    (resource) => resource.status === "overflow" || resource.status === "near_full",
  );
  const warehouse = buildings.find((building) => building.building_type === "warehouse");
  if (storageRisk && warehouse?.next_cost) {
    return {
      buildingType: "warehouse",
      reason:
        storageRisk.status === "overflow"
          ? `${storageRisk.resource_label}将有 ${storageRisk.overflow} 无法入库，优先扩建仓库。`
          : `${storageRisk.resource_label}库存已达 ${storageRisk.fullness_percent}%，建议提前扩建仓库。`,
    };
  }
  const nextBuilding = buildings
    .filter((building) => building.next_cost)
    .sort((left, right) => left.level - right.level || left.name.localeCompare(right.name))[0];
  return nextBuilding
    ? {
        buildingType: nextBuilding.building_type,
        reason: `${nextBuilding.name}当前等级较低，可继续建设以完善城池能力。`,
      }
    : { buildingType: null, reason: "当前建筑已达到主城等级允许的上限。" };
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
