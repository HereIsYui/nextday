import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type {
  AdminCreateTransferDryRunRequest,
  AdminCreateTransferDryRunResponse,
  AdminExecuteTransferRequest,
  AdminExecuteTransferResponse,
  AdminReviewTransferRequest,
  AdminReviewTransferResponse,
  CancelTransferRequestRequest,
  CancelTransferRequestResponse,
  CreateTransferRequestRequest,
  CreateTransferRequestResponse,
  TransferRuleResponse,
  TransferStatusResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { TransferService } from "./transfer.service";

@Controller("api/transfer")
@UseGuards(BearerAuthGuard)
export class TransferController {
  constructor(@Inject(TransferService) private readonly transferService: TransferService) {}

  @Get("rules")
  rules(@Req() request: Request): Promise<TransferRuleResponse> {
    return this.transferService.getRules(requireAccountId(request));
  }

  @Get("status")
  status(@Req() request: Request): Promise<TransferStatusResponse> {
    return this.transferService.getStatus(requireAccountId(request));
  }

  @Post("request")
  requestTransfer(
    @Body() body: CreateTransferRequestRequest,
    @Req() request: Request,
  ): Promise<CreateTransferRequestResponse> {
    return this.transferService.createTransferRequest({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("cancel")
  cancelTransfer(
    @Body() body: CancelTransferRequestRequest,
    @Req() request: Request,
  ): Promise<CancelTransferRequestResponse> {
    return this.transferService.cancelTransferRequest({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }
}

@Controller("api/admin/transfer")
export class TransferAdminController {
  constructor(@Inject(TransferService) private readonly transferService: TransferService) {}

  @Post("dry-run")
  createDryRun(
    @Body() body: AdminCreateTransferDryRunRequest,
    @Req() request: Request,
  ): Promise<AdminCreateTransferDryRunResponse> {
    assertAdminToken(request);
    return this.transferService.createAdminDryRun({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("review")
  review(
    @Body() body: AdminReviewTransferRequest,
    @Req() request: Request,
  ): Promise<AdminReviewTransferResponse> {
    assertAdminToken(request);
    return this.transferService.reviewTransfer({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("execute")
  execute(
    @Body() body: AdminExecuteTransferRequest,
    @Req() request: Request,
  ): Promise<AdminExecuteTransferResponse> {
    assertAdminToken(request);
    return this.transferService.reserveTransferExecution({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }
}

function assertAdminToken(request: Request) {
  const expectedToken = process.env.ADMIN_DEV_TOKEN ?? "nextday-admin-dev";

  if (request.header("X-Admin-Token") !== expectedToken) {
    throw new ForbiddenException("开发后台令牌无效");
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
    throw new BadRequestException("缺少幂等键");
  }

  return key;
}
