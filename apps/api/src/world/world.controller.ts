import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import type {
  DefendWorldRequest,
  DefendWorldResponse,
  PurchaseWorldBlockRequest,
  PurchaseWorldBlockResponse,
  StartWorldMarchRequest,
  StartWorldMarchResponse,
  TerritoryOverviewResponse,
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
