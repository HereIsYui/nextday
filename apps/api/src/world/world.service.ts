import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  BattleRoundLog,
  BattleSummary,
  CityDefenseSnapshot,
  CityResourceSnapshot,
  DefendWorldRequest,
  DefendWorldResponse,
  MapTileState,
  MarchQueueState,
  MarchQueueStatus,
  MarchType,
  PlayerCityStatus,
  ProvinceWarState,
  PurchaseWorldBlockRequest,
  PurchaseWorldBlockResponse,
  ResolveWorldClearanceRequest,
  ResolveWorldClearanceResponse,
  StartWorldMarchRequest,
  StartWorldMarchResponse,
  TerritoryBlockState,
  TerritoryNodeState,
  TerritoryOverviewResponse,
  TerritoryTerrainSummaryState,
  WalletSnapshot,
  WorldAtlasCellState,
  WorldAtlasResponse,
  WorldBlockClearanceState,
  WorldCommanderyState,
  WorldMapResponse,
  WorldMapView,
  WorldMapViewportRequest,
  WorldMapViewportState,
  WorldMarchListResponse,
  WorldMiniMapSummary,
  WorldOwnerState,
  WorldProvinceListResponse,
  WorldProvinceState,
} from "@nextday/shared";
import type {
  MarchQueue,
  Player,
  PlayerCity,
  Prisma,
  TerritoryGarrison,
  WorldBlockClearance,
  WorldBlockOwnership,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { toBattleSummary } from "../game/game.mappers";
import { hashRequestBody } from "../platform/utils/hash";
import {
  buildCityExpansionState,
  emptyTerritoryHourlyOutput,
  getTerrainHourlyOutput,
  getTerritoryBlockLimit,
  territoryConfigVersion,
} from "./territory.constants";
import {
  type MapTileConfig,
  type TerritoryNodeConfig,
  type WorldCommanderyConfig,
  type WorldProvinceConfig,
  areAdjacentWorldTiles,
  findWorldTile,
  getWorldTilesByProvince,
  isBirthPlainTile,
  recommendedBirthProvinceId,
  worldConfigVersion,
  worldProvinceConfigs,
  worldSeasonId,
  worldSeasonName,
  type worldTileConfigs,
} from "./world.constants";

const marchConfigVersion = "world_march_r1_001";
const clearanceConfigVersion = "world_clearance_r1_001";
const garrisonConfigVersion = "world_garrison_r1_001";
const validMarchTypes = new Set<MarchType>(["scout", "clear_wild", "reinforce", "siege"]);

type WorldBlockOwnershipWithPlayer = WorldBlockOwnership & { player: Player };
type TerritoryGarrisonWithPlayer = TerritoryGarrison & { player: Player };

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

  async getAtlas(accountId: string): Promise<WorldAtlasResponse> {
    const player = await this.requirePlayer(accountId);
    const [ownerships, marches, cities] = await Promise.all([
      this.prisma.worldBlockOwnership.findMany({ where: { eraId: defaultEraId, status: "owned" } }),
      this.prisma.marchQueue.findMany({ where: { playerId: player.playerId, status: "marching" } }),
      this.prisma.playerCity.findMany({ where: { eraId: defaultEraId } }),
    ]);
    const mine = new Set(
      ownerships.filter((item) => item.playerId === player.playerId).map((item) => item.tileId),
    );
    const owned = new Set(ownerships.map((item) => item.tileId));
    const cityByTile = new Map(cities.map((city) => [city.tileId, city]));
    const marchingTargets = new Set(marches.map((march) => march.targetTileId));
    const layout: Record<string, [number, number]> = {
      // 九州已经在同一块大陆坐标系中分区，Atlas 不再为各州追加偏移。
      ji: [0, 0],
      jing: [0, 0],
      liang: [0, 0],
      qing: [0, 0],
      xu: [0, 0],
      yang: [0, 0],
      yan: [0, 0],
      yong: [0, 0],
      yu: [0, 0],
    };
    const homeProvinceId =
      (
        await this.prisma.playerCity.findFirst({
          where: { playerId: player.playerId, cityType: "main" },
        })
      )?.provinceId ?? null;
    return {
      provinces: worldProvinceConfigs.map((province) => {
        const tiles = getWorldTilesByProvince(province.provinceId);
        const [layoutX, layoutY] = layout[province.provinceId] ?? [0, 0];
        const mapWidth = Math.max(...tiles.map((tile) => tile.x + 1));
        const mapHeight = Math.max(...tiles.map((tile) => tile.y + 1));
        const stepX = Math.max(1, Math.ceil(mapWidth / 6));
        const stepY = Math.max(1, Math.ceil(mapHeight / 6));
        const layoutWidth = Math.ceil(mapWidth / stepX);
        const layoutHeight = Math.ceil(mapHeight / stepY);
        const buckets = new Map<string, typeof tiles>();

        for (const tile of tiles) {
          const x = Math.min(layoutWidth - 1, Math.floor(tile.x / stepX));
          const y = Math.min(layoutHeight - 1, Math.floor(tile.y / stepY));
          const key = `${x}:${y}`;
          buckets.set(key, [...(buckets.get(key) ?? []), tile]);
        }

        const cells: WorldAtlasCellState[] = Array.from(buckets.entries()).map(
          ([key, bucket]): WorldAtlasCellState => {
            const [x, y] = key.split(":").map(Number);
            const landmarkTile = bucket.find(
              (tile) =>
                tile.tileType === "tower" ||
                tile.tileType === "capital" ||
                tile.tileType === "pass",
            );
            const landmark = landmarkTile
              ? landmarkTile.tileType === "tower"
                ? "tower"
                : landmarkTile.tileType === "capital"
                  ? "capital"
                  : "pass"
              : null;

            return {
              x,
              y,
              terrain_type: bucket[0]?.terrainType ?? "plain",
              landmark,
              control: bucket.some((tile) => mine.has(tile.tileId))
                ? "mine"
                : bucket.some((tile) => owned.has(tile.tileId))
                  ? "other"
                  : landmark
                    ? "landmark"
                    : "neutral",
            };
          },
        );
        return {
          province: this.toProvinceState(province),
          layout_x: layoutX,
          layout_y: layoutY,
          layout_width: mapWidth,
          layout_height: mapHeight,
          my_blocks: tiles.filter((tile) => mine.has(tile.tileId)).length,
          neutral_blocks: tiles.filter((tile) => !owned.has(tile.tileId)).length,
          owned_blocks: tiles.filter((tile) => owned.has(tile.tileId)).length,
          player_count: new Set(
            ownerships
              .filter((ownership) => ownership.provinceId === province.provinceId)
              .map((ownership) => ownership.playerId),
          ).size,
          resource_summary:
            province.commanderies[0]?.resourceTheme.slice(0, 2).join("、") ?? "灵材",
          has_active_march: marches.some((march) => march.provinceId === province.provinceId),
          cells,
          terrain_rows: encodeAtlasRows(tiles, mapWidth, mapHeight, (tile) =>
            terrainAtlasCode(tile.terrainType),
          ),
          control_rows: encodeAtlasRows(tiles, mapWidth, mapHeight, (tile) =>
            mine.has(tile.tileId) ? "m" : owned.has(tile.tileId) ? "o" : "n",
          ),
          landmark_rows: encodeAtlasRows(tiles, mapWidth, mapHeight, (tile) =>
            cityByTile.get(tile.tileId)?.cityType === "main"
              ? "h"
              : cityByTile.get(tile.tileId)?.cityType === "sub"
                ? "s"
                : landmarkAtlasCode(tile.tileType),
          ),
          birth_rows: encodeAtlasRows(tiles, mapWidth, mapHeight, (tile) =>
            isBirthPlainTile(tile) ? "b" : ".",
          ),
          march_rows: encodeAtlasRows(tiles, mapWidth, mapHeight, (tile) =>
            marchingTargets.has(tile.tileId) ? "m" : ".",
          ),
        };
      }),
      home_province_id: homeProvinceId,
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

  async getTerritory(accountId: string): Promise<TerritoryOverviewResponse> {
    const player = await this.requirePlayer(accountId);
    const [city, ownerships] = await Promise.all([
      this.prisma.playerCity.findFirst({
        where: { playerId: player.playerId, cityType: "main" },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.worldBlockOwnership.findMany({
        where: { playerId: player.playerId, eraId: defaultEraId, status: "owned" },
        orderBy: { ownedAt: "asc" },
      }),
    ]);

    if (!city) {
      return {
        main_city: null,
        owned_block_count: 0,
        block_limit: 0,
        remaining_block_capacity: 0,
        hourly_output: emptyTerritoryHourlyOutput(),
        terrain_summary: [],
        blocks: [],
        expansion: null,
        next_purchase_hint: "先选择出生州建立主城，再从相邻无主区块开始扩张。",
        config_version: territoryConfigVersion,
      };
    }

    const blocks = ownerships
      .map((ownership) => this.toTerritoryBlockState(ownership))
      .filter((block): block is TerritoryBlockState => Boolean(block));
    const hourlyOutput = emptyTerritoryHourlyOutput();
    const terrainSummary = new Map<
      TerritoryTerrainSummaryState["terrain_type"],
      TerritoryTerrainSummaryState
    >();

    for (const block of blocks) {
      const output = block.hourly_output;
      hourlyOutput.spirit_stone += output.spirit_stone;
      hourlyOutput.grain += output.grain;
      hourlyOutput.ore += output.ore;
      hourlyOutput.wood += output.wood;
      hourlyOutput.herb += output.herb;
      const existing = terrainSummary.get(block.terrain_type) ?? {
        terrain_type: block.terrain_type,
        terrain_label: block.terrain_label,
        block_count: 0,
        hourly_output: emptyTerritoryHourlyOutput(),
      };
      existing.block_count += 1;
      existing.hourly_output.spirit_stone += output.spirit_stone;
      existing.hourly_output.grain += output.grain;
      existing.hourly_output.ore += output.ore;
      existing.hourly_output.wood += output.wood;
      existing.hourly_output.herb += output.herb;
      terrainSummary.set(block.terrain_type, existing);
    }

    const expansion = buildCityExpansionState({
      cityLevel: city.cityLevel,
      ownedPlainBlocks: blocks.filter((block) => block.terrain_type === "plain").length,
      resources: normalizeCityResources(city.resourceSnapshot),
    });
    const blockLimit = getTerritoryBlockLimit(city.cityLevel);
    const remainingBlockCapacity = Math.max(0, blockLimit - blocks.length);

    return {
      main_city: this.toCityState(city),
      owned_block_count: blocks.length,
      block_limit: blockLimit,
      remaining_block_capacity: remainingBlockCapacity,
      hourly_output: hourlyOutput,
      terrain_summary: [...terrainSummary.values()].sort(
        (left, right) => right.block_count - left.block_count,
      ),
      blocks,
      expansion,
      next_purchase_hint:
        remainingBlockCapacity <= 0
          ? "领地已达当前上限，先扩建主城以容纳更多区块。"
          : expansion.owned_plain_blocks < expansion.required_plain_blocks
            ? "优先购买相邻平原，为主城扩建补足地基。"
            : "可按当前缺口购买相邻资源地，继续完善领地产出。",
      config_version: territoryConfigVersion,
    };
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
      if (normalizedBody.march_type === "clear_wild") {
        await assertClearanceMarchTarget(tx, player.playerId, targetTile);
      }
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

  async resolveClearance(input: {
    accountId: string;
    body: ResolveWorldClearanceRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<ResolveWorldClearanceResponse> {
    const normalizedBody = normalizeResolveWorldClearanceBody(input.body);
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
      return existingRecord.responseData as unknown as ResolveWorldClearanceResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) {
        throw new BadRequestException("请先创建角色");
      }
      const march = await tx.marchQueue.findUnique({
        where: { marchId: normalizedBody.march_id },
      });
      if (!march || march.playerId !== player.playerId) {
        throw new BadRequestException("清野行军不存在");
      }
      if (march.marchType !== "clear_wild") {
        throw new BadRequestException("该行军不能进行清野结算");
      }
      if (march.status === "resolved" || march.resolvedAt) {
        throw new BadRequestException("该清野行军已处理");
      }
      if (getComputedMarchStatus(march) !== "arrived") {
        throw new BadRequestException("清野队伍尚未抵达");
      }

      const targetTile = requireMapTile(march.targetTileId);
      if (!requiresWorldClearance(targetTile)) {
        throw new BadRequestException("该区块无需清野");
      }
      const existingOwner = await tx.worldBlockOwnership.findUnique({
        where: { eraId_tileId: { eraId: defaultEraId, tileId: targetTile.tileId } },
      });
      if (existingOwner) {
        throw new BadRequestException("该区块已有归属，无需继续清野");
      }
      const sourceCity = await tx.playerCity.findUnique({
        where: { cityId: march.sourceCityId },
      });
      if (!sourceCity) {
        throw new BadRequestException("行军来源城池不存在");
      }

      const team = normalizeTeamSnapshot(march.teamSnapshot);
      const enemyPower = 60 + targetTile.dangerLevel * 20;
      const cleared = team.team_power >= enemyPower;
      const enemyName = `${targetTile.tileName}守域妖兽`;
      const damageDone = cleared ? enemyPower + 10 : team.team_power;
      const damageTaken = cleared ? Math.max(10, Math.floor(enemyPower / 3)) : enemyPower;
      const battleLog = createWorldClearanceBattleLog({
        cityName: sourceCity.cityName,
        cleared,
        damageDone,
        damageTaken,
        enemyName,
      });
      const battle = await tx.battleLog.create({
        data: {
          battleId: `battle_world_clearance_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          battleType: "world_clearance",
          provinceId: targetTile.provinceId,
          enemyId: `world_guard_${targetTile.terrainType}_${targetTile.dangerLevel}`,
          enemyName,
          result: cleared ? "win" : "lose",
          rounds: battleLog.length,
          damageDone,
          damageTaken,
          rewardSnapshot: {} as Prisma.InputJsonValue,
          battleLog: battleLog as unknown as Prisma.InputJsonValue,
        },
      });
      const clearance = await tx.worldBlockClearance.create({
        data: {
          clearanceId: `clearance_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          sourceMarchId: march.marchId,
          tileId: targetTile.tileId,
          provinceId: targetTile.provinceId,
          commanderyId: targetTile.commanderyId,
          status: cleared ? "cleared" : "failed",
          teamPower: team.team_power,
          enemyPower,
          battleId: battle.battleId,
          idempotencyKey: input.idempotencyKey,
          configVersion: clearanceConfigVersion,
        },
      });
      const updatedMarch = await tx.marchQueue.update({
        where: { marchId: march.marchId },
        data: { resolvedAt: new Date(), status: "resolved" },
      });
      const provinceTileIds = getWorldTilesByProvince(targetTile.provinceId).map(
        (tile) => tile.tileId,
      );
      const [ownerships, garrisons, clearances, marches, cities] = await Promise.all([
        tx.worldBlockOwnership.findMany({
          where: { eraId: defaultEraId, provinceId: targetTile.provinceId, status: "owned" },
          include: { player: true },
        }),
        tx.territoryGarrison.findMany({
          where: { eraId: defaultEraId, tileId: { in: provinceTileIds } },
          include: { player: true },
        }),
        tx.worldBlockClearance.findMany({
          where: { playerId: player.playerId, eraId: defaultEraId, status: "cleared" },
        }),
        tx.marchQueue.findMany({
          where: { playerId: player.playerId },
          orderBy: [{ createdAt: "desc" }],
          take: 20,
        }),
        tx.playerCity.findMany({ where: { playerId: player.playerId } }),
      ]);
      const cityMap = new Map(cities.map((city) => [city.cityId, city]));
      const responseData: ResolveWorldClearanceResponse = {
        record_id: `resolve_clearance_${randomUUID()}`,
        cleared,
        clearance: this.toClearanceState(clearance),
        battle: toBattleSummary(battle),
        march: this.toMarchState(updatedMarch, sourceCity),
        marches: this.toMarchListResponse(marches, cityMap),
        map: this.buildMapResponse({
          clearedTileIds: new Set(clearances.map((item) => item.tileId)),
          garrisons,
          ownerships,
          playerId: player.playerId,
          provinceId: targetTile.provinceId,
          view: "detail",
          viewport: viewportAroundTile(targetTile),
        }),
      };

      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "world_clearance_resolve",
          targetType: "map_tile",
          targetId: targetTile.tileId,
          afterSnapshot: responseData.clearance as unknown as Prisma.InputJsonValue,
          reason: cleared ? "清野成功，解锁个人购买资格" : "清野失败，未获得购买资格",
          idempotencyKey: input.idempotencyKey,
          configVersion: clearanceConfigVersion,
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

  async defend(input: {
    accountId: string;
    body: DefendWorldRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<DefendWorldResponse> {
    const tileId = input.body.tile_id?.trim();
    const targetSoldierCount = Math.floor(input.body.soldier_count);
    if (!tileId || !Number.isFinite(targetSoldierCount) || targetSoldierCount < 0) {
      throw new BadRequestException("请选择领地并填写不小于零的驻军数量");
    }
    const normalizedBody: DefendWorldRequest = {
      tile_id: tileId,
      soldier_count: targetSoldierCount,
    };
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
      return existingRecord.responseData as unknown as DefendWorldResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) {
        throw new BadRequestException("请先创建角色");
      }
      const city = await tx.playerCity.findFirst({
        where: { playerId: player.playerId, cityType: "main" },
      });
      if (!city) {
        throw new BadRequestException("请先建立主城");
      }
      const ownership = await tx.worldBlockOwnership.findUnique({
        where: { eraId_tileId: { eraId: defaultEraId, tileId } },
      });
      if (!ownership || ownership.playerId !== player.playerId) {
        throw new BadRequestException("只能驻防自己的领地");
      }
      const resources = normalizeCityResources(city.resourceSnapshot);
      const availableSoldiers = Number(resources.soldier);
      const current = await tx.territoryGarrison.findUnique({
        where: { eraId_tileId: { eraId: defaultEraId, tileId } },
      });
      if (current && current.playerId !== player.playerId) {
        throw new BadRequestException("驻防归属异常，请刷新地图后重试");
      }
      const currentSoldierCount = current?.soldierCount ?? 0;
      const soldierDelta = targetSoldierCount - currentSoldierCount;
      if (soldierDelta > 0 && availableSoldiers < soldierDelta) {
        throw new BadRequestException("主城道兵不足");
      }
      const garrison =
        targetSoldierCount === 0
          ? current
            ? await tx.territoryGarrison.delete({ where: { garrisonId: current.garrisonId } })
            : null
          : await tx.territoryGarrison.upsert({
              where: { eraId_tileId: { eraId: defaultEraId, tileId } },
              create: {
                garrisonId: `garrison_${randomUUID()}`,
                playerId: player.playerId,
                eraId: defaultEraId,
                tileId,
                sourceCityId: city.cityId,
                soldierCount: targetSoldierCount,
                defensePower: targetSoldierCount * 2,
              },
              update: {
                soldierCount: targetSoldierCount,
                defensePower: targetSoldierCount * 2,
                sourceCityId: city.cityId,
              },
            });
      const updatedCity = await tx.playerCity.update({
        where: { cityId: city.cityId },
        data: {
          resourceSnapshot: {
            ...resources,
            soldier: String(availableSoldiers - soldierDelta),
          } as Prisma.InputJsonValue,
        },
      });
      const provinceId = ownership.provinceId;
      const [ownerships, garrisons, clearances] = await Promise.all([
        tx.worldBlockOwnership.findMany({
          where: { eraId: defaultEraId, provinceId, status: "owned" },
          include: { player: true },
        }),
        tx.territoryGarrison.findMany({
          where: {
            eraId: defaultEraId,
            tileId: { in: getWorldTilesByProvince(provinceId).map((tile) => tile.tileId) },
          },
          include: { player: true },
        }),
        tx.worldBlockClearance.findMany({
          where: { playerId: player.playerId, eraId: defaultEraId, status: "cleared" },
        }),
      ]);
      const cityState = this.toCityState(updatedCity);
      if (!cityState) {
        throw new BadRequestException("主城状态读取失败");
      }
      const responseData: DefendWorldResponse = {
        record_id: `defend_${randomUUID()}`,
        operation: resolveGarrisonOperation(currentSoldierCount, targetSoldierCount),
        target_soldier_count: targetSoldierCount,
        garrison:
          targetSoldierCount > 0 && garrison
            ? this.toGarrisonState(garrison, player.playerId)
            : null,
        city: cityState,
        map: this.buildMapResponse({
          clearedTileIds: new Set(clearances.map((item) => item.tileId)),
          garrisons,
          ownerships,
          playerId: player.playerId,
          provinceId,
          view: "detail",
          viewport: viewportAroundTile(requireMapTile(tileId)),
        }),
      };

      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "world_defend_tile",
          targetType: "map_tile",
          targetId: tileId,
          afterSnapshot: responseData.garrison as unknown as Prisma.InputJsonValue,
          reason:
            targetSoldierCount === 0
              ? "九州领地撤回驻军"
              : soldierDelta > 0
                ? "九州领地增加驻军"
                : soldierDelta < 0
                  ? "九州领地撤回部分驻军"
                  : "九州领地确认驻军配置",
          idempotencyKey: input.idempotencyKey,
          configVersion: garrisonConfigVersion,
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

  async purchaseBlock(input: {
    accountId: string;
    body: PurchaseWorldBlockRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<PurchaseWorldBlockResponse> {
    const normalizedBody = normalizePurchaseWorldBlockBody(input.body);
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

      return existingRecord.responseData as unknown as PurchaseWorldBlockResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({
        where: { accountId: input.accountId },
      });

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

      const targetTile = requireMapTile(normalizedBody.tile_id);
      if (targetTile.provinceId !== city.provinceId) {
        throw new BadRequestException("R1 阶段暂不开放跨州购买区块");
      }
      assertPurchasableTile(targetTile);

      const existingOwner = await tx.worldBlockOwnership.findUnique({
        where: { eraId_tileId: { eraId: defaultEraId, tileId: targetTile.tileId } },
      });
      if (existingOwner) {
        throw new BadRequestException(
          existingOwner.playerId === player.playerId ? "你已经拥有该区块" : "该区块已有归属",
        );
      }

      const myOwnerships = await tx.worldBlockOwnership.findMany({
        where: { playerId: player.playerId, eraId: defaultEraId, status: "owned" },
      });
      if (myOwnerships.length >= getTerritoryBlockLimit(city.cityLevel)) {
        throw new BadRequestException("领地已达当前主城上限，扩建主城后再购买新区块");
      }
      const adjacentOwned = myOwnerships.some((ownership) => {
        const ownedTile = findWorldTile(ownership.tileId);
        return ownedTile ? areAdjacentWorldTiles(ownedTile, targetTile) : false;
      });

      if (!adjacentOwned) {
        throw new BadRequestException("只能购买与已有领地相邻的无主区块");
      }
      if (requiresWorldClearance(targetTile)) {
        const clearance = await tx.worldBlockClearance.findFirst({
          where: {
            playerId: player.playerId,
            eraId: defaultEraId,
            tileId: targetTile.tileId,
            status: "cleared",
          },
        });
        if (!clearance) {
          throw new BadRequestException("该区块仍有野怪驻守，请先完成清野");
        }
      }

      const cost = BigInt(targetTile.purchaseBaseCost);
      const wallet = await tx.playerWallet.findUniqueOrThrow({
        where: { playerId: player.playerId },
      });
      if (wallet.spiritStone < cost) {
        throw new BadRequestException("灵石不足，无法购买区块");
      }

      await tx.playerWallet.update({
        where: { playerId: player.playerId },
        data: { spiritStone: { decrement: cost } },
      });
      await tx.walletLog.create({
        data: {
          logId: `wallet_${randomUUID()}`,
          playerId: player.playerId,
          currencyType: "spirit_stone",
          changeAmount: -cost,
          beforeAmount: wallet.spiritStone,
          afterAmount: wallet.spiritStone - cost,
          sourceType: "world_block_purchase",
          sourceId: targetTile.tileId,
          idempotencyKey: `${input.idempotencyKey}:spirit_stone`,
        },
      });

      const ownership = await tx.worldBlockOwnership.create({
        data: {
          ownershipId: `block_owner_${randomUUID()}`,
          playerId: player.playerId,
          eraId: defaultEraId,
          tileId: targetTile.tileId,
          provinceId: targetTile.provinceId,
          commanderyId: targetTile.commanderyId,
          terrainType: targetTile.terrainType,
          ownershipType: "purchase",
          status: "owned",
          sourceType: "purchase",
          sourceId: targetTile.tileId,
          purchaseCost: cost,
          idempotencyKey: input.idempotencyKey,
          configVersion: worldConfigVersion,
        },
        include: { player: true },
      });
      const [ownerships, garrisons, clearances, updatedWallet] = await Promise.all([
        tx.worldBlockOwnership.findMany({
          where: { eraId: defaultEraId, provinceId: targetTile.provinceId, status: "owned" },
          include: { player: true },
        }),
        tx.territoryGarrison.findMany({
          where: {
            eraId: defaultEraId,
            tileId: {
              in: getWorldTilesByProvince(targetTile.provinceId).map((tile) => tile.tileId),
            },
          },
          include: { player: true },
        }),
        tx.worldBlockClearance.findMany({
          where: { playerId: player.playerId, eraId: defaultEraId, status: "cleared" },
        }),
        tx.playerWallet.findUniqueOrThrow({ where: { playerId: player.playerId } }),
      ]);
      const map = this.buildMapResponse({
        clearedTileIds: new Set(clearances.map((item) => item.tileId)),
        garrisons,
        ownerships,
        playerId: player.playerId,
        provinceId: targetTile.provinceId,
        view: "detail",
        viewport: viewportAroundTile(targetTile),
      });
      const responseData: PurchaseWorldBlockResponse = {
        record_id: `purchase_block_${randomUUID()}`,
        tile:
          map.tiles.find((tile) => tile.tile_id === ownership.tileId) ??
          this.toMapTileState(
            targetTile,
            ownership,
            null,
            mapPurchaseContext(
              ownerships,
              player.playerId,
              new Set(clearances.map((item) => item.tileId)),
            ),
          ),
        map,
        wallet: this.toWalletSnapshot(updatedWallet),
      };

      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "world_block_purchase",
          targetType: "map_tile",
          targetId: targetTile.tileId,
          afterSnapshot: responseData.tile as unknown as Prisma.InputJsonValue,
          reason: "九州城池纪元购买相邻区块",
          idempotencyKey: input.idempotencyKey,
          configVersion: worldConfigVersion,
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

  async getMap(input: {
    accountId?: string;
    provinceId?: string;
    view?: WorldMapView;
    viewport?: WorldMapViewportRequest;
  }): Promise<WorldMapResponse> {
    const provinceId = input.provinceId?.trim() || recommendedBirthProvinceId;
    const province = worldProvinceConfigs.find((item) => item.provinceId === provinceId);

    if (!province) {
      throw new BadRequestException("未知州域");
    }

    const player = input.accountId
      ? await this.prisma.player.findUnique({ where: { accountId: input.accountId } })
      : null;
    const provinceTileIds = getWorldTilesByProvince(provinceId).map((tile) => tile.tileId);
    const [ownerships, garrisons, clearances] = await Promise.all([
      this.prisma.worldBlockOwnership.findMany({
        where: { eraId: defaultEraId, provinceId, status: "owned" },
        include: { player: true },
      }),
      this.prisma.territoryGarrison.findMany({
        where: { eraId: defaultEraId, tileId: { in: provinceTileIds } },
        include: { player: true },
      }),
      player
        ? this.prisma.worldBlockClearance.findMany({
            where: { playerId: player.playerId, eraId: defaultEraId, status: "cleared" },
          })
        : Promise.resolve([]),
    ]);

    return this.buildMapResponse({
      clearedTileIds: new Set(clearances.map((item) => item.tileId)),
      garrisons,
      ownerships,
      playerId: player?.playerId ?? null,
      provinceId,
      view: normalizeWorldMapView(input.view),
      viewport: input.viewport,
    });
  }

  private buildMapResponse(input: {
    clearedTileIds?: Set<string>;
    garrisons: TerritoryGarrisonWithPlayer[];
    ownerships: WorldBlockOwnershipWithPlayer[];
    playerId: string | null;
    provinceId: string;
    view: WorldMapView;
    viewport?: WorldMapViewportRequest;
  }): WorldMapResponse {
    const province = worldProvinceConfigs.find((item) => item.provinceId === input.provinceId);

    if (!province) {
      throw new BadRequestException("未知州域");
    }

    const garrisonMap = new Map(input.garrisons.map((garrison) => [garrison.tileId, garrison]));
    const ownershipMap = new Map(
      input.ownerships.map((ownership) => [ownership.tileId, ownership]),
    );
    const purchaseContext = mapPurchaseContext(
      input.ownerships,
      input.playerId,
      input.clearedTileIds,
    );
    const provinceTiles = getWorldTilesByProvince(province.provinceId);
    const viewport = normalizeMapViewport(input.viewport, provinceTiles);
    const tiles = provinceTiles
      .filter((tile) => isTileInViewport(tile, viewport))
      .map((tile) =>
        this.toMapTileState(
          tile,
          ownershipMap.get(tile.tileId) ?? null,
          garrisonMap.get(tile.tileId) ?? null,
          purchaseContext,
        ),
      );
    const miniMapSummary = buildMiniMapSummary({
      ownerships: input.ownerships,
      playerId: input.playerId,
      province,
      tiles: provinceTiles,
    });

    return {
      view: input.view,
      province: this.toProvinceState(province),
      commanderies: province.commanderies.map((commandery) =>
        this.toCommanderyState(
          commandery,
          provinceTiles.filter((tile) => tile.commanderyId === commandery.commanderyId).length,
        ),
      ),
      tiles,
      block_count: provinceTiles.length,
      viewport,
      mini_map_summary: miniMapSummary,
      visible_tile_count: tiles.filter((tile) => tile.visibility === "visible").length,
      occupiable_tile_count: tiles.filter((tile) => tile.occupiable).length,
      player_city_hint: province.birthAvailable
        ? `${province.name}已开放出生，系统会从安全平原无主区块中随机建立主城。`
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
      block_count: province.blockCount,
      tower_block_count: province.towerBlockCount,
      birth_plain_count: getWorldTilesByProvince(province.provinceId).filter(isBirthPlainTile)
        .length,
      commanderies: province.commanderies.map((commandery) =>
        this.toCommanderyState(
          commandery,
          getWorldTilesByProvince(province.provinceId).filter(
            (tile) => tile.commanderyId === commandery.commanderyId,
          ).length,
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
      birth_plain_count: getWorldTilesByProvince(commandery.provinceId).filter(
        (tile) => tile.commanderyId === commandery.commanderyId && isBirthPlainTile(tile),
      ).length,
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
    ownership: WorldBlockOwnershipWithPlayer | null = null,
    garrison: TerritoryGarrisonWithPlayer | null = null,
    purchaseContext: PurchaseContext = emptyPurchaseContext,
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
      terrain_type: tile.terrainType,
      terrain_label: tile.terrainLabel,
      terrain_effects: tile.terrainEffects,
      landmark_group_id: tile.landmarkGroupId,
      tile_name: tile.tileName,
      x: tile.x,
      y: tile.y,
      visibility: "visible",
      status: ownership ? "occupied" : tile.status,
      controllable: tile.controllable,
      occupiable: tile.occupiable,
      protected: tile.protected,
      danger_level: tile.dangerLevel,
      travel_seconds: tile.travelSeconds,
      labels: tile.labels,
      state_summary: tile.stateSummary,
      owner: this.toOwnerState(tile.ownerProvinceId, ownership),
      ownership: this.toBlockOwnershipState(ownership),
      garrison: garrison ? this.toGarrisonState(garrison, purchaseContext.playerId) : null,
      purchase_state: buildPurchaseState(tile, ownership, purchaseContext),
      nodes: tile.nodes.map((node) => this.toTerritoryNodeState(node, ownership)),
    };
  }

  private toTerritoryNodeState(
    node: TerritoryNodeConfig,
    ownership: WorldBlockOwnershipWithPlayer | null = null,
  ): TerritoryNodeState {
    return {
      node_id: node.nodeId,
      tile_id: node.tileId,
      node_type: node.nodeType,
      node_name: node.nodeName,
      level: node.level,
      status: ownership ? "occupied" : node.status,
      occupiable: node.occupiable,
      contestable: node.contestable,
      protected: node.protected,
      production_summary: node.productionSummary,
      defense_summary: node.defenseSummary,
      owner: this.toOwnerState(node.ownerProvinceId, ownership),
    };
  }

  private toOwnerState(
    ownerProvinceId: string | null,
    ownership: WorldBlockOwnershipWithPlayer | null = null,
  ): WorldOwnerState {
    const province = ownerProvinceId
      ? worldProvinceConfigs.find((item) => item.provinceId === ownerProvinceId)
      : null;

    return {
      owner_player_id: ownership?.playerId ?? null,
      owner_player_name: ownership?.player.name ?? null,
      owner_sect_id: null,
      owner_sect_name: null,
      owner_province_id: ownership?.provinceId ?? province?.provinceId ?? null,
      owner_province_name: ownership
        ? this.requireProvince(ownership.provinceId).name
        : (province?.name ?? null),
    };
  }

  private toBlockOwnershipState(
    ownership: WorldBlockOwnershipWithPlayer | null,
  ): MapTileState["ownership"] {
    return {
      ownership_id: ownership?.ownershipId ?? null,
      owner_player_id: ownership?.playerId ?? null,
      owner_player_name: ownership?.player.name ?? null,
      ownership_type: ownership ? normalizeOwnershipType(ownership.ownershipType) : null,
      owned_at: ownership?.ownedAt.toISOString() ?? null,
    };
  }

  private toGarrisonState(
    garrison: TerritoryGarrison,
    playerId: string | null,
  ): MapTileState["garrison"] {
    return {
      tile_id: garrison.tileId,
      owner_player_id: garrison.playerId,
      soldier_count: garrison.soldierCount,
      defense_power: garrison.defensePower,
      is_mine: garrison.playerId === playerId,
      updated_at: garrison.updatedAt.toISOString(),
    };
  }

  private toClearanceState(clearance: WorldBlockClearance): WorldBlockClearanceState {
    return {
      clearance_id: clearance.clearanceId,
      tile_id: clearance.tileId,
      province_id: clearance.provinceId,
      commandery_id: clearance.commanderyId,
      status: clearance.status === "cleared" ? "cleared" : "failed",
      team_power: clearance.teamPower,
      enemy_power: clearance.enemyPower,
      battle_id: clearance.battleId,
      resolved_at: clearance.resolvedAt.toISOString(),
    };
  }

  private toTerritoryBlockState(ownership: WorldBlockOwnership): TerritoryBlockState | null {
    const tile = findWorldTile(ownership.tileId);
    if (!tile) {
      return null;
    }
    const province = this.requireProvince(tile.provinceId);
    const commandery = province.commanderies.find(
      (item) => item.commanderyId === tile.commanderyId,
    );
    if (!commandery) {
      return null;
    }

    return {
      tile_id: tile.tileId,
      tile_name: tile.tileName,
      province_id: province.provinceId,
      province_name: province.name,
      commandery_id: commandery.commanderyId,
      commandery_name: commandery.name,
      terrain_type: tile.terrainType,
      terrain_label: tile.terrainLabel,
      ownership_type: normalizeOwnershipType(ownership.ownershipType),
      owned_at: ownership.ownedAt.toISOString(),
      hourly_output: getTerrainHourlyOutput(tile.terrainType),
      city_expansion_eligible: tile.terrainType === "plain",
    };
  }

  private toCityState(city: PlayerCity): TerritoryOverviewResponse["main_city"] {
    const province = this.requireProvince(city.provinceId);
    const commandery = province.commanderies.find(
      (item) => item.commanderyId === city.commanderyId,
    );
    if (!commandery) {
      throw new BadRequestException("主城郡域配置错误");
    }
    const defense = normalizeCityDefense(city.defenseSnapshot);

    return {
      city_id: city.cityId,
      city_type: city.cityType === "sub" ? "sub" : "main",
      province_id: province.provinceId,
      province_name: province.name,
      commandery_id: commandery.commanderyId,
      commandery_name: commandery.name,
      tile_id: city.tileId,
      city_name: city.cityName,
      city_level: city.cityLevel,
      status: normalizeCityStatus(city.status),
      protection_until: city.protectionUntil?.toISOString() ?? null,
      owner_sect_id: city.ownerSectId,
      defense,
      resources: normalizeCityResources(city.resourceSnapshot),
      created_at: city.createdAt.toISOString(),
      updated_at: city.updatedAt.toISOString(),
    };
  }

  private toWalletSnapshot(wallet: {
    playerId: string;
    spiritStone: bigint;
    immortalStone: bigint;
    jadePaid: bigint;
    jadeBound: bigint;
    eraPoint: bigint;
  }): WalletSnapshot {
    return {
      player_id: wallet.playerId,
      spirit_stone: wallet.spiritStone.toString(),
      immortal_stone: wallet.immortalStone.toString(),
      jade_paid: wallet.jadePaid.toString(),
      jade_bound: wallet.jadeBound.toString(),
      era_point: wallet.eraPoint.toString(),
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
          ? march.marchType === "clear_wild"
            ? "队伍已抵达，清野只解除危险，土地仍需另行购买。"
            : "队伍已抵达，可以查看目标地块情报。"
          : "队伍正在行军，抵达后可处理目标地块。",
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

function normalizePurchaseWorldBlockBody(
  body: PurchaseWorldBlockRequest,
): PurchaseWorldBlockRequest {
  const tileId = body?.tile_id?.trim();

  if (!tileId) {
    throw new BadRequestException("请选择要购买的区块");
  }

  return { tile_id: tileId };
}

function normalizeResolveWorldClearanceBody(
  body: ResolveWorldClearanceRequest,
): ResolveWorldClearanceRequest {
  const marchId = body?.march_id?.trim();
  if (!marchId) {
    throw new BadRequestException("请选择已抵达的清野行军");
  }
  return { march_id: marchId };
}

function normalizeWorldMapView(view: WorldMapView | undefined): WorldMapView {
  return view === "mini" ? "mini" : "detail";
}

function normalizeMapViewport(
  request: WorldMapViewportRequest | undefined,
  tiles: MapTileConfig[],
): WorldMapViewportState {
  const totalWidth = Math.max(...tiles.map((tile) => tile.x + 1));
  const totalHeight = Math.max(...tiles.map((tile) => tile.y + 1));
  const x = clampViewportCoordinate(request?.x, totalWidth - 1);
  const y = clampViewportCoordinate(request?.y, totalHeight - 1);
  const width = clampViewportSize(request?.width, totalWidth, totalWidth - x);
  const height = clampViewportSize(request?.height, totalHeight, totalHeight - y);
  return {
    x,
    y,
    width,
    height,
    total_width: totalWidth,
    total_height: totalHeight,
  };
}

function viewportAroundTile(tile: MapTileConfig): WorldMapViewportRequest {
  return {
    height: 12,
    width: 12,
    x: Math.max(0, tile.x - 6),
    y: Math.max(0, tile.y - 6),
  };
}

function clampViewportCoordinate(value: number | undefined, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(maximum, Math.floor(value)));
}

function clampViewportSize(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return Math.max(1, fallback);
  }
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

function isTileInViewport(tile: MapTileConfig, viewport: WorldMapViewportState): boolean {
  return (
    tile.x >= viewport.x &&
    tile.x < viewport.x + viewport.width &&
    tile.y >= viewport.y &&
    tile.y < viewport.y + viewport.height
  );
}

function encodeAtlasRows(
  tiles: MapTileConfig[],
  width: number,
  height: number,
  encode: (tile: MapTileConfig) => string,
): string[] {
  const tileMap = new Map(tiles.map((tile) => [`${tile.x}:${tile.y}`, tile]));
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const tile = tileMap.get(`${x}:${y}`);
      return tile ? encode(tile) : ".";
    }).join(""),
  );
}

function terrainAtlasCode(terrain: MapTileConfig["terrainType"]): string {
  const codes: Record<MapTileConfig["terrainType"], string> = {
    desert: "d",
    forest: "f",
    mountain: "m",
    plain: "p",
    swamp: "s",
  };
  return codes[terrain];
}

function landmarkAtlasCode(tileType: MapTileConfig["tileType"]): string {
  if (tileType === "tower") return "t";
  if (tileType === "capital") return "c";
  if (tileType === "pass") return "p";
  return ".";
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

function assertPurchasableTile(tile: MapTileConfig) {
  if (
    !tile.controllable ||
    tile.protected ||
    tile.status === "locked" ||
    tile.ownerProvinceId ||
    tile.purchaseBaseCost <= 0
  ) {
    throw new BadRequestException("该区块暂不可购买");
  }

  if (tile.tileType === "tower" || tile.tileType === "capital" || tile.tileType === "pass") {
    throw new BadRequestException("战略区块暂不可购买");
  }
}

function requireMapTile(targetTileId: string): MapTileConfig {
  const targetTile = findWorldTile(targetTileId);

  if (!targetTile) {
    throw new BadRequestException("未知目标地块");
  }

  return targetTile;
}

function requiresWorldClearance(tile: MapTileConfig): boolean {
  return (
    tile.dangerLevel > 1 &&
    tile.ownerProvinceId === null &&
    tile.tileType !== "tower" &&
    tile.tileType !== "capital" &&
    tile.tileType !== "pass"
  );
}

async function assertClearanceMarchTarget(
  tx: Prisma.TransactionClient,
  playerId: string,
  tile: MapTileConfig,
): Promise<void> {
  assertPurchasableTile(tile);
  if (!requiresWorldClearance(tile)) {
    throw new BadRequestException("该区块没有需要清理的野怪");
  }
  const [owner, ownerships, clearance] = await Promise.all([
    tx.worldBlockOwnership.findUnique({
      where: { eraId_tileId: { eraId: defaultEraId, tileId: tile.tileId } },
    }),
    tx.worldBlockOwnership.findMany({
      where: { playerId, eraId: defaultEraId, status: "owned" },
    }),
    tx.worldBlockClearance.findFirst({
      where: { playerId, eraId: defaultEraId, tileId: tile.tileId, status: "cleared" },
    }),
  ]);
  if (owner) {
    throw new BadRequestException("该区块已有归属");
  }
  if (clearance) {
    throw new BadRequestException("该区块已经清理，可以直接购买");
  }
  const adjacentOwned = ownerships.some((ownership) => {
    const ownedTile = findWorldTile(ownership.tileId);
    return ownedTile ? areAdjacentWorldTiles(ownedTile, tile) : false;
  });
  if (!adjacentOwned) {
    throw new BadRequestException("只能清理与已有领地相邻的区块");
  }
}

interface PurchaseContext {
  clearedTileIds: Set<string>;
  playerId: string | null;
  myOwnedTiles: MapTileConfig[];
}

const emptyPurchaseContext: PurchaseContext = {
  clearedTileIds: new Set(),
  playerId: null,
  myOwnedTiles: [],
};

function mapPurchaseContext(
  ownerships: WorldBlockOwnershipWithPlayer[],
  playerId: string | null,
  clearedTileIds: Set<string> = new Set(),
): PurchaseContext {
  if (!playerId) {
    return emptyPurchaseContext;
  }

  return {
    clearedTileIds,
    playerId,
    myOwnedTiles: ownerships
      .filter((ownership) => ownership.playerId === playerId)
      .map((ownership) => findWorldTile(ownership.tileId))
      .filter((tile): tile is MapTileConfig => Boolean(tile)),
  };
}

function buildPurchaseState(
  tile: MapTileConfig,
  ownership: WorldBlockOwnershipWithPlayer | null,
  context: PurchaseContext,
): MapTileState["purchase_state"] {
  const cost = tile.purchaseBaseCost.toString();
  const requiresClearance = requiresWorldClearance(tile);
  const clearanceStatus: MapTileState["purchase_state"]["clearance_status"] = !requiresClearance
    ? "not_required"
    : context.clearedTileIds.has(tile.tileId)
      ? "cleared"
      : "required";

  if (!context.playerId) {
    return {
      clearance_status: clearanceStatus,
      purchasable: false,
      reason: "请先创建角色并建立主城",
      cost_spirit_stone: cost,
      adjacent_owned: false,
      requires_clearance: requiresClearance,
    };
  }

  if (ownership) {
    return {
      clearance_status: clearanceStatus,
      purchasable: false,
      reason: ownership.playerId === context.playerId ? "已归你所有" : "已有城主",
      cost_spirit_stone: cost,
      adjacent_owned: false,
      requires_clearance: requiresClearance,
    };
  }

  if (context.myOwnedTiles.length === 0) {
    return {
      clearance_status: clearanceStatus,
      purchasable: false,
      reason: "请先建立主城",
      cost_spirit_stone: cost,
      adjacent_owned: false,
      requires_clearance: requiresClearance,
    };
  }

  const adjacentOwned = context.myOwnedTiles.some((ownedTile) =>
    areAdjacentWorldTiles(ownedTile, tile),
  );

  if (
    !tile.controllable ||
    tile.protected ||
    tile.status === "locked" ||
    tile.ownerProvinceId ||
    tile.purchaseBaseCost <= 0 ||
    tile.tileType === "tower" ||
    tile.tileType === "capital" ||
    tile.tileType === "pass"
  ) {
    return {
      clearance_status: clearanceStatus,
      purchasable: false,
      reason: "战略或保护区块暂不可购买",
      cost_spirit_stone: cost,
      adjacent_owned: adjacentOwned,
      requires_clearance: requiresClearance,
    };
  }

  if (!adjacentOwned) {
    return {
      clearance_status: clearanceStatus,
      purchasable: false,
      reason: "需与已有领地相邻",
      cost_spirit_stone: cost,
      adjacent_owned: false,
      requires_clearance: requiresClearance,
    };
  }

  if (clearanceStatus === "required") {
    return {
      clearance_status: clearanceStatus,
      purchasable: false,
      reason: "区块仍有野怪驻守，需先派队清野",
      cost_spirit_stone: cost,
      adjacent_owned: true,
      requires_clearance: true,
    };
  }

  return {
    clearance_status: clearanceStatus,
    purchasable: true,
    reason: "可购买并纳入领地",
    cost_spirit_stone: cost,
    adjacent_owned: true,
    requires_clearance: requiresClearance,
  };
}

function buildMiniMapSummary(input: {
  province: WorldProvinceConfig;
  tiles: MapTileConfig[];
  ownerships: WorldBlockOwnershipWithPlayer[];
  playerId: string | null;
}): WorldMiniMapSummary {
  const ownershipMap = new Map(input.ownerships.map((ownership) => [ownership.tileId, ownership]));
  const terrainCounts = {
    desert: 0,
    forest: 0,
    mountain: 0,
    plain: 0,
    swamp: 0,
  };

  for (const tile of input.tiles) {
    terrainCounts[tile.terrainType] += 1;
  }

  return {
    province_id: input.province.provinceId,
    total_blocks: input.tiles.length,
    owned_blocks: input.tiles.filter(
      (tile) => ownershipMap.has(tile.tileId) || Boolean(tile.ownerProvinceId),
    ).length,
    neutral_blocks: input.tiles.filter(
      (tile) => !ownershipMap.has(tile.tileId) && !tile.ownerProvinceId,
    ).length,
    contested_blocks: input.tiles.filter((tile) => tile.status === "contested").length,
    tower_blocks: input.tiles.filter((tile) => tile.tileType === "tower").length,
    capital_blocks: input.tiles.filter((tile) => tile.tileType === "capital").length,
    pass_blocks: input.tiles.filter((tile) => tile.tileType === "pass").length,
    my_blocks: input.playerId
      ? input.ownerships.filter((ownership) => ownership.playerId === input.playerId).length
      : 0,
    terrain_counts: terrainCounts,
  };
}

function normalizeOwnershipType(
  value: string,
): NonNullable<MapTileState["ownership"]["ownership_type"]> {
  if (value === "main_city" || value === "sub_city" || value === "purchase" || value === "system") {
    return value;
  }

  return "system";
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

function normalizeTeamSnapshot(value: Prisma.JsonValue) {
  const record = isRecord(value) ? value : {};

  return {
    leader_name: toStringValue(record.leader_name, "主城先锋"),
    soldier_count: toNumber(record.soldier_count, 30),
    team_power: toNumber(record.team_power, 120),
    supply_cost: toNumber(record.supply_cost, 12),
  };
}

function resolveGarrisonOperation(
  currentSoldierCount: number,
  targetSoldierCount: number,
): DefendWorldResponse["operation"] {
  if (targetSoldierCount === currentSoldierCount) {
    return "unchanged";
  }
  if (targetSoldierCount === 0) {
    return "withdraw";
  }
  return targetSoldierCount > currentSoldierCount ? "increase" : "decrease";
}

function createWorldClearanceBattleLog(input: {
  cityName: string;
  enemyName: string;
  damageDone: number;
  damageTaken: number;
  cleared: boolean;
}): BattleRoundLog[] {
  const firstDamage = Math.floor(input.damageDone * 0.55);
  return [
    {
      round: 1,
      actor: `${input.cityName}先锋`,
      skill: "列阵破荒",
      damage: firstDamage,
      target_hp: Math.max(0, input.damageDone - firstDamage),
    },
    {
      round: 2,
      actor: input.enemyName,
      skill: "守域妖息",
      damage: input.damageTaken,
      target_hp: Math.max(0, 100 - input.damageTaken),
    },
    {
      round: 3,
      actor: `${input.cityName}先锋`,
      skill: "清野合击",
      damage: input.damageDone - firstDamage,
      target_hp: input.cleared ? 0 : Math.max(1, input.damageTaken - input.damageDone),
    },
  ];
}

function normalizeCityResources(value: Prisma.JsonValue): CityResourceSnapshot {
  const record = isRecord(value) ? value : {};

  return {
    spirit_stone: toStringValue(record.spirit_stone, "0"),
    grain: toStringValue(record.grain, "0"),
    ore: toStringValue(record.ore, "0"),
    wood: toStringValue(record.wood, "0"),
    herb: toStringValue(record.herb, "0"),
    soldier: toStringValue(record.soldier, "0"),
  };
}

function normalizeCityDefense(value: Prisma.JsonValue): CityDefenseSnapshot {
  const record = isRecord(value) ? value : {};

  return {
    wall_durability: toNumber(record.wall_durability, 0),
    wall_durability_cap: toNumber(record.wall_durability_cap, 0),
    garrison_power: toNumber(record.garrison_power, 0),
    protection_label: toStringValue(record.protection_label, "城防整备中"),
  };
}

function normalizeCityStatus(value: string): PlayerCityStatus {
  if (value === "normal" || value === "damaged" || value === "besieged" || value === "vassal") {
    return value;
  }

  return "protected";
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
