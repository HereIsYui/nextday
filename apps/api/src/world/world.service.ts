import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  ArmyFormation,
  BattleRoundLog,
  BattleSummary,
  CityDefenseSnapshot,
  CityResourceSnapshot,
  CreateSectRallyRequest,
  DefendWorldRequest,
  DefendWorldResponse,
  JoinSectRallyRequest,
  MapTileState,
  MarchQueueState,
  MarchQueueStatus,
  MarchType,
  PlayerCityStatus,
  ProvinceWarLeaderboardEntry,
  ProvinceWarLeaderboardResponse,
  ProvinceWarState,
  PurchaseWorldBlockRequest,
  PurchaseWorldBlockResponse,
  ResolveSectRallyRequest,
  ResolveStrategicControlRequest,
  ResolveStrategicControlResponse,
  ResolveWorldClearanceRequest,
  ResolveWorldClearanceResponse,
  ScoutWorldRequest,
  ScoutWorldResponse,
  SectRallyListResponse,
  SectRallyMutationResponse,
  SectRallyState,
  SiegeRecordState,
  SiegeWorldRequest,
  SiegeWorldResponse,
  StartWorldMarchRequest,
  StartWorldMarchResponse,
  StrategicControlState,
  TerritoryBlockState,
  TerritoryExpansionCandidateState,
  TerritoryNodeState,
  TerritoryOverviewResponse,
  TerritoryTerrainSummaryState,
  WalletSnapshot,
  WarMeritEntryState,
  WarMeritPeriodSnapshot,
  WarMeritRankingEntry,
  WarMeritSettlementResponse,
  WarMeritSummaryResponse,
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
  WorldScoutIntelState,
} from "@nextday/shared";
import type {
  CityArmyPreset,
  MarchQueue,
  Player,
  PlayerCity,
  Prisma,
  SectRally,
  SiegeRecord,
  StrategicControlRecord,
  TerritoryGarrison,
  WarMeritRecord,
  WorldBlockClearance,
  WorldBlockOwnership,
} from "@prisma/client";
import { armyCommanderConfigs, getArmyPower } from "../city/army.constants";
import { PrismaService } from "../database/prisma.service";
import { defaultEraId } from "../game/game.constants";
import { toBattleSummary } from "../game/game.mappers";
import { getRealmConfig } from "../game/realm-progression.constants";
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
const validMarchTypes = new Set<MarchType>([
  "scout",
  "clear_wild",
  "reinforce",
  "siege",
  "contest",
]);
const strategicControlDurationMs = 24 * 60 * 60 * 1000;

function periodKey(type: "day" | "week", date: Date): string {
  const value = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${type}_${value}`;
}

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

  async getSectRallies(accountId: string): Promise<SectRallyListResponse> {
    const player = await this.prisma.player.findUnique({ where: { accountId } });
    if (!player?.sectId) return { rallies: [] };
    const now = new Date();
    await this.prisma.sectRally.updateMany({
      where: { sectId: player.sectId, status: "open", endsAt: { lte: now } },
      data: { status: "expired", resolvedAt: now },
    });
    const rallies = await this.prisma.sectRally.findMany({
      where: { sectId: player.sectId, status: "open" },
      orderBy: { endsAt: "asc" },
    });
    return {
      rallies: await Promise.all(
        rallies.map((rally) => this.toSectRallyState(rally, player.playerId)),
      ),
    };
  }

  async createSectRally(input: {
    accountId: string;
    body: CreateSectRallyRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<SectRallyMutationResponse> {
    const targetTileId = input.body.target_tile_id?.trim();
    const rallyType = input.body.rally_type;
    if (!targetTileId || (rallyType !== "attack" && rallyType !== "defend")) {
      throw new BadRequestException("请选择战略目标和集结类型");
    }
    const requestHash = hashRequestBody({ rally_type: rallyType, target_tile_id: targetTileId });
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.idempotencyRecord.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (replay) return replay.responseData as unknown as SectRallyMutationResponse;
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player || player.currentRealm < 4)
        throw new BadRequestException("达到第 4 境并加入宗门后才能发起集结");
      const member = await tx.sectMember.findUnique({ where: { playerId: player.playerId } });
      if (!member || (member.role !== "leader" && member.role !== "elder")) {
        throw new BadRequestException("只有宗主或长老可以发起集结");
      }
      const tile = requireMapTile(targetTileId);
      if (!tile.landmarkGroupId || !isStrategicControlTile(tile)) {
        throw new BadRequestException("只能在关隘、州府或九塔发起集结");
      }
      const now = new Date();
      const rally = await tx.sectRally.create({
        data: {
          rallyId: `rally_${randomUUID()}`,
          eraId: defaultEraId,
          sectId: member.sectId,
          targetTileId: tile.tileId,
          landmarkGroupId: tile.landmarkGroupId,
          provinceId: tile.provinceId,
          rallyType,
          status: "open",
          createdByPlayerId: player.playerId,
          endsAt: new Date(now.getTime() + 60 * 60 * 1000),
          idempotencyKey: input.idempotencyKey,
        },
      });
      const responseData: SectRallyMutationResponse = {
        record_id: `rally_create_${randomUUID()}`,
        rally: await this.toSectRallyState(rally, player.playerId, tx),
      };
      await this.writeWorldIdempotency(tx, input, requestHash, responseData);
      return responseData;
    });
  }

  async joinSectRally(input: {
    accountId: string;
    body: JoinSectRallyRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<SectRallyMutationResponse> {
    const rallyId = input.body.rally_id?.trim();
    if (!rallyId) throw new BadRequestException("请选择宗门集结");
    const requestHash = hashRequestBody({ rally_id: rallyId });
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.idempotencyRecord.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (replay) return replay.responseData as unknown as SectRallyMutationResponse;
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player || player.currentRealm < 3)
        throw new BadRequestException("达到第 3 境后才能响应宗门集结");
      const [member, rally] = await Promise.all([
        tx.sectMember.findUnique({ where: { playerId: player.playerId } }),
        tx.sectRally.findUnique({ where: { rallyId } }),
      ]);
      if (
        !member ||
        !rally ||
        member.sectId !== rally.sectId ||
        rally.status !== "open" ||
        rally.endsAt <= new Date()
      ) {
        throw new BadRequestException("该宗门集结不可响应");
      }
      const preset = await tx.cityArmyPreset.findFirst({
        where: { playerId: player.playerId, presetType: "march" },
      });
      const teamPower = preset?.power ?? 140 + player.currentRealm * 20;
      await tx.sectRallyMember.upsert({
        where: { rallyId_playerId: { rallyId, playerId: player.playerId } },
        create: {
          rallyMemberId: `rally_member_${randomUUID()}`,
          rallyId,
          playerId: player.playerId,
          teamPower,
        },
        update: { teamPower, joinedAt: new Date() },
      });
      const responseData: SectRallyMutationResponse = {
        record_id: `rally_join_${randomUUID()}`,
        rally: await this.toSectRallyState(rally, player.playerId, tx),
      };
      await this.writeWorldIdempotency(tx, input, requestHash, responseData);
      return responseData;
    });
  }

  async resolveSectRally(input: {
    accountId: string;
    body: ResolveSectRallyRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<SectRallyMutationResponse> {
    const rallyId = input.body.rally_id?.trim();
    if (!rallyId) throw new BadRequestException("请选择宗门集结");
    const requestHash = hashRequestBody({ rally_id: rallyId });
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.idempotencyRecord.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (replay) return replay.responseData as unknown as SectRallyMutationResponse;
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      const member = player
        ? await tx.sectMember.findUnique({ where: { playerId: player.playerId } })
        : null;
      const rally = await tx.sectRally.findUnique({ where: { rallyId } });
      if (
        !player ||
        !member ||
        !rally ||
        rally.sectId !== member.sectId ||
        (member.role !== "leader" && member.role !== "elder")
      ) {
        throw new BadRequestException("只有发起宗门的宗主或长老可以结算集结");
      }
      const participants = await tx.sectRallyMember.findMany({ where: { rallyId } });
      if (rally.status !== "open" || participants.length < 2) {
        throw new BadRequestException("集结至少需要两名成员响应后才能结算");
      }
      const sect = await tx.sect.findUniqueOrThrow({ where: { sectId: rally.sectId } });
      const totalPower = participants.reduce(
        (total, participant) => total + participant.teamPower,
        0,
      );
      const active = await tx.strategicControlRecord.findFirst({
        where: {
          eraId: defaultEraId,
          landmarkGroupId: rally.landmarkGroupId,
          status: "active",
          expiresAt: { gt: new Date() },
        },
        orderBy: { resolvedAt: "desc" },
      });
      const defenderPower =
        (active?.attackerPower ??
          strategicBaseDefense(strategicControlTypeForTile(requireMapTile(rally.targetTileId)))) +
        60;
      const won = totalPower >= defenderPower;
      let control: StrategicControlRecord | null = active;
      if (won && rally.rallyType === "attack") {
        if (active)
          await tx.strategicControlRecord.update({
            where: { controlId: active.controlId },
            data: { status: "expired", expiresAt: new Date() },
          });
        control = await tx.strategicControlRecord.create({
          data: {
            controlId: `control_${randomUUID()}`,
            eraId: defaultEraId,
            landmarkGroupId: rally.landmarkGroupId,
            tileId: rally.targetTileId,
            provinceId: rally.provinceId,
            controlType: strategicControlTypeForTile(requireMapTile(rally.targetTileId)),
            controllerType: "sect",
            controllerId: sect.sectId,
            controllerName: sect.name,
            attackerPower: totalPower,
            defenderPower,
            status: "active",
            startsAt: new Date(),
            expiresAt: new Date(Date.now() + strategicControlDurationMs),
            sourceMarchId: rally.rallyId,
            idempotencyKey: `${input.idempotencyKey}:control`,
            resolvedAt: new Date(),
          },
        });
      } else if (
        won &&
        rally.rallyType === "defend" &&
        active?.controllerType === "sect" &&
        active.controllerId === sect.sectId
      ) {
        control = await tx.strategicControlRecord.update({
          where: { controlId: active.controlId },
          data: { attackerPower: { increment: Math.floor(totalPower * 0.5) } },
        });
      }
      const updated = await tx.sectRally.update({
        where: { rallyId },
        data: {
          status: won ? "resolved" : "failed",
          resolvedAt: new Date(),
          resultSnapshot: {
            total_power: totalPower,
            defender_power: defenderPower,
            won,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.warMeritRecord.createMany({
        data: participants.map((participant) => {
          const merit = won ? Math.min(60, 30 + Math.floor(participant.teamPower / 100)) : 8;
          return {
            recordId: `merit_${randomUUID()}`,
            playerId: participant.playerId,
            sectId: rally.sectId,
            eraId: defaultEraId,
            provinceId: rally.provinceId,
            sourceType: "sect_rally",
            sourceId: rally.rallyId,
            merit,
            result: won ? (rally.rallyType === "defend" ? "defended" : "won") : "lost",
            detailSnapshot: {
              summary: won
                ? `参与${sect.name}集结并取得胜利，获得 ${merit} 点战功`
                : `参与${sect.name}集结，虽未取胜仍获得 ${merit} 点参战战功`,
              team_power: participant.teamPower,
              total_power: totalPower,
            } as Prisma.InputJsonValue,
          };
        }),
        skipDuplicates: true,
      });
      const responseData: SectRallyMutationResponse = {
        record_id: `rally_resolve_${randomUUID()}`,
        won,
        rally: await this.toSectRallyState(updated, player.playerId, tx),
        control: control ? this.toStrategicControlState(control, player.playerId) : null,
      };
      await this.writeWorldIdempotency(tx, input, requestHash, responseData);
      return responseData;
    });
  }

  async getAtlas(accountId: string): Promise<WorldAtlasResponse> {
    const player = await this.requirePlayer(accountId);
    const [ownerships, marches, cities, garrisons, controls] = await Promise.all([
      this.prisma.worldBlockOwnership.findMany({ where: { eraId: defaultEraId, status: "owned" } }),
      this.prisma.marchQueue.findMany({ where: { playerId: player.playerId, status: "marching" } }),
      this.prisma.playerCity.findMany({ where: { eraId: defaultEraId } }),
      this.prisma.territoryGarrison.findMany({
        where: { playerId: player.playerId, eraId: defaultEraId },
      }),
      this.prisma.strategicControlRecord.findMany({
        where: { eraId: defaultEraId, status: "active", expiresAt: { gt: new Date() } },
      }),
    ]);
    const warByProvince = new Map(
      this.buildProvinceWarEntries(controls).map((entry) => [entry.province_id, entry]),
    );
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
          my_city_count: cities.filter(
            (city) => city.playerId === player.playerId && city.provinceId === province.provinceId,
          ).length,
          my_garrison_soldiers: garrisons
            .filter((garrison) => tiles.some((tile) => tile.tileId === garrison.tileId))
            .reduce((total, garrison) => total + garrison.soldierCount, 0),
          active_march_count: marches.filter((march) => march.provinceId === province.provinceId)
            .length,
          available_birth_blocks: tiles.filter(
            (tile) => isBirthPlainTile(tile) && !owned.has(tile.tileId),
          ).length,
          terrain_distribution: countTerrainDistribution(tiles),
          resource_summary:
            province.commanderies[0]?.resourceTheme.slice(0, 2).join("、") ?? "灵材",
          has_active_march: marches.some((march) => march.provinceId === province.provinceId),
          war_score: warByProvince.get(province.provinceId)?.score ?? 0,
          war_rank: warByProvince.get(province.provinceId)?.rank ?? worldProvinceConfigs.length,
          controlled_landmarks:
            (warByProvince.get(province.provinceId)?.pass_controls ?? 0) +
            (warByProvince.get(province.provinceId)?.capital_controls ?? 0) +
            (warByProvince.get(province.provinceId)?.tower_controls ?? 0),
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

  async getProvinceWarLeaderboard(): Promise<ProvinceWarLeaderboardResponse> {
    const controls = await this.prisma.strategicControlRecord.findMany({
      where: { eraId: defaultEraId, status: "active", expiresAt: { gt: new Date() } },
    });
    return {
      provinces: this.buildProvinceWarEntries(controls),
      calculated_at: new Date().toISOString(),
    };
  }

  async getWarMerit(accountId: string, limit = 20): Promise<WarMeritSummaryResponse> {
    const player = await this.requirePlayer(accountId);
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.floor(limit))) : 20;
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    const day = weekStart.getDay() || 7;
    weekStart.setDate(weekStart.getDate() - day + 1);
    const records = await this.prisma.warMeritRecord.findMany({
      where: { playerId: player.playerId, eraId: defaultEraId },
      orderBy: { createdAt: "desc" },
    });
    const city = await this.prisma.playerCity.findFirst({
      where: { playerId: player.playerId, cityType: "main" },
    });
    const total = (items: typeof records) => items.reduce((sum, item) => sum + item.merit, 0);
    return {
      season_id: worldSeasonId,
      season_name: worldSeasonName,
      total_merit: total(records),
      daily_merit: total(records.filter((item) => item.createdAt >= dayStart)),
      weekly_merit: total(records.filter((item) => item.createdAt >= weekStart)),
      province_merit: total(records.filter((item) => item.provinceId === city?.provinceId)),
      sect_merit: total(records.filter((item) => Boolean(item.sectId))),
      entries: records.slice(0, safeLimit).map((item) => this.toWarMeritEntry(item)),
      calculated_at: now.toISOString(),
    };
  }

  async getWarSettlement(accountId: string): Promise<WarMeritSettlementResponse> {
    await this.requirePlayer(accountId);
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    const day = weekStart.getDay() || 7;
    weekStart.setDate(weekStart.getDate() - day + 1);
    const [daily, weeklyPlayer, weeklySect, weeklyProvince] = await Promise.all([
      this.buildWarMeritSnapshot("daily_player", periodKey("day", dayStart), dayStart, "player"),
      this.buildWarMeritSnapshot(
        "weekly_player",
        periodKey("week", weekStart),
        weekStart,
        "player",
      ),
      this.buildWarMeritSnapshot("weekly_sect", periodKey("week", weekStart), weekStart, "sect"),
      this.buildWarMeritSnapshot(
        "weekly_province",
        periodKey("week", weekStart),
        weekStart,
        "province",
      ),
    ]);
    return {
      season_id: worldSeasonId,
      season_name: worldSeasonName,
      daily,
      weekly: [weeklyPlayer, weeklySect, weeklyProvince],
      calculated_at: now.toISOString(),
    };
  }

  private async buildWarMeritSnapshot(
    rankType: WarMeritPeriodSnapshot["rank_type"],
    periodKey: string,
    since: Date,
    targetType: WarMeritRankingEntry["target_type"],
  ): Promise<WarMeritPeriodSnapshot> {
    const records = await this.prisma.warMeritRecord.findMany({
      where: { eraId: defaultEraId, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
    });
    const scores = new Map<string, number>();
    for (const record of records) {
      const targetId =
        targetType === "player"
          ? record.playerId
          : targetType === "sect"
            ? record.sectId
            : record.provinceId;
      if (targetId) scores.set(targetId, (scores.get(targetId) ?? 0) + record.merit);
    }
    const ids = Array.from(scores.keys());
    const [players, sects] = await Promise.all([
      targetType === "player"
        ? this.prisma.player.findMany({ where: { playerId: { in: ids } } })
        : Promise.resolve([]),
      targetType === "sect"
        ? this.prisma.sect.findMany({ where: { sectId: { in: ids } } })
        : Promise.resolve([]),
    ]);
    const names = new Map<string, string>([
      ...players.map((item) => [item.playerId, item.name] as const),
      ...sects.map((item) => [item.sectId, item.name] as const),
      ...worldProvinceConfigs.map((item) => [item.provinceId, item.name] as const),
    ]);
    const entries = Array.from(scores.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 50)
      .map(([targetId, score], index) => ({
        rank_no: index + 1,
        target_type: targetType,
        target_id: targetId,
        display_name: names.get(targetId) ?? targetId,
        score,
      }));
    const generatedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const snapshot = await tx.rankSnapshot.upsert({
        where: { eraId_rankType_periodKey: { eraId: defaultEraId, rankType, periodKey } },
        create: {
          rankSnapshotId: `rank_snapshot_${randomUUID()}`,
          eraId: defaultEraId,
          rankType,
          periodKey,
          configVersion: worldConfigVersion,
          rewardConfigVersion: worldConfigVersion,
        },
        update: { generatedAt, configVersion: worldConfigVersion },
      });
      await tx.rankEntry.deleteMany({ where: { rankSnapshotId: snapshot.rankSnapshotId } });
      if (entries.length > 0) {
        await tx.rankEntry.createMany({
          data: entries.map((entry) => ({
            rankEntryId: `rank_entry_${randomUUID()}`,
            rankSnapshotId: snapshot.rankSnapshotId,
            targetType: entry.target_type,
            targetId: entry.target_id,
            displayName: entry.display_name,
            score: BigInt(entry.score),
            rankNo: entry.rank_no,
            rewardSnapshot: { merit: entry.score, period_key: periodKey },
          })),
        });
      }
    });
    return {
      rank_type: rankType,
      period_key: periodKey,
      generated_at: generatedAt.toISOString(),
      entries,
    };
  }

  private toWarMeritEntry(record: WarMeritRecord): WarMeritEntryState {
    const provinceName =
      worldProvinceConfigs.find((province) => province.provinceId === record.provinceId)?.name ??
      record.provinceId;
    const labels = {
      siege: "攻城",
      strategic_control: "战略争夺",
      sect_rally: "宗门集结",
    } as const;
    const detail = record.detailSnapshot as { summary?: string };
    return {
      record_id: record.recordId,
      province_id: record.provinceId,
      province_name: provinceName,
      source_type: record.sourceType as WarMeritEntryState["source_type"],
      source_label: labels[record.sourceType as keyof typeof labels] ?? "州战行动",
      source_id: record.sourceId,
      merit: record.merit,
      result: record.result as WarMeritEntryState["result"],
      summary: detail.summary ?? `获得 ${record.merit} 点战功`,
      created_at: record.createdAt.toISOString(),
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
    const [city, ownerships, garrisons] = await Promise.all([
      this.prisma.playerCity.findFirst({
        where: { playerId: player.playerId, cityType: "main" },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.worldBlockOwnership.findMany({
        where: { playerId: player.playerId, eraId: defaultEraId, status: "owned" },
        orderBy: { ownedAt: "asc" },
      }),
      this.prisma.territoryGarrison.findMany({
        where: { playerId: player.playerId, eraId: defaultEraId },
      }),
    ]);

    if (!city) {
      return {
        main_city: null,
        owned_block_count: 0,
        total_garrison_soldiers: 0,
        total_garrison_power: 0,
        block_limit: 0,
        remaining_block_capacity: 0,
        hourly_output: emptyTerritoryHourlyOutput(),
        terrain_summary: [],
        blocks: [],
        expansion_candidates: [],
        recommended_terrain_type: null,
        expansion: null,
        next_purchase_hint: "先选择出生州建立主城，再从相邻无主区块开始扩张。",
        config_version: territoryConfigVersion,
      };
    }

    const garrisonByTileId = new Map(garrisons.map((garrison) => [garrison.tileId, garrison]));
    const blocks = ownerships
      .map((ownership) =>
        this.toTerritoryBlockState(ownership, garrisonByTileId.get(ownership.tileId) ?? null),
      )
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
    const [provinceOwnerships, clearances] = await Promise.all([
      this.prisma.worldBlockOwnership.findMany({
        where: { eraId: defaultEraId, provinceId: city.provinceId, status: "owned" },
        include: { player: true },
      }),
      this.prisma.worldBlockClearance.findMany({
        where: { playerId: player.playerId, eraId: defaultEraId, status: "cleared" },
      }),
    ]);
    const recommendedTerrainType = resolveRecommendedTerrainType(blocks, expansion);
    const purchaseContext = mapPurchaseContext(
      provinceOwnerships,
      player.playerId,
      new Set(clearances.map((clearance) => clearance.tileId)),
    );
    const ownershipByTileId = new Map(
      provinceOwnerships.map((ownership) => [ownership.tileId, ownership]),
    );
    const expansionCandidates =
      remainingBlockCapacity > 0
        ? getWorldTilesByProvince(city.provinceId)
            .map((tile) => ({
              state: buildPurchaseState(
                tile,
                ownershipByTileId.get(tile.tileId) ?? null,
                purchaseContext,
              ),
              tile,
            }))
            .filter(
              ({ state }) =>
                state.purchasable ||
                (state.adjacent_owned && state.clearance_status === "required"),
            )
            .sort((left, right) => compareExpansionCandidates(left, right, recommendedTerrainType))
            .slice(0, 6)
            .map(({ state, tile }) =>
              this.toExpansionCandidateState(tile, state, recommendedTerrainType),
            )
        : [];

    return {
      main_city: this.toCityState(city),
      owned_block_count: blocks.length,
      total_garrison_soldiers: garrisons.reduce(
        (total, garrison) => total + garrison.soldierCount,
        0,
      ),
      total_garrison_power: garrisons.reduce((total, garrison) => total + garrison.defensePower, 0),
      block_limit: blockLimit,
      remaining_block_capacity: remainingBlockCapacity,
      hourly_output: hourlyOutput,
      terrain_summary: [...terrainSummary.values()].sort(
        (left, right) => right.block_count - left.block_count,
      ),
      blocks,
      expansion_candidates: expansionCandidates,
      recommended_terrain_type: recommendedTerrainType,
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
      const requiredRealm =
        normalizedBody.march_type === "siege" || normalizedBody.march_type === "contest"
          ? 3
          : normalizedBody.march_type === "reinforce"
            ? 2
            : 1;
      if (player.currentRealm < requiredRealm) {
        throw new BadRequestException(`该行军行动需要达到第 ${requiredRealm} 境`);
      }

      const cities = await tx.playerCity.findMany({
        where: { playerId: player.playerId },
        orderBy: [{ cityType: "asc" }, { createdAt: "asc" }],
      });
      const sourceCity = resolveSourceCity(cities, normalizedBody.source_city_id);
      const targetTile = requireMarchTarget(sourceCity, normalizedBody.target_tile_id);
      if (normalizedBody.march_type === "siege") {
        const targetCity = await tx.playerCity.findUnique({ where: { tileId: targetTile.tileId } });
        if (!targetCity || targetCity.playerId === player.playerId) {
          throw new BadRequestException("围城只能选择其他玩家的城池");
        }
        if (targetCity.protectionUntil && targetCity.protectionUntil.getTime() > Date.now()) {
          throw new BadRequestException("目标城池处于保护期");
        }
      }
      if (normalizedBody.march_type === "contest") {
        if (!targetTile.landmarkGroupId || !isStrategicControlTile(targetTile)) {
          throw new BadRequestException("只能争夺关隘、州府或九塔战略区");
        }
        const activeControl = await tx.strategicControlRecord.findFirst({
          where: {
            eraId: defaultEraId,
            landmarkGroupId: targetTile.landmarkGroupId,
            status: "active",
            expiresAt: { gt: new Date() },
          },
          orderBy: { resolvedAt: "desc" },
        });
        if (activeControl?.controllerId === player.playerId) {
          throw new BadRequestException("你已控制此战略区，无需重复争夺");
        }
      }
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

      const armyPreset = await resolveMarchArmyPreset(
        tx,
        player.playerId,
        normalizedBody.preset_id,
      );
      const availableSoldiers = Number(normalizeCityResources(sourceCity.resourceSnapshot).soldier);
      if (armyPreset && armyPreset.soldierCount > availableSoldiers) {
        throw new BadRequestException("行军预设所需道兵不足，请先训练或调整预设");
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
          teamSnapshot: createTeamSnapshot(sourceCity, armyPreset, player.currentRealm),
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

  async resolveScout(input: {
    accountId: string;
    body: ScoutWorldRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<ScoutWorldResponse> {
    const marchId = input.body.march_id?.trim();
    if (!marchId) throw new BadRequestException("请选择已抵达的侦察队伍");
    const requestHash = hashRequestBody({ march_id: marchId });
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
      return existingRecord.responseData as unknown as ScoutWorldResponse;
    }
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const march = await tx.marchQueue.findUnique({ where: { marchId } });
      if (!march || march.playerId !== player.playerId || march.marchType !== "scout") {
        throw new BadRequestException("侦察行军不存在");
      }
      if (march.status === "resolved" || march.resolvedAt) {
        throw new BadRequestException("该侦察行军已处理");
      }
      if (getComputedMarchStatus(march) !== "arrived") {
        throw new BadRequestException("侦察队伍尚未抵达");
      }
      const sourceCity = await tx.playerCity.findUnique({ where: { cityId: march.sourceCityId } });
      if (!sourceCity) throw new BadRequestException("行军来源城池不存在");
      const [targetCity, ownership, garrison] = await Promise.all([
        tx.playerCity.findUnique({ where: { tileId: march.targetTileId } }),
        tx.worldBlockOwnership.findUnique({
          where: { eraId_tileId: { eraId: defaultEraId, tileId: march.targetTileId } },
          include: { player: true },
        }),
        tx.territoryGarrison.findUnique({
          where: { eraId_tileId: { eraId: defaultEraId, tileId: march.targetTileId } },
        }),
      ]);
      const targetTile = requireMapTile(march.targetTileId);
      const now = new Date();
      const updatedMarch = await tx.marchQueue.update({
        where: { marchId },
        data: { resolvedAt: now, status: "resolved" },
      });
      const intel = buildScoutIntel({
        garrisonPower: garrison?.defensePower ?? 0,
        now,
        ownership,
        targetCity,
        targetTile,
      });
      const responseData: ScoutWorldResponse = {
        record_id: `resolve_scout_${randomUUID()}`,
        march: this.toMarchState(updatedMarch, sourceCity),
        intel,
      };
      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "world_scout_resolve",
          targetType: "map_tile",
          targetId: targetTile.tileId,
          afterSnapshot: intel as unknown as Prisma.InputJsonValue,
          reason: "侦察区块与城防概况",
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
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return responseData;
    });
  }

  async resolveStrategicControl(input: {
    accountId: string;
    body: ResolveStrategicControlRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<ResolveStrategicControlResponse> {
    const marchId = input.body.march_id?.trim();
    if (!marchId) throw new BadRequestException("请选择已抵达的争夺队伍");
    const requestHash = hashRequestBody({ march_id: marchId });
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
      return existingRecord.responseData as unknown as ResolveStrategicControlResponse;
    }
    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const march = await tx.marchQueue.findUnique({ where: { marchId } });
      if (!march || march.playerId !== player.playerId || march.marchType !== "contest") {
        throw new BadRequestException("战略争夺行军不存在");
      }
      if (march.status === "resolved" || march.resolvedAt) {
        throw new BadRequestException("该战略争夺行军已处理");
      }
      if (getComputedMarchStatus(march) !== "arrived") {
        throw new BadRequestException("争夺队伍尚未抵达");
      }
      const [sourceCity, targetTile] = [
        await tx.playerCity.findUnique({ where: { cityId: march.sourceCityId } }),
        requireMapTile(march.targetTileId),
      ];
      if (!sourceCity || !targetTile.landmarkGroupId || !isStrategicControlTile(targetTile)) {
        throw new BadRequestException("战略目标已不可争夺");
      }
      const now = new Date();
      const activeControl = await tx.strategicControlRecord.findFirst({
        where: {
          eraId: defaultEraId,
          landmarkGroupId: targetTile.landmarkGroupId,
          status: "active",
          expiresAt: { gt: now },
        },
        orderBy: { resolvedAt: "desc" },
      });
      const team = normalizeTeamSnapshot(march.teamSnapshot);
      const controlType = strategicControlTypeForTile(targetTile);
      const defenderPower =
        (activeControl?.attackerPower ?? strategicBaseDefense(controlType)) +
        (activeControl ? 40 : 0);
      const won = team.team_power >= defenderPower;
      if (activeControl && won) {
        await tx.strategicControlRecord.update({
          where: { controlId: activeControl.controlId },
          data: { status: "expired", expiresAt: now },
        });
      }
      const control = await tx.strategicControlRecord.create({
        data: {
          controlId: `control_${randomUUID()}`,
          eraId: defaultEraId,
          landmarkGroupId: targetTile.landmarkGroupId,
          tileId: targetTile.tileId,
          provinceId: targetTile.provinceId,
          controlType,
          controllerType: "player",
          controllerId: player.playerId,
          controllerName: player.name,
          attackerPower: team.team_power,
          defenderPower,
          status: won ? "active" : "failed",
          startsAt: now,
          expiresAt: won ? new Date(now.getTime() + strategicControlDurationMs) : now,
          sourceMarchId: march.marchId,
          idempotencyKey: input.idempotencyKey,
          resolvedAt: now,
        },
      });
      const controlMerit = won ? 50 : 10;
      await tx.warMeritRecord.create({
        data: {
          recordId: `merit_${randomUUID()}`,
          playerId: player.playerId,
          sectId: player.sectId,
          eraId: defaultEraId,
          provinceId: targetTile.provinceId,
          sourceType: "strategic_control",
          sourceId: control.controlId,
          merit: controlMerit,
          result: won ? "won" : "lost",
          detailSnapshot: {
            summary: won
              ? `夺得${targetTile.tileName}控制权，获得 ${controlMerit} 点战功`
              : `争夺${targetTile.tileName}未果，获得 ${controlMerit} 点参战战功`,
            control_type: controlType,
            attacker_power: team.team_power,
            defender_power: defenderPower,
          } as Prisma.InputJsonValue,
        },
      });
      const updatedMarch = await tx.marchQueue.update({
        where: { marchId },
        data: { status: "resolved", resolvedAt: now },
      });
      const provinceTileIds = getWorldTilesByProvince(targetTile.provinceId).map(
        (tile) => tile.tileId,
      );
      const [ownerships, garrisons, clearances, controls] = await Promise.all([
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
        tx.strategicControlRecord.findMany({
          where: {
            eraId: defaultEraId,
            provinceId: targetTile.provinceId,
            status: "active",
            expiresAt: { gt: now },
          },
        }),
      ]);
      const responseData: ResolveStrategicControlResponse = {
        record_id: `resolve_control_${randomUUID()}`,
        won,
        attacker_power: team.team_power,
        defender_power: defenderPower,
        control: this.toStrategicControlState(control, player.playerId),
        march: this.toMarchState(updatedMarch, sourceCity),
        map: this.buildMapResponse({
          clearedTileIds: new Set(clearances.map((item) => item.tileId)),
          controls,
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
          action: "world_strategic_control_resolve",
          targetType: "map_tile",
          targetId: targetTile.tileId,
          afterSnapshot: responseData.control as unknown as Prisma.InputJsonValue,
          reason: won
            ? `夺得${strategicControlLabel(controlType)}周期控制权`
            : `${strategicControlLabel(controlType)}争夺失利`,
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
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return responseData;
    });
  }

  async resolveSiege(input: {
    accountId: string;
    body: SiegeWorldRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<SiegeWorldResponse> {
    const marchId = input.body.march_id?.trim();
    if (!marchId) throw new BadRequestException("请选择已抵达的围城队伍");
    const normalizedBody: SiegeWorldRequest = { march_id: marchId };
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
      return existingRecord.responseData as unknown as SiegeWorldResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const player = await tx.player.findUnique({ where: { accountId: input.accountId } });
      if (!player) throw new BadRequestException("请先创建角色");
      const march = await tx.marchQueue.findUnique({ where: { marchId } });
      if (!march || march.playerId !== player.playerId || march.marchType !== "siege") {
        throw new BadRequestException("围城行军不存在");
      }
      if (march.status === "resolved" || march.resolvedAt) {
        throw new BadRequestException("该围城行军已处理");
      }
      if (getComputedMarchStatus(march) !== "arrived") {
        throw new BadRequestException("围城队伍尚未抵达");
      }
      const [sourceCity, targetCity] = await Promise.all([
        tx.playerCity.findUnique({ where: { cityId: march.sourceCityId } }),
        tx.playerCity.findUnique({ where: { tileId: march.targetTileId } }),
      ]);
      if (!sourceCity || !targetCity || targetCity.playerId === player.playerId) {
        throw new BadRequestException("围城目标已不存在");
      }
      const now = new Date();
      if (targetCity.protectionUntil && targetCity.protectionUntil.getTime() > now.getTime()) {
        throw new BadRequestException("目标城池处于保护期");
      }
      const repeatedCount = await tx.siegeRecord.count({
        where: {
          attackerPlayerId: player.playerId,
          targetCityId: targetCity.cityId,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      });
      const rewardRatePercent = [100, 50, 20][repeatedCount] ?? 0;
      if (rewardRatePercent === 0) {
        throw new BadRequestException("今日对该城的围城收益已耗尽，请更换目标");
      }

      const team = normalizeTeamSnapshot(march.teamSnapshot);
      const targetGarrison = await tx.territoryGarrison.findUnique({
        where: { eraId_tileId: { eraId: defaultEraId, tileId: targetCity.tileId } },
      });
      const beforeDefense = normalizeCityDefense(targetCity.defenseSnapshot);
      const beforeResources = normalizeCityResources(targetCity.resourceSnapshot);
      const attackerPower = team.team_power;
      const defenderPower =
        (targetGarrison?.defensePower ?? beforeDefense.garrison_power) +
        Math.floor(beforeDefense.wall_durability / 5);
      const won = attackerPower > defenderPower;
      const wallDamage = Math.min(
        beforeDefense.wall_durability,
        won
          ? Math.max(80, Math.floor((attackerPower - defenderPower) / 2) + 100)
          : Math.max(20, Math.floor(attackerPower / 10)),
      );
      const wallDurabilityAfter = Math.max(0, beforeDefense.wall_durability - wallDamage);
      const breached = won && wallDurabilityAfter === 0;
      const captured = breached && targetCity.cityType === "sub";
      const plunder = calculateSiegePlunder(
        beforeResources,
        breached && !captured ? rewardRatePercent : 0,
      );
      const afterResources = subtractSiegePlunder(beforeResources, plunder);
      const attackerResources = addSiegePlunder(
        normalizeCityResources(sourceCity.resourceSnapshot),
        plunder,
      );
      const protectionUntil = breached ? new Date(now.getTime() + 6 * 60 * 60 * 1000) : null;
      const updatedTargetCity = await tx.playerCity.update({
        where: { cityId: targetCity.cityId },
        data: {
          ...(captured ? { playerId: player.playerId, ownerSectId: player.sectId } : {}),
          status: captured ? "protected" : breached ? "besieged" : "damaged",
          protectionUntil,
          defenseSnapshot: {
            ...beforeDefense,
            wall_durability: wallDurabilityAfter,
            protection_label: captured ? "分城易主保护中" : breached ? "城破休整中" : "城防受损",
          } as Prisma.InputJsonValue,
          resourceSnapshot: afterResources as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.playerCity.update({
        where: { cityId: sourceCity.cityId },
        data: { resourceSnapshot: attackerResources as unknown as Prisma.InputJsonValue },
      });
      if (captured) {
        await tx.worldBlockOwnership.update({
          where: { eraId_tileId: { eraId: defaultEraId, tileId: targetCity.tileId } },
          data: {
            playerId: player.playerId,
            ownershipType: "sub_city",
            sourceType: "siege_capture",
            sourceId: targetCity.cityId,
          },
        });
        await tx.territoryGarrison.deleteMany({
          where: { eraId: defaultEraId, tileId: targetCity.tileId },
        });
      }
      const updatedMarch = await tx.marchQueue.update({
        where: { marchId: march.marchId },
        data: { resolvedAt: now, status: "resolved" },
      });
      const siege = await tx.siegeRecord.create({
        data: {
          siegeId: `siege_${randomUUID()}`,
          eraId: defaultEraId,
          targetCityId: targetCity.cityId,
          targetTileId: targetCity.tileId,
          marchId: march.marchId,
          attackerPlayerId: player.playerId,
          defenderPlayerId: targetCity.playerId,
          status: captured ? "captured" : won ? "won" : "lost",
          attackerPower,
          defenderPower,
          wallDamage,
          plunderSnapshot: plunder as unknown as Prisma.InputJsonValue,
          cityStateBefore: this.toCityState(targetCity) as unknown as Prisma.InputJsonValue,
          cityStateAfter: this.toCityState(updatedTargetCity) as unknown as Prisma.InputJsonValue,
          rewardRatePercent,
          protectionUntil,
          idempotencyKey: input.idempotencyKey,
          resolvedAt: now,
        },
      });
      const attackerMerit = captured ? 80 : won ? 40 : 10;
      const defenderMerit = won ? 8 : 20;
      await tx.warMeritRecord.createMany({
        data: [
          {
            recordId: `merit_${randomUUID()}`,
            playerId: player.playerId,
            sectId: player.sectId,
            eraId: defaultEraId,
            provinceId: targetCity.provinceId,
            sourceType: "siege",
            sourceId: siege.siegeId,
            merit: attackerMerit,
            result: captured ? "captured" : won ? "won" : "lost",
            detailSnapshot: {
              summary: captured
                ? `攻破并接管${targetCity.cityName}，获得 ${attackerMerit} 点战功`
                : won
                  ? `攻破${targetCity.cityName}城防，获得 ${attackerMerit} 点战功`
                  : `进攻${targetCity.cityName}未果，获得 ${attackerMerit} 点参战战功`,
              wall_damage: wallDamage,
            } as Prisma.InputJsonValue,
          },
          {
            recordId: `merit_${randomUUID()}`,
            playerId: targetCity.playerId,
            sectId: targetCity.ownerSectId,
            eraId: defaultEraId,
            provinceId: targetCity.provinceId,
            sourceType: "siege",
            sourceId: siege.siegeId,
            merit: defenderMerit,
            result: won ? "lost" : "defended",
            detailSnapshot: {
              summary: won
                ? `${targetCity.cityName}城防失守，获得 ${defenderMerit} 点守城战功`
                : `守住${targetCity.cityName}，获得 ${defenderMerit} 点守城战功`,
              wall_damage: wallDamage,
            } as Prisma.InputJsonValue,
          },
        ],
        skipDuplicates: true,
      });
      const targetTile = requireMapTile(targetCity.tileId);
      const provinceTileIds = getWorldTilesByProvince(targetCity.provinceId).map(
        (tile) => tile.tileId,
      );
      const [ownerships, garrisons, clearances] = await Promise.all([
        tx.worldBlockOwnership.findMany({
          where: { eraId: defaultEraId, provinceId: targetCity.provinceId, status: "owned" },
          include: { player: true },
        }),
        tx.territoryGarrison.findMany({
          where: { eraId: defaultEraId, tileId: { in: provinceTileIds } },
          include: { player: true },
        }),
        tx.worldBlockClearance.findMany({
          where: { playerId: player.playerId, eraId: defaultEraId, status: "cleared" },
        }),
      ]);
      const responseData: SiegeWorldResponse = {
        record_id: `resolve_siege_${randomUUID()}`,
        march: this.toMarchState(updatedMarch, sourceCity),
        won,
        attacker_power: attackerPower,
        defender_power: defenderPower,
        siege: this.toSiegeRecordState(siege, updatedTargetCity),
        city: this.toCityState(updatedTargetCity),
        map: this.buildMapResponse({
          clearedTileIds: new Set(clearances.map((item) => item.tileId)),
          garrisons,
          ownerships,
          playerId: player.playerId,
          provinceId: targetCity.provinceId,
          view: "detail",
          viewport: viewportAroundTile(targetTile),
        }),
      };
      await tx.auditLog.create({
        data: {
          auditLogId: `audit_${randomUUID()}`,
          accountId: input.accountId,
          playerId: player.playerId,
          action: "world_siege_resolve",
          targetType: "player_city",
          targetId: targetCity.cityId,
          afterSnapshot: responseData.siege as unknown as Prisma.InputJsonValue,
          reason: captured
            ? "攻破分城并接管分城区块"
            : breached
              ? "攻破主城城防并掠夺普通资源，主城产权保持不变"
              : "围城造成城防损伤，产权保持不变",
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
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
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
      preset_id: input.body.preset_id?.trim() || undefined,
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
      const garrisonPreset = normalizedBody.preset_id
        ? await tx.cityArmyPreset.findFirst({
            where: {
              presetId: normalizedBody.preset_id,
              playerId: player.playerId,
              presetType: "garrison",
            },
          })
        : null;
      if (normalizedBody.preset_id && !garrisonPreset) {
        throw new BadRequestException("驻防预设不存在");
      }
      if (garrisonPreset && garrisonPreset.soldierCount !== targetSoldierCount) {
        throw new BadRequestException("目标驻军数必须与驻防预设一致");
      }
      const presetSnapshot = garrisonPreset
        ? createGarrisonPresetSnapshot(garrisonPreset)
        : ({} as Prisma.InputJsonValue);
      const defensePower = garrisonPreset?.power ?? targetSoldierCount * 2;
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
                defensePower,
                presetSnapshot,
              },
              update: {
                soldierCount: targetSoldierCount,
                defensePower,
                sourceCityId: city.cityId,
                presetSnapshot,
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
    const [ownerships, garrisons, clearances, controls] = await Promise.all([
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
      this.prisma.strategicControlRecord.findMany({
        where: {
          eraId: defaultEraId,
          provinceId,
          status: "active",
          expiresAt: { gt: new Date() },
        },
      }),
    ]);

    return this.buildMapResponse({
      clearedTileIds: new Set(clearances.map((item) => item.tileId)),
      garrisons,
      ownerships,
      controls,
      playerId: player?.playerId ?? null,
      provinceId,
      view: normalizeWorldMapView(input.view),
      viewport: input.viewport,
    });
  }

  private buildMapResponse(input: {
    clearedTileIds?: Set<string>;
    controls?: StrategicControlRecord[];
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
    const controlMap = new Map(
      (input.controls ?? []).map((control) => [control.landmarkGroupId, control]),
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
          controlMap.get(tile.landmarkGroupId ?? "") ?? null,
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

  private buildProvinceWarEntries(
    controls: StrategicControlRecord[],
  ): ProvinceWarLeaderboardEntry[] {
    const entries = worldProvinceConfigs.map((province) => {
      const provinceControls = controls.filter(
        (control) => control.provinceId === province.provinceId,
      );
      const count = (type: string) =>
        provinceControls.filter((control) => control.controlType === type).length;
      const passControls = count("pass");
      const capitalControls = count("capital");
      const towerControls = count("tower");
      const dominant = provinceControls.find((control) => control.controllerType === "sect");
      return {
        province_id: province.provinceId,
        province_name: province.name,
        rank: 0,
        score: passControls * 60 + capitalControls * 100 + towerControls * 120,
        pass_controls: passControls,
        capital_controls: capitalControls,
        tower_controls: towerControls,
        dominant_sect_name: dominant?.controllerName ?? null,
      };
    });
    return entries
      .sort(
        (left, right) =>
          right.score - left.score || left.province_id.localeCompare(right.province_id),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
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
    control: StrategicControlRecord | null = null,
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
      strategic_control: control
        ? this.toStrategicControlState(control, purchaseContext.playerId)
        : null,
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
    const preset = normalizeGarrisonPresetSnapshot(garrison.presetSnapshot);
    return {
      tile_id: garrison.tileId,
      owner_player_id: garrison.playerId,
      soldier_count: garrison.soldierCount,
      defense_power: garrison.defensePower,
      preset_id: preset.presetId,
      commander_name: preset.commanderName,
      formation: preset.formation,
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

  private toTerritoryBlockState(
    ownership: WorldBlockOwnership,
    garrison: TerritoryGarrison | null,
  ): TerritoryBlockState | null {
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
      x: tile.x,
      y: tile.y,
      province_id: province.provinceId,
      province_name: province.name,
      commandery_id: commandery.commanderyId,
      commandery_name: commandery.name,
      terrain_type: tile.terrainType,
      terrain_label: tile.terrainLabel,
      ownership_type: normalizeOwnershipType(ownership.ownershipType),
      owned_at: ownership.ownedAt.toISOString(),
      hourly_output: getTerrainHourlyOutput(tile.terrainType),
      garrison: garrison ? this.toGarrisonState(garrison, ownership.playerId) : null,
      city_expansion_eligible: tile.terrainType === "plain",
    };
  }

  private toExpansionCandidateState(
    tile: MapTileConfig,
    purchaseState: MapTileState["purchase_state"],
    recommendedTerrainType: TerritoryOverviewResponse["recommended_terrain_type"],
  ): TerritoryExpansionCandidateState {
    const province = this.requireProvince(tile.provinceId);
    const action = purchaseState.purchasable ? "purchase" : "clear_wild";
    return {
      tile_id: tile.tileId,
      tile_name: tile.tileName,
      province_id: tile.provinceId,
      province_name: province.name,
      x: tile.x,
      y: tile.y,
      terrain_type: tile.terrainType,
      terrain_label: tile.terrainLabel,
      action,
      recommendation_reason:
        tile.terrainType === recommendedTerrainType
          ? action === "purchase"
            ? `可直接购买，能补足当前最需要的${tile.terrainLabel}产出`
            : `先清野，再购买以补足当前最需要的${tile.terrainLabel}产出`
          : action === "purchase"
            ? "与现有领地相邻，可直接购买"
            : "与现有领地相邻，清野后可购买",
      cost_spirit_stone: purchaseState.cost_spirit_stone,
      hourly_output: getTerrainHourlyOutput(tile.terrainType),
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

  private async toSectRallyState(
    rally: SectRally,
    playerId: string,
    db: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<SectRallyState> {
    const [sect, creator, participants] = await Promise.all([
      db.sect.findUniqueOrThrow({ where: { sectId: rally.sectId } }),
      db.player.findUnique({ where: { playerId: rally.createdByPlayerId } }),
      db.sectRallyMember.findMany({ where: { rallyId: rally.rallyId } }),
    ]);
    return {
      rally_id: rally.rallyId,
      sect_id: rally.sectId,
      sect_name: sect.name,
      target_tile_id: rally.targetTileId,
      landmark_group_id: rally.landmarkGroupId,
      province_id: rally.provinceId,
      rally_type: rally.rallyType === "defend" ? "defend" : "attack",
      status: normalizeSectRallyStatus(rally.status),
      created_by_name: creator?.name ?? "宗门执事",
      participant_count: participants.length,
      total_power: participants.reduce((total, item) => total + item.teamPower, 0),
      minimum_participants: 2,
      ends_at: rally.endsAt.toISOString(),
      remaining_seconds: Math.max(0, Math.ceil((rally.endsAt.getTime() - Date.now()) / 1000)),
      joined: participants.some((item) => item.playerId === playerId),
    };
  }

  private async writeWorldIdempotency(
    tx: Prisma.TransactionClient,
    input: { accountId: string; endpoint: string; idempotencyKey: string },
    requestHash: string,
    responseData: unknown,
  ) {
    await tx.idempotencyRecord.create({
      data: {
        idempotencyKey: input.idempotencyKey,
        accountId: input.accountId,
        endpoint: input.endpoint,
        requestHash,
        responseData: responseData as Prisma.InputJsonValue,
        statusCode: 200,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  private toStrategicControlState(
    control: StrategicControlRecord,
    playerId: string | null,
  ): StrategicControlState {
    const controlType = normalizeStrategicControlType(control.controlType);
    return {
      control_id: control.controlId,
      landmark_group_id: control.landmarkGroupId,
      tile_id: control.tileId,
      province_id: control.provinceId,
      control_type: controlType,
      control_label: strategicControlLabel(controlType),
      controller_type: control.controllerType === "sect" ? "sect" : "player",
      controller_id: control.controllerId,
      controller_name: control.controllerName,
      is_mine: control.controllerId === playerId,
      status: normalizeStrategicControlStatus(control.status),
      starts_at: control.startsAt.toISOString(),
      expires_at: control.expiresAt.toISOString(),
      remaining_seconds: Math.max(0, Math.ceil((control.expiresAt.getTime() - Date.now()) / 1000)),
    };
  }

  private toSiegeRecordState(siege: SiegeRecord, city: PlayerCity): SiegeRecordState {
    const plunder = normalizeSiegePlunder(siege.plunderSnapshot);
    return {
      siege_id: siege.siegeId,
      target_city_id: siege.targetCityId,
      target_tile_id: siege.targetTileId,
      target_city_name: city.cityName,
      status: siege.status === "captured" ? "captured" : siege.status === "won" ? "won" : "lost",
      attacker_power: siege.attackerPower,
      defender_power: siege.defenderPower,
      wall_damage: siege.wallDamage,
      wall_durability_after: normalizeCityDefense(city.defenseSnapshot).wall_durability,
      reward_rate_percent: siege.rewardRatePercent,
      captured: siege.status === "captured",
      ownership_transferred: siege.status === "captured",
      plunder,
      protection_until: siege.protectionUntil?.toISOString() ?? null,
      resolved_at: siege.resolvedAt.toISOString(),
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
  const presetId = body?.preset_id?.trim() ?? "";

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
    preset_id: presetId,
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

function isStrategicControlTile(tile: MapTileConfig): boolean {
  return tile.tileType === "tower" || tile.tileType === "capital" || tile.tileType === "pass";
}

function strategicControlTypeForTile(tile: MapTileConfig): "pass" | "capital" | "tower" {
  if (tile.tileType === "tower") return "tower";
  if (tile.tileType === "capital") return "capital";
  return "pass";
}

function strategicBaseDefense(controlType: "pass" | "capital" | "tower"): number {
  return { pass: 160, capital: 240, tower: 320 }[controlType];
}

function strategicControlLabel(controlType: "pass" | "capital" | "tower"): string {
  return { pass: "关隘", capital: "州府", tower: "九塔" }[controlType];
}

function normalizeStrategicControlType(value: string): "pass" | "capital" | "tower" {
  return value === "tower" || value === "capital" ? value : "pass";
}

function normalizeStrategicControlStatus(value: string): "active" | "failed" | "expired" {
  return value === "active" || value === "failed" ? value : "expired";
}

function normalizeSectRallyStatus(value: string): "open" | "resolved" | "expired" | "failed" {
  return value === "resolved" || value === "expired" || value === "failed" ? value : "open";
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

function createGarrisonPresetSnapshot(preset: CityArmyPreset): Prisma.InputJsonValue {
  const commander = armyCommanderConfigs.find((item) => item.commanderId === preset.commanderId);
  return {
    preset_id: preset.presetId,
    commander_id: preset.commanderId,
    commander_name: commander?.commanderName ?? "主城先锋",
    formation: normalizeArmyFormation(preset.formation),
  };
}

function normalizeGarrisonPresetSnapshot(value: Prisma.JsonValue): {
  presetId: string | null;
  commanderName: string;
  formation: ArmyFormation;
} {
  const record = isRecord(value) ? value : {};
  return {
    presetId: toNullableString(record.preset_id),
    commanderName: toStringValue(record.commander_name, "主城守军"),
    formation: normalizeArmyFormation(record.formation),
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

async function resolveMarchArmyPreset(
  tx: Prisma.TransactionClient,
  playerId: string,
  presetId: string,
): Promise<CityArmyPreset | null> {
  if (presetId) {
    const preset = await tx.cityArmyPreset.findFirst({
      where: { presetId, playerId, presetType: "march" },
    });
    if (!preset) throw new BadRequestException("行军预设不存在");
    return preset;
  }
  return tx.cityArmyPreset.findFirst({ where: { playerId, presetType: "march" } });
}

function createTeamSnapshot(
  city: PlayerCity,
  preset: CityArmyPreset | null,
  currentRealm: number,
): Prisma.InputJsonValue {
  if (preset) {
    const commander = armyCommanderConfigs.find((item) => item.commanderId === preset.commanderId);
    return {
      preset_id: preset.presetId,
      commander_id: preset.commanderId,
      leader_name: commander?.commanderName ?? "主城先锋",
      formation: normalizeArmyFormation(preset.formation),
      soldier_count: preset.soldierCount,
      supply_cost: Math.max(1, Math.ceil(preset.soldierCount * 0.4)),
      team_power: preset.power,
    };
  }
  return {
    preset_id: null,
    commander_id: "city_vanguard",
    leader_name: `${city.cityName}先锋`,
    formation: "balanced",
    soldier_count: 30,
    supply_cost: 12,
    team_power: Math.floor(
      (120 + city.cityLevel * 20) * (1 + getRealmConfig(currentRealm).powerBonusPercent / 100),
    ),
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
    preset_id: toNullableString(record.preset_id),
    commander_id: toStringValue(record.commander_id, "city_vanguard"),
    leader_name: toStringValue(record.leader_name, "主城先锋"),
    formation: normalizeArmyFormation(record.formation),
    soldier_count: toNumber(record.soldier_count, 30),
    team_power: toNumber(record.team_power, 120),
    supply_cost: toNumber(record.supply_cost, 12),
  };
}

function normalizeArmyFormation(value: unknown): ArmyFormation {
  return value === "assault" || value === "defense" || value === "scout" ? value : "balanced";
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

function resolveRecommendedTerrainType(
  blocks: TerritoryBlockState[],
  expansion: NonNullable<TerritoryOverviewResponse["expansion"]>,
): TerritoryOverviewResponse["recommended_terrain_type"] {
  if (expansion.owned_plain_blocks < expansion.required_plain_blocks) {
    return "plain";
  }

  const output = blocks.reduce(
    (total, block) => ({
      grain: total.grain + block.hourly_output.grain,
      herb: total.herb + block.hourly_output.herb,
      ore: total.ore + block.hourly_output.ore,
      spirit_stone: total.spirit_stone + block.hourly_output.spirit_stone,
      wood: total.wood + block.hourly_output.wood,
    }),
    { grain: 0, herb: 0, ore: 0, spirit_stone: 0, wood: 0 },
  );
  const resource = Object.entries(output).sort((left, right) => left[1] - right[1])[0]?.[0];
  return resource === "ore"
    ? "mountain"
    : resource === "wood"
      ? "forest"
      : resource === "herb"
        ? "swamp"
        : resource === "spirit_stone"
          ? "desert"
          : "plain";
}

function compareExpansionCandidates(
  left: { state: MapTileState["purchase_state"]; tile: MapTileConfig },
  right: { state: MapTileState["purchase_state"]; tile: MapTileConfig },
  recommendedTerrainType: TerritoryOverviewResponse["recommended_terrain_type"],
): number {
  const score = (candidate: typeof left) =>
    (candidate.tile.terrainType === recommendedTerrainType ? 100 : 0) +
    (candidate.state.purchasable ? 30 : 0) -
    Number(candidate.state.cost_spirit_stone) / 1000;
  return score(right) - score(left) || left.tile.tileId.localeCompare(right.tile.tileId);
}

function countTerrainDistribution(
  tiles: MapTileConfig[],
): WorldAtlasResponse["provinces"][number]["terrain_distribution"] {
  return tiles.reduce(
    (counts, tile) => {
      counts[tile.terrainType] += 1;
      return counts;
    },
    { desert: 0, forest: 0, mountain: 0, plain: 0, swamp: 0 },
  );
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

function buildScoutIntel(input: {
  garrisonPower: number;
  now: Date;
  ownership: WorldBlockOwnershipWithPlayer | null;
  targetCity: PlayerCity | null;
  targetTile: MapTileConfig;
}): WorldScoutIntelState {
  const defense = input.targetCity ? normalizeCityDefense(input.targetCity.defenseSnapshot) : null;
  const resources = input.targetCity
    ? normalizeCityResources(input.targetCity.resourceSnapshot)
    : null;
  const resourceTotal = resources
    ? Number(resources.spirit_stone) +
      Number(resources.grain) +
      Number(resources.ore) +
      Number(resources.wood)
    : 0;
  const wallRate = defense?.wall_durability_cap
    ? defense.wall_durability / defense.wall_durability_cap
    : 0;
  return {
    tile_id: input.targetTile.tileId,
    tile_name: input.targetTile.tileName,
    owner_player_name: input.ownership?.player.name ?? null,
    city_name: input.targetCity?.cityName ?? null,
    city_type: input.targetCity ? (input.targetCity.cityType === "sub" ? "sub" : "main") : null,
    city_level: input.targetCity?.cityLevel ?? null,
    city_status: input.targetCity ? normalizeCityStatus(input.targetCity.status) : null,
    wall_condition: !defense
      ? "unknown"
      : wallRate < 0.35
        ? "weak"
        : wallRate < 0.75
          ? "steady"
          : "strong",
    garrison_estimate:
      input.garrisonPower <= 0 ? "few" : input.garrisonPower < 200 ? "moderate" : "many",
    resource_estimate: !resources
      ? "unknown"
      : resourceTotal < 800
        ? "scarce"
        : resourceTotal < 3000
          ? "normal"
          : "rich",
    protected: Boolean(
      input.targetCity?.protectionUntil &&
        input.targetCity.protectionUntil.getTime() > input.now.getTime(),
    ),
    scouted_at: input.now.toISOString(),
  };
}

type SiegePlunder = SiegeRecordState["plunder"];

function calculateSiegePlunder(
  resources: CityResourceSnapshot,
  rewardRatePercent: number,
): SiegePlunder {
  const calculate = (value: string) => {
    const total = Number(value);
    const protectedAmount = Math.floor(total * 0.5);
    return Math.max(
      0,
      Math.floor((Math.max(0, total - protectedAmount) * 0.1 * rewardRatePercent) / 100),
    );
  };
  return {
    spirit_stone: String(calculate(resources.spirit_stone)),
    grain: String(calculate(resources.grain)),
    ore: String(calculate(resources.ore)),
    wood: String(calculate(resources.wood)),
  };
}

function normalizeSiegePlunder(value: Prisma.JsonValue): SiegePlunder {
  const record = isRecord(value) ? value : {};
  return {
    spirit_stone: toStringValue(record.spirit_stone, "0"),
    grain: toStringValue(record.grain, "0"),
    ore: toStringValue(record.ore, "0"),
    wood: toStringValue(record.wood, "0"),
  };
}

function subtractSiegePlunder(
  resources: CityResourceSnapshot,
  plunder: SiegePlunder,
): CityResourceSnapshot {
  return changeSiegeResources(resources, plunder, -1);
}

function addSiegePlunder(
  resources: CityResourceSnapshot,
  plunder: SiegePlunder,
): CityResourceSnapshot {
  return changeSiegeResources(resources, plunder, 1);
}

function changeSiegeResources(
  resources: CityResourceSnapshot,
  plunder: SiegePlunder,
  direction: 1 | -1,
): CityResourceSnapshot {
  return {
    ...resources,
    spirit_stone: String(Number(resources.spirit_stone) + direction * Number(plunder.spirit_stone)),
    grain: String(Number(resources.grain) + direction * Number(plunder.grain)),
    ore: String(Number(resources.ore) + direction * Number(plunder.ore)),
    wood: String(Number(resources.wood) + direction * Number(plunder.wood)),
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

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
