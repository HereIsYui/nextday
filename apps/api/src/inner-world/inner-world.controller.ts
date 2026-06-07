import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  InnerWorldAssignmentListResponse,
  InnerWorldClaimRequest,
  InnerWorldClaimResponse,
  InnerWorldDispatchRequest,
  InnerWorldDispatchResponse,
  InnerWorldSummaryResponse,
  InnerWorldSupportRequest,
  InnerWorldSupportResponse,
  InnerWorldUpgradeRequest,
  InnerWorldUpgradeResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { InnerWorldService } from "./inner-world.service";

@Controller("api/inner-world")
@UseGuards(BearerAuthGuard)
export class InnerWorldController {
  constructor(@Inject(InnerWorldService) private readonly innerWorldService: InnerWorldService) {}

  @Get("summary")
  summary(@Req() request: Request): Promise<InnerWorldSummaryResponse> {
    return this.innerWorldService.getSummary(requireAccountId(request));
  }

  @Get("assignments")
  assignments(@Req() request: Request): Promise<InnerWorldAssignmentListResponse> {
    return this.innerWorldService.getAssignments(requireAccountId(request));
  }

  @Post("dispatch")
  dispatch(
    @Body() body: InnerWorldDispatchRequest,
    @Req() request: Request,
  ): Promise<InnerWorldDispatchResponse> {
    return this.innerWorldService.dispatch({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("claim")
  claim(
    @Body() body: InnerWorldClaimRequest,
    @Req() request: Request,
  ): Promise<InnerWorldClaimResponse> {
    return this.innerWorldService.claim({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("upgrade")
  upgrade(
    @Body() body: InnerWorldUpgradeRequest,
    @Req() request: Request,
  ): Promise<InnerWorldUpgradeResponse> {
    return this.innerWorldService.upgrade({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("support")
  support(
    @Body() body: InnerWorldSupportRequest,
    @Req() request: Request,
  ): Promise<InnerWorldSupportResponse> {
    return this.innerWorldService.support({
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
