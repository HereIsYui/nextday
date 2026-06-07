import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  ChooseFactionRouteRequest,
  ChooseFactionRouteResponse,
  FactionReputationResponse,
  FactionRoutesResponse,
  TransferFactionRouteRequest,
  TransferFactionRouteResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { FactionsService } from "./factions.service";

@Controller("api/factions")
@UseGuards(BearerAuthGuard)
export class FactionsController {
  constructor(@Inject(FactionsService) private readonly factionsService: FactionsService) {}

  @Get("routes")
  routes(@Req() request: Request): Promise<FactionRoutesResponse> {
    return this.factionsService.getRoutes(requireAccountId(request));
  }

  @Get("reputation")
  reputation(@Req() request: Request): Promise<FactionReputationResponse> {
    return this.factionsService.getReputation(requireAccountId(request));
  }

  @Post("choose")
  choose(
    @Body() body: ChooseFactionRouteRequest,
    @Req() request: Request,
  ): Promise<ChooseFactionRouteResponse> {
    return this.factionsService.chooseRoute({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("transfer")
  transfer(
    @Body() body: TransferFactionRouteRequest,
    @Req() request: Request,
  ): Promise<TransferFactionRouteResponse> {
    return this.factionsService.transferRoute({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
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
