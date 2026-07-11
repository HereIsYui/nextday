import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  CityManagementResponse,
  CityOverviewResponse,
  CollectTerritoryResponse,
  EstablishSubCityRequest,
  EstablishSubCityResponse,
  ExpandCityResponse,
  SettleMainCityRequest,
  SettleMainCityResponse,
  UpgradeCityBuildingRequest,
  UpgradeCityBuildingResponse,
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

  @Get("management")
  management(@Req() request: Request): Promise<CityManagementResponse> {
    return this.cityService.getManagement(requireAccountId(request));
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

  @Post("expand")
  expand(@Req() request: Request): Promise<ExpandCityResponse> {
    return this.cityService.expandMainCity({
      accountId: requireAccountId(request),
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/city/expand",
    });
  }

  @Post("subcity")
  establishSubCity(
    @Body() body: EstablishSubCityRequest,
    @Req() request: Request,
  ): Promise<EstablishSubCityResponse> {
    return this.cityService.establishSubCity({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/city/subcity",
    });
  }

  @Post("territory/collect")
  collectTerritory(@Req() request: Request): Promise<CollectTerritoryResponse> {
    return this.cityService.collectTerritory({
      accountId: requireAccountId(request),
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/city/territory/collect",
    });
  }

  @Post("buildings/upgrade")
  upgradeBuilding(
    @Body() body: UpgradeCityBuildingRequest,
    @Req() request: Request,
  ): Promise<UpgradeCityBuildingResponse> {
    return this.cityService.upgradeBuilding({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/city/buildings/upgrade",
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
