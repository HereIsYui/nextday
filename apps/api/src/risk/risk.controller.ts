import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type {
  AdminDelayedSettlementListResponse,
  AdminPlayerRiskResponse,
  AdminRiskRecordListResponse,
  ReviewDelayedSettlementRequest,
  ReviewDelayedSettlementResponse,
  RiskStatus,
  SettlementStatus,
} from "@nextday/shared";
import type { Request } from "express";
import { RiskService } from "./risk.service";

@Controller("api/admin/risk")
export class RiskController {
  constructor(@Inject(RiskService) private readonly riskService: RiskService) {}

  @Get("player/:player_id")
  getPlayerRisk(
    @Param("player_id") playerId: string,
    @Req() request: Request,
  ): Promise<AdminPlayerRiskResponse> {
    assertAdminToken(request);
    return this.riskService.getPlayerRisk(playerId);
  }

  @Get("records")
  listRiskRecords(
    @Query("player_id") playerId: string | undefined,
    @Query("risk_status") riskStatus: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() request: Request,
  ): Promise<AdminRiskRecordListResponse> {
    assertAdminToken(request);
    return this.riskService.listRiskRecords({
      playerId,
      riskStatus: normalizeRiskStatus(riskStatus),
      limit: normalizeLimit(limit),
    });
  }

  @Get("delayed-settlements")
  listDelayedSettlements(
    @Query("player_id") playerId: string | undefined,
    @Query("status") status: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() request: Request,
  ): Promise<AdminDelayedSettlementListResponse> {
    assertAdminToken(request);
    return this.riskService.listDelayedSettlements({
      playerId,
      status: normalizeSettlementStatus(status),
      limit: normalizeLimit(limit),
    });
  }

  @Post("review")
  reviewDelayedSettlement(
    @Body() body: ReviewDelayedSettlementRequest,
    @Req() request: Request,
  ): Promise<ReviewDelayedSettlementResponse> {
    assertAdminToken(request);
    return this.riskService.reviewDelayedSettlement(body);
  }
}

function assertAdminToken(request: Request) {
  const expectedToken = process.env.ADMIN_DEV_TOKEN ?? "nextday-admin-dev";

  if (request.header("X-Admin-Token") !== expectedToken) {
    throw new ForbiddenException("开发后台令牌无效");
  }
}

function normalizeRiskStatus(value: string | undefined): RiskStatus | undefined {
  if (
    value === "normal" ||
    value === "rate_limited" ||
    value === "delayed_settlement" ||
    value === "decayed" ||
    value === "manual_review"
  ) {
    return value;
  }

  return undefined;
}

function normalizeSettlementStatus(value: string | undefined): SettlementStatus | undefined {
  if (value === "settled" || value === "delayed" || value === "rejected") {
    return value;
  }

  return undefined;
}

function normalizeLimit(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
