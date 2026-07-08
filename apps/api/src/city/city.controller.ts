import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  CityOverviewResponse,
  SettleMainCityRequest,
  SettleMainCityResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { CityService } from "./city.service";

@Controller("api/city")
@UseGuards(BearerAuthGuard)
export class CityController {
  constructor(@Inject(CityService) private readonly cityService: CityService) {}

  @Get("overview")
  overview(@Req() request: Request): Promise<CityOverviewResponse> {
    return this.cityService.getOverview(requireAccountId(request));
  }

  @Post("settle")
  settle(
    @Body() body: SettleMainCityRequest,
    @Req() request: Request,
  ): Promise<SettleMainCityResponse> {
    return this.cityService.settleMainCity({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/city/settle",
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
