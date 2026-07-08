import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  MapTileState,
  MarchQueueState,
  MarchQueueStatus,
  MarchType,
  OccupyWorldRequest,
  OccupyWorldResponse,
  ProvinceWarState,
  StartWorldMarchRequest,
  StartWorldMarchResponse,
  TerritoryDefenseSnapshot,
  TerritoryNodeState,
  TerritoryOccupationState,
  TerritoryOccupationStatus,
  TerritoryOccupationType,
  TerritoryProductionSnapshot,
  WorldCommanderyState,
  WorldMapResponse,
  WorldMarchListResponse,
  WorldOwnerState,
  WorldProvinceListResponse,
  WorldProvinceState,
} from "@nextday/shared";
import type { MarchQueue, Player, PlayerCity, Prisma, TerritoryOccupation } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { hashRequestBody } from "../platform/utils/hash";
import {
  type MapTileConfig,
  type TerritoryNodeConfig,
  type WorldCommanderyConfig,
  type WorldProvinceConfig,
  recommendedBirthProvinceId,
  worldConfigVersion,
  worldProvinceConfigs,
  worldSeasonId,
  worldSeasonName,
  worldTileConfigs,
} from "./world.constants";

const marchConfigVersion = "world_march_r1_001";
const occupationConfigVersion = "world_occupation_r1_001";
const validMarchTypes = new Set<MarchType>(["scout", "clear_wild", "occupy", "reinforce"]);
const occupationMarchTypes = new Set<MarchType>(["clear_wild", "occupy"]);

type OccupationWithPlayer = TerritoryOccupation & { player: Player };

@Injectable()
export class WorldService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  getProvinces(): WorldProvinceListResponse {
    return {
      provinces: worldProvinceConfigs.map((province) => this.toProvinceState(province)),
      recommended_province_id: recommendedBirthProvinceId,
      season_id: worldSeasonId,
      season_name: worldSeasonName,
      config_version: worldConfigVersion,
    };
  }

  async getMarches(accountId: string): Promise<WorldMarchListResponse> {
    const player = await this.requirePlayer(accountId);
    const cities = await this.prisma.playerCity.findMany({
      where: { playerId: player.playerId },
    });
    const cityMap = new Map(cities.map((city) => [city.cityId, city]));
    const marches = await this.prisma.marchQueue.findMany({
      where: { playerId: player.playerId },
      orderBy: [{ createdAt: "desc" }],
      take: 20,
    });

    return this.toMarchListResponse(marches, cityMap);
  }

  async startMarch(input: {
    accountId: string;
    body: StartWorldMarchRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<StartWorldMarchResponse> {
    const normalizedBody = normalizeStartMarchBody(input.body);
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

      return existingRecord.responseData as unknown as StartWorldMarchResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { accountId: input.accountId },
      });

      if (!player) {
        throw new BadRequestException("请先创建角色");
      }

      const cities = await tx.playerCity.findMany({
        where: { playerId: player.playerId },
        orderBy: [{ cityType: "asc" }, { createdAt: "asc" }],
      });
      const sourceCity = resolveSourceCity(cities, normalizedBody.source_city_id);
      const targetTile = requireMarchTarget(sourceCity, normalizedBody.target_tile_id);
      const now = new Date();
      const activeMarchCount = await tx.marchQueue.count({
        where: { playerId: player.playerId, status: "marching", arrivesAt: { gt: now } },
      });

      if (activeMarchCount >= 1) {
        throw new BadRequestException("当前已有队伍行军中");
      }

      const travelSeconds = Math.max(60, targetTile.travelSeconds);
      const march = await tx.marchQueue.create({
        data: {
          marchId: `march_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          sourceCityId: sourceCity.cityId,
          sourceTileId: sourceCity.tileId,
          targetTileId: targetTile.tileId,
          targetName: targetTile.tileName,
          provinceId: targetTile.provinceId,
          commanderyId: targetTile.commanderyId,
          marchType: normalizedBody.march_type,
          status: "marching",
          teamSnapshot: createTeamSnapshot(sourceCity),
          travelSeconds,
          startedAt: now,
          arrivesAt: new Date(now.getTime() + travelSeconds * 1000),
          idempotencyKey: input.idempotencyKey,
          configVersion: marchConfigVersion,
        },
      });
      const cityMap = new Map(cities.map((city) => [city.cityId, city]));
      const marchState = this.toMarchState(march, sourceCity);
      const marchList = this.toMarchListResponse([march], cityMap);
      const responseData: StartWorldMarchResponse = {
        record_id: `start_march_${randomUUID()}`,
        march: marchState,
        marches: marchList,
      };

      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "world_march_start",
          targetType: "map_tile",
          targetId: targetTile.tileId,
          afterSnapshot: responseData.march as unknown as Prisma.InputJsonValue,
          reason: "九州城池纪元发起行军",
          idempotencyKey: input.idempotencyKey,
          configVersion: marchConfigVersion,
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

  async occupy(input: {
    accountId: string;
    body: OccupyWorldRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<OccupyWorldResponse> {
    const normalizedBody = normalizeOccupyWorldBody(input.body);
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

      return existingRecord.responseData as unknown as OccupyWorldResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { accountId: input.accountId },
      });

      if (!player) {
        throw new BadRequestException("请先创建角色");
      }

      const march = await tx.marchQueue.findUnique({
        where: { marchId: normalizedBody.march_id },
      });

      if (!march || march.playerId !== player.playerId) {
        throw new BadRequestException("行军队列不存在");
      }

      if (march.status === "resolved" || march.resolvedAt) {
        throw new BadRequestException("该行军已处理");
      }

      if (getComputedMarchStatus(march) !== "arrived") {
        throw new BadRequestException("队伍尚未抵达");
      }

      const marchType = normalizeMarchType(march.marchType);
      if (!occupationMarchTypes.has(marchType)) {
        throw new BadRequestException("该行军类型不能占领地块");
      }

      const targetTile = requireOccupationTarget(march.targetTileId);
      const existingOccupation = await tx.territoryOccupation.findUnique({
        where: {
          playerId_tileId: {
            playerId: player.playerId,
            tileId: targetTile.tileId,
          },
        },
      });

      if (existingOccupation) {
        throw new BadRequestException("你已经占领该地块");
      }

      const now = new Date();
      const occupation = await tx.territoryOccupation.create({
        data: {
          occupationId: `occupation_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          sourceMarchId: march.marchId,
          tileId: targetTile.tileId,
          nodeId: targetTile.nodes[0]?.nodeId ?? null,
          provinceId: targetTile.provinceId,
          commanderyId: targetTile.commanderyId,
          occupationType: getOccupationType(targetTile),
          status: "occupied",
          productionSnapshot: createProductionSnapshot(
            targetTile,
          ) as unknown as Prisma.InputJsonValue,
          defenseSnapshot: createOccupationDefenseSnapshot(
            targetTile,
          ) as unknown as Prisma.InputJsonValue,
          occupiedAt: now,
          idempotencyKey: input.idempotencyKey,
          configVersion: occupationConfigVersion,
        },
      });
      const updatedMarch = await tx.marchQueue.update({
        where: { marchId: march.marchId },
        data: { status: "resolved", resolvedAt: now },
      });
      const sourceCity = await tx.playerCity.findUnique({
        where: { cityId: march.sourceCityId },
      });

      if (!sourceCity) {
        throw new BadRequestException("行军来源城池不存在");
      }

      const occupations = await tx.territoryOccupation.findMany({
        where: {
          playerId: player.playerId,
          provinceId: targetTile.provinceId,
          status: "occupied",
        },
        include: { player: true },
      });
      const responseData: OccupyWorldResponse = {
        record_id: `occupy_${randomUUID()}`,
        occupation: this.toOccupationState({ ...occupation, player }),
        march: this.toMarchState(updatedMarch, sourceCity),
        map: this.buildMapResponse({
          occupations,
          playerId: player.playerId,
          provinceId: targetTile.provinceId,
        }),
      };

      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "world_occupy_tile",
          targetType: "map_tile",
          targetId: targetTile.tileId,
          afterSnapshot: responseData.occupation as unknown as Prisma.InputJsonValue,
          reason: "九州城池纪元清野占领",
          idempotencyKey: input.idempotencyKey,
          configVersion: occupationConfigVersion,
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

  async getMap(input: { accountId?: string; provinceId?: string }): Promise<WorldMapResponse> {
    const provinceId = input.provinceId?.trim() || recommendedBirthProvinceId;
    const province = worldProvinceConfigs.find((item) => item.provinceId === provinceId);

    if (!province) {
      throw new BadRequestException("未知州域");
    }

    const player = input.accountId
      ? await this.prisma.player.findUnique({ where: { accountId: input.accountId } })
      : null;
    const occupations = player
      ? await this.prisma.territoryOccupation.findMany({
          where: { playerId: player.playerId, provinceId, status: "occupied" },
          include: { player: true },
        })
      : [];

    return this.buildMapResponse({
      occupations,
      playerId: player?.playerId ?? null,
      provinceId,
    });
  }

  private buildMapResponse(input: {
    occupations: OccupationWithPlayer[];
    playerId: string | null;
    provinceId: string;
  }): WorldMapResponse {
    const province = worldProvinceConfigs.find((item) => item.provinceId === input.provinceId);

    if (!province) {
      throw new BadRequestException("未知州域");
    }

    const occupationMap = new Map(
      input.occupations.map((occupation) => [occupation.tileId, occupation]),
    );
    const tiles = worldTileConfigs
      .filter((tile) => tile.provinceId === province.provinceId)
      .map((tile) => this.toMapTileState(tile, occupationMap.get(tile.tileId) ?? null));

    return {
      province: this.toProvinceState(province),
      commanderies: province.commanderies.map((commandery) =>
        this.toCommanderyState(
          commandery,
          worldTileConfigs.filter((tile) => tile.commanderyId === commandery.commanderyId).length,
        ),
      ),
      tiles,
      visible_tile_count: tiles.filter((tile) => tile.visibility === "visible").length,
      occupiable_tile_count: tiles.filter((tile) => tile.occupiable).length,
      my_occupations: input.occupations
        .filter((occupation) => occupation.playerId === input.playerId)
        .map((occupation) => this.toOccupationState(occupation)),
      player_city_hint: province.birthAvailable
        ? `${province.name}已开放出生，后续可在新手城址建立主城。`
        : `${province.name}暂不开放出生，可先作为州战目标预览。`,
      config_version: worldConfigVersion,
    };
  }

  private toProvinceState(province: WorldProvinceConfig): WorldProvinceState {
    return {
      province_id: province.provinceId,
      name: province.name,
      theme: province.theme,
      tower_name: province.towerName,
      birth_available: province.birthAvailable,
      recommended_birth: province.recommendedBirth,
      congestion: province.congestion,
      season_state: province.seasonState,
      map_focus: province.mapFocus,
      commanderies: province.commanderies.map((commandery) =>
        this.toCommanderyState(
          commandery,
          worldTileConfigs.filter((tile) => tile.commanderyId === commandery.commanderyId).length,
        ),
      ),
      war_state: this.toProvinceWarState(province),
    };
  }

  private toCommanderyState(
    commandery: WorldCommanderyConfig,
    tileCount: number,
  ): WorldCommanderyState {
    return {
      commandery_id: commandery.commanderyId,
      province_id: commandery.provinceId,
      name: commandery.name,
      terrain: commandery.terrain,
      birth_available: commandery.birthAvailable,
      recommended_birth: commandery.recommendedBirth,
      congestion: commandery.congestion,
      resource_theme: commandery.resourceTheme,
      safety_level: commandery.safetyLevel,
      tile_count: tileCount,
    };
  }

  private toProvinceWarState(province: WorldProvinceConfig): ProvinceWarState {
    return {
      province_id: province.provinceId,
      province_name: province.name,
      season_id: worldSeasonId,
      season_name: worldSeasonName,
      rank: province.warRank,
      score: province.warScore,
      city_occupancy_rate: province.cityOccupancyRate,
      spirit_vein_control_rate: province.spiritVeinControlRate,
      pass_control_count: province.passControlCount,
      tower_state: province.towerState,
      dominant_sect_name: province.dominantSectName,
      daily_settlement_at: "22:00",
      weekly_settlement_at: "周日 22:30",
    };
  }

  private toMapTileState(
    tile: (typeof worldTileConfigs)[number],
    occupation: OccupationWithPlayer | null = null,
  ): MapTileState {
    const province = this.requireProvince(tile.provinceId);
    const commandery = province.commanderies.find(
      (item) => item.commanderyId === tile.commanderyId,
    );

    if (!commandery) {
      throw new BadRequestException("地图郡域配置错误");
    }

    return {
      tile_id: tile.tileId,
      province_id: tile.provinceId,
      province_name: province.name,
      commandery_id: commandery.commanderyId,
      commandery_name: commandery.name,
      tile_type: tile.tileType,
      tile_name: tile.tileName,
      x: tile.x,
      y: tile.y,
      visibility: "visible",
      status: occupation ? "occupied" : tile.status,
      controllable: tile.controllable,
      occupiable: tile.occupiable,
      protected: tile.protected,
      danger_level: tile.dangerLevel,
      travel_seconds: tile.travelSeconds,
      labels: tile.labels,
      state_summary: tile.stateSummary,
      owner: this.toOwnerState(tile.ownerProvinceId, occupation),
      nodes: tile.nodes.map((node) => this.toTerritoryNodeState(node, occupation)),
    };
  }

  private toTerritoryNodeState(
    node: TerritoryNodeConfig,
    occupation: OccupationWithPlayer | null = null,
  ): TerritoryNodeState {
    return {
      node_id: node.nodeId,
      tile_id: node.tileId,
      node_type: node.nodeType,
      node_name: node.nodeName,
      level: node.level,
      status: occupation ? "occupied" : node.status,
      occupiable: node.occupiable,
      contestable: node.contestable,
      protected: node.protected,
      production_summary: node.productionSummary,
      defense_summary: node.defenseSummary,
      owner: this.toOwnerState(node.ownerProvinceId, occupation),
    };
  }

  private toOwnerState(
    ownerProvinceId: string | null,
    occupation: OccupationWithPlayer | null = null,
  ): WorldOwnerState {
    const province = ownerProvinceId
      ? worldProvinceConfigs.find((item) => item.provinceId === ownerProvinceId)
      : null;

    return {
      owner_player_id: occupation?.playerId ?? null,
      owner_player_name: occupation?.player.name ?? null,
      owner_sect_id: null,
      owner_sect_name: null,
      owner_province_id: occupation?.provinceId ?? province?.provinceId ?? null,
      owner_province_name: occupation
        ? this.requireProvince(occupation.provinceId).name
        : (province?.name ?? null),
    };
  }

  private requireProvince(provinceId: string): WorldProvinceConfig {
    const province = worldProvinceConfigs.find((item) => item.provinceId === provinceId);

    if (!province) {
      throw new BadRequestException("未知州域");
    }

    return province;
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

  private toMarchListResponse(
    marches: MarchQueue[],
    cityMap: Map<string, PlayerCity>,
  ): WorldMarchListResponse {
    const states = marches.map((march) => {
      const city = cityMap.get(march.sourceCityId);

      if (!city) {
        throw new BadRequestException("行军来源城池不存在");
      }

      return this.toMarchState(march, city);
    });

    return {
      marches: states,
      active_count: states.filter((march) => march.status === "marching").length,
      config_version: marchConfigVersion,
    };
  }

  private toMarchState(march: MarchQueue, city: PlayerCity): MarchQueueState {
    const province = this.requireProvince(march.provinceId);
    const commandery = province.commanderies.find(
      (item) => item.commanderyId === march.commanderyId,
    );

    if (!commandery) {
      throw new BadRequestException("行军郡域配置错误");
    }

    const status = getComputedMarchStatus(march);
    const remainingSeconds = Math.max(
      0,
      Math.ceil((march.arrivesAt.getTime() - Date.now()) / 1000),
    );

    return {
      march_id: march.marchId,
      source_city_id: city.cityId,
      source_city_name: city.cityName,
      source_tile_id: march.sourceTileId,
      target_tile_id: march.targetTileId,
      target_name: march.targetName,
      province_id: march.provinceId,
      province_name: province.name,
      commandery_id: march.commanderyId,
      commandery_name: commandery.name,
      march_type: normalizeMarchType(march.marchType),
      status,
      team: normalizeTeamSnapshot(march.teamSnapshot),
      travel_seconds: march.travelSeconds,
      remaining_seconds: remainingSeconds,
      started_at: march.startedAt.toISOString(),
      arrives_at: march.arrivesAt.toISOString(),
      resolved_at: march.resolvedAt?.toISOString() ?? null,
      action_hint:
        status === "arrived"
          ? "队伍已抵达，后续可接入清野或占领结算。"
          : "队伍正在行军，抵达后可处理目标地块。",
    };
  }

  private toOccupationState(occupation: OccupationWithPlayer): TerritoryOccupationState {
    const targetTile = requireMapTile(occupation.tileId);
    const province = this.requireProvince(occupation.provinceId);
    const commandery = province.commanderies.find(
      (item) => item.commanderyId === occupation.commanderyId,
    );

    if (!commandery) {
      throw new BadRequestException("占领郡域配置错误");
    }

    return {
      occupation_id: occupation.occupationId,
      tile_id: occupation.tileId,
      node_id: occupation.nodeId,
      tile_name: targetTile.tileName,
      province_id: occupation.provinceId,
      province_name: province.name,
      commandery_id: occupation.commanderyId,
      commandery_name: commandery.name,
      occupation_type: normalizeOccupationType(occupation.occupationType),
      status: normalizeOccupationStatus(occupation.status),
      owner_player_id: occupation.playerId,
      owner_player_name: occupation.player.name,
      production: normalizeProductionSnapshot(occupation.productionSnapshot),
      defense: normalizeOccupationDefenseSnapshot(occupation.defenseSnapshot),
      occupied_at: occupation.occupiedAt.toISOString(),
      updated_at: occupation.updatedAt.toISOString(),
    };
  }
}

function normalizeStartMarchBody(body: StartWorldMarchRequest): Required<StartWorldMarchRequest> {
  const targetTileId = body?.target_tile_id?.trim();
  const sourceCityId = body?.source_city_id?.trim();
  const marchType = body?.march_type ?? "scout";

  if (!targetTileId) {
    throw new BadRequestException("请选择行军目标");
  }

  if (!validMarchTypes.has(marchType)) {
    throw new BadRequestException("未知行军类型");
  }

  return {
    target_tile_id: targetTileId,
    source_city_id: sourceCityId ?? "",
    march_type: marchType,
  };
}

function normalizeOccupyWorldBody(body: OccupyWorldRequest): OccupyWorldRequest {
  const marchId = body?.march_id?.trim();

  if (!marchId) {
    throw new BadRequestException("请选择已抵达的行军队列");
  }

  return { march_id: marchId };
}

function resolveSourceCity(cities: PlayerCity[], sourceCityId: string): PlayerCity {
  const city = sourceCityId
    ? cities.find((item) => item.cityId === sourceCityId)
    : cities.find((item) => item.cityType === "main");

  if (!city) {
    throw new BadRequestException("请先建立主城");
  }

  if (city.status === "besieged") {
    throw new BadRequestException("城池被围困，暂时无法出征");
  }

  return city;
}

function requireMarchTarget(sourceCity: PlayerCity, targetTileId: string): MapTileConfig {
  const targetTile = requireMapTile(targetTileId);

  if (targetTile.provinceId !== sourceCity.provinceId) {
    throw new BadRequestException("R1 阶段暂不开放跨州行军");
  }

  if (targetTile.tileType === "main_city" || targetTile.status === "locked") {
    throw new BadRequestException("该地块暂不可行军");
  }

  if (!targetTile.controllable) {
    throw new BadRequestException("该地块暂不可操作");
  }

  return targetTile;
}

function requireOccupationTarget(targetTileId: string): MapTileConfig {
  const targetTile = requireMapTile(targetTileId);

  if (!targetTile.occupiable || targetTile.protected || targetTile.status === "locked") {
    throw new BadRequestException("该地块暂不可占领");
  }

  if (targetTile.tileType === "main_city" || targetTile.tileType === "capital") {
    throw new BadRequestException("R1 阶段暂不开放占领该目标");
  }

  return targetTile;
}

function requireMapTile(targetTileId: string): MapTileConfig {
  const targetTile = worldTileConfigs.find((tile) => tile.tileId === targetTileId);

  if (!targetTile) {
    throw new BadRequestException("未知目标地块");
  }

  return targetTile;
}

function createTeamSnapshot(city: PlayerCity): Prisma.InputJsonValue {
  return {
    leader_name: `${city.cityName}先锋`,
    soldier_count: 30,
    supply_cost: 12,
    team_power: 120 + city.cityLevel * 20,
  };
}

function getComputedMarchStatus(march: MarchQueue): MarchQueueStatus {
  if (march.status === "resolved" || march.status === "cancelled") {
    return march.status;
  }

  return march.arrivesAt.getTime() <= Date.now() ? "arrived" : "marching";
}

function normalizeMarchType(value: string): MarchType {
  return validMarchTypes.has(value as MarchType) ? (value as MarchType) : "scout";
}

function getOccupationType(tile: MapTileConfig): TerritoryOccupationType {
  if (tile.tileType === "wild") {
    return "wild";
  }

  if (tile.tileType === "resource") {
    return "resource";
  }

  if (tile.tileType === "pass") {
    return "pass";
  }

  if (tile.tileType === "tower") {
    return "tower";
  }

  if (tile.tileType === "capital") {
    return "capital";
  }

  return "vein";
}

function normalizeOccupationType(value: string): TerritoryOccupationType {
  if (
    value === "wild" ||
    value === "resource" ||
    value === "vein" ||
    value === "pass" ||
    value === "capital" ||
    value === "tower"
  ) {
    return value;
  }

  return "wild";
}

function normalizeOccupationStatus(value: string): TerritoryOccupationStatus {
  if (
    value === "occupied" ||
    value === "contested" ||
    value === "protected" ||
    value === "abandoned"
  ) {
    return value;
  }

  return "occupied";
}

function createProductionSnapshot(tile: MapTileConfig): TerritoryProductionSnapshot {
  const base = Math.max(1, tile.dangerLevel);

  if (tile.tileType === "resource") {
    return {
      spirit_stone_per_hour: 18 + base * 2,
      grain_per_hour: 20,
      ore_per_hour: 12 + base,
      wood_per_hour: 8,
      herb_per_hour: 6,
      province_score_per_day: 8 + base,
    };
  }

  return {
    spirit_stone_per_hour: 8 + base,
    grain_per_hour: 12 + base,
    ore_per_hour: 4,
    wood_per_hour: 4,
    herb_per_hour: 4,
    province_score_per_day: 3 + base,
  };
}

function createOccupationDefenseSnapshot(tile: MapTileConfig): TerritoryDefenseSnapshot {
  return {
    guard_power: 80 + tile.dangerLevel * 15,
    stationed_soldiers: 30,
    defense_hint: "先锋队已留下驻守，后续可接入驻防调整。",
  };
}

function normalizeProductionSnapshot(value: Prisma.JsonValue): TerritoryProductionSnapshot {
  const record = isRecord(value) ? value : {};

  return {
    spirit_stone_per_hour: toNumber(record.spirit_stone_per_hour, 0),
    grain_per_hour: toNumber(record.grain_per_hour, 0),
    ore_per_hour: toNumber(record.ore_per_hour, 0),
    wood_per_hour: toNumber(record.wood_per_hour, 0),
    herb_per_hour: toNumber(record.herb_per_hour, 0),
    province_score_per_day: toNumber(record.province_score_per_day, 0),
  };
}

function normalizeOccupationDefenseSnapshot(value: Prisma.JsonValue): TerritoryDefenseSnapshot {
  const record = isRecord(value) ? value : {};

  return {
    guard_power: toNumber(record.guard_power, 0),
    stationed_soldiers: toNumber(record.stationed_soldiers, 0),
    defense_hint: toStringValue(record.defense_hint, "已留下驻守。"),
  };
}

function normalizeTeamSnapshot(value: Prisma.JsonValue) {
  const record = isRecord(value) ? value : {};

  return {
    leader_name: toStringValue(record.leader_name, "主城先锋"),
    soldier_count: toNumber(record.soldier_count, 30),
    team_power: toNumber(record.team_power, 120),
    supply_cost: toNumber(record.supply_cost, 12),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
