import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type {
  ActivityDetailResponse,
  ActivityListResponse,
  ClaimActivityRewardRequest,
  ClaimActivityRewardResponse,
  SubmitActivityProgressRequest,
  SubmitActivityProgressResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { EventsService } from "./events.service";

@Controller("api/events")
@UseGuards(BearerAuthGuard)
export class EventsController {
  constructor(@Inject(EventsService) private readonly eventsService: EventsService) {}

  @Get("list")
  list(@Req() request: Request): Promise<ActivityListResponse> {
    return this.eventsService.list(requireAccountId(request));
  }

  @Get(":event_id")
  detail(
    @Param("event_id") eventId: string,
    @Req() request: Request,
  ): Promise<ActivityDetailResponse> {
    return this.eventsService.detail(requireAccountId(request), eventId);
  }

  @Post("progress")
  progress(
    @Body() body: SubmitActivityProgressRequest,
    @Req() request: Request,
  ): Promise<SubmitActivityProgressResponse> {
    return this.eventsService.submitProgress({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("claim")
  claim(
    @Body() body: ClaimActivityRewardRequest,
    @Req() request: Request,
  ): Promise<ClaimActivityRewardResponse> {
    return this.eventsService.claimReward({
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
