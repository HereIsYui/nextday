import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  ClaimWarSeasonRewardRequest,
  ClaimWarSeasonRewardResponse,
  CreateSectRallyRequest,
  DefendWorldRequest,
  DefendWorldResponse,
  JoinSectRallyRequest,
  ProvinceWarLeaderboardResponse,
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
  SettleWarSeasonResponse,
  SiegeWorldRequest,
  SiegeWorldResponse,
  StartWorldMarchRequest,
  StartWorldMarchResponse,
  TerritoryOverviewResponse,
  WarMeritSettlementResponse,
  WarMeritSummaryResponse,
  WarSeasonStateResponse,
  WorldAtlasResponse,
  WorldMapResponse,
  WorldMapView,
  WorldMapViewportRequest,
  WorldMarchListResponse,
  WorldProvinceListResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { WorldService } from "./world.service";

@Controller("api/world")
@UseGuards(BearerAuthGuard)
export class WorldController {
  constructor(@Inject(WorldService) private readonly worldService: WorldService) {}

  @Get("provinces")
  provinces(): WorldProvinceListResponse {
    return this.worldService.getProvinces();
  }

  @Get("province-war")
  provinceWar(): Promise<ProvinceWarLeaderboardResponse> {
    return this.worldService.getProvinceWarLeaderboard();
  }

  @Get("war-merit")
  warMerit(
    @Query("limit") limit: string | undefined,
    @Req() request: Request,
  ): Promise<WarMeritSummaryResponse> {
    return this.worldService.getWarMerit(requireAccountId(request), Number(limit ?? 20));
  }

  @Get("war-settlement")
  warSettlement(@Req() request: Request): Promise<WarMeritSettlementResponse> {
    return this.worldService.getWarSettlement(requireAccountId(request));
  }

  @Get("season")
  season(@Req() request: Request): Promise<WarSeasonStateResponse> {
    return this.worldService.getWarSeasonState(requireAccountId(request));
  }

  @Post("season/settle")
  settleSeason(
    @Headers("x-settlement-token") settlementToken: string | undefined,
    @Req() request: Request,
  ): Promise<SettleWarSeasonResponse> {
    return this.worldService.settleWarSeason({
      accountId: requireAccountId(request),
      idempotencyKey: requireIdempotencyKey(request),
      settlementToken,
    });
  }

  @Post("season/rewards/claim")
  claimSeasonReward(
    @Body() body: ClaimWarSeasonRewardRequest,
    @Req() request: Request,
  ): Promise<ClaimWarSeasonRewardResponse> {
    return this.worldService.claimWarSeasonReward({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("atlas")
  atlas(@Req() request: Request): Promise<WorldAtlasResponse> {
    return this.worldService.getAtlas(requireAccountId(request));
  }

  @Get("map")
  map(
    @Query("province_id") provinceId: string | undefined,
    @Query("view") view: WorldMapView | undefined,
    @Query("x") x: string | undefined,
    @Query("y") y: string | undefined,
    @Query("width") width: string | undefined,
    @Query("height") height: string | undefined,
    @Req() request: Request,
  ): Promise<WorldMapResponse> {
    return this.worldService.getMap({
      accountId: requireAccountId(request),
      provinceId,
      view,
      viewport: normalizeViewportQuery({ height, width, x, y }),
    });
  }

  @Get("marches")
  marches(@Req() request: Request): Promise<WorldMarchListResponse> {
    return this.worldService.getMarches(requireAccountId(request));
  }

  @Get("territory")
  territory(@Req() request: Request): Promise<TerritoryOverviewResponse> {
    return this.worldService.getTerritory(requireAccountId(request));
  }

  @Get("rallies")
  rallies(@Req() request: Request): Promise<SectRallyListResponse> {
    return this.worldService.getSectRallies(requireAccountId(request));
  }

  @Post("rallies")
  createRally(
    @Body() body: CreateSectRallyRequest,
    @Req() request: Request,
  ): Promise<SectRallyMutationResponse> {
    return this.worldService.createSectRally({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/rallies",
    });
  }

  @Post("rallies/join")
  joinRally(
    @Body() body: JoinSectRallyRequest,
    @Req() request: Request,
  ): Promise<SectRallyMutationResponse> {
    return this.worldService.joinSectRally({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/rallies/join",
    });
  }

  @Post("rallies/resolve")
  resolveRally(
    @Body() body: ResolveSectRallyRequest,
    @Req() request: Request,
  ): Promise<SectRallyMutationResponse> {
    return this.worldService.resolveSectRally({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/rallies/resolve",
    });
  }

  @Post("march")
  march(
    @Body() body: StartWorldMarchRequest,
    @Req() request: Request,
  ): Promise<StartWorldMarchResponse> {
    return this.worldService.startMarch({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/march",
    });
  }

  @Post("defend")
  defend(@Body() body: DefendWorldRequest, @Req() request: Request): Promise<DefendWorldResponse> {
    return this.worldService.defend({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/defend",
    });
  }

  @Post("clear-wild/resolve")
  resolveClearance(
    @Body() body: ResolveWorldClearanceRequest,
    @Req() request: Request,
  ): Promise<ResolveWorldClearanceResponse> {
    return this.worldService.resolveClearance({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/clear-wild/resolve",
    });
  }

  @Post("siege/resolve")
  resolveSiege(
    @Body() body: SiegeWorldRequest,
    @Req() request: Request,
  ): Promise<SiegeWorldResponse> {
    return this.worldService.resolveSiege({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/siege/resolve",
    });
  }

  @Post("scout/resolve")
  resolveScout(
    @Body() body: ScoutWorldRequest,
    @Req() request: Request,
  ): Promise<ScoutWorldResponse> {
    return this.worldService.resolveScout({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/scout/resolve",
    });
  }

  @Post("strategic-control/resolve")
  resolveStrategicControl(
    @Body() body: ResolveStrategicControlRequest,
    @Req() request: Request,
  ): Promise<ResolveStrategicControlResponse> {
    return this.worldService.resolveStrategicControl({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/strategic-control/resolve",
    });
  }

  @Post("blocks/purchase")
  purchaseBlock(
    @Body() body: PurchaseWorldBlockRequest,
    @Req() request: Request,
  ): Promise<PurchaseWorldBlockResponse> {
    return this.worldService.purchaseBlock({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/world/blocks/purchase",
    });
  }
}

function normalizeViewportQuery(
  input: Record<string, string | undefined>,
): WorldMapViewportRequest {
  return {
    ...(input.x ? { x: Number(input.x) } : {}),
    ...(input.y ? { y: Number(input.y) } : {}),
    ...(input.width ? { width: Number(input.width) } : {}),
    ...(input.height ? { height: Number(input.height) } : {}),
  };
}

function requireAccountId(request: Request): string {
  if (!request.accountId) {
    throw new Error("缺少账号上下文");
  }

  return request.accountId;
}

function requireIdempotencyKey(request: Request): string {
  const key = request.header("Idempotency-Key");

  if (!key) {
    throw new Error("缺少幂等键");
  }

  return key;
}
