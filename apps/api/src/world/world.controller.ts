import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import type {
  StartWorldMarchRequest,
  StartWorldMarchResponse,
  WorldMapResponse,
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

  @Get("map")
  map(@Query("province_id") provinceId: string | undefined): WorldMapResponse {
    return this.worldService.getMap({ provinceId });
  }

  @Get("marches")
  marches(@Req() request: Request): Promise<WorldMarchListResponse> {
    return this.worldService.getMarches(requireAccountId(request));
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
