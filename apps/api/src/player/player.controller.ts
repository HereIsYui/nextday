import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  CreatePlayerRequest,
  CreatePlayerResponse,
  PlayerProfileResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { PlayerService } from "./player.service";

@Controller("api/player")
@UseGuards(BearerAuthGuard)
export class PlayerController {
  constructor(@Inject(PlayerService) private readonly playerService: PlayerService) {}

  @Get("profile")
  profile(@Req() request: Request): Promise<PlayerProfileResponse> {
    return this.playerService.getProfile(requireAccountId(request));
  }

  @Post("create")
  create(
    @Body() body: CreatePlayerRequest,
    @Req() request: Request,
  ): Promise<CreatePlayerResponse> {
    return this.playerService.createPlayer({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
      endpoint: "POST /api/player/create",
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
