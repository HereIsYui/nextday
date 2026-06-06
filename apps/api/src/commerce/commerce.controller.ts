import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  AncientTreasureListResponse,
  AppearanceListResponse,
  AppearanceMutationResponse,
  ClaimAppearanceRequest,
  ClaimMonthlyDailyRequest,
  ClaimMonthlyDailyResponse,
  ConvenienceBatchPreviewRequest,
  ConvenienceBatchPreviewResponse,
  CreateAutomationQueueRequest,
  CreateAutomationQueueResponse,
  EntitlementOverviewResponse,
  EquipAppearanceRequest,
  GachaDrawRequest,
  GachaDrawResponse,
  GachaHistoryResponse,
  GachaPoolListResponse,
  PurchaseMonthlyCardRequest,
  PurchaseMonthlyCardResponse,
  SaveConvenienceStrategyRequest,
  SaveConvenienceStrategyResponse,
  SyncVipRequest,
  SyncVipResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { CommerceService } from "./commerce.service";

@Controller("api/commerce")
@UseGuards(BearerAuthGuard)
export class CommerceController {
  constructor(@Inject(CommerceService) private readonly commerceService: CommerceService) {}

  @Get("overview")
  overview(@Req() request: Request): Promise<EntitlementOverviewResponse> {
    return this.commerceService.getOverview(requireAccountId(request));
  }

  @Post("monthly-cards/purchase")
  purchaseMonthlyCard(
    @Body() body: PurchaseMonthlyCardRequest,
    @Req() request: Request,
  ): Promise<PurchaseMonthlyCardResponse> {
    return this.commerceService.purchaseMonthlyCard({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("monthly-cards/claim-daily")
  claimMonthlyDaily(
    @Body() body: ClaimMonthlyDailyRequest,
    @Req() request: Request,
  ): Promise<ClaimMonthlyDailyResponse> {
    return this.commerceService.claimMonthlyDaily({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("vip/sync")
  syncVip(@Body() body: SyncVipRequest, @Req() request: Request): Promise<SyncVipResponse> {
    return this.commerceService.syncVip({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("gacha/pools")
  gachaPools(@Req() request: Request): Promise<GachaPoolListResponse> {
    return this.commerceService.listGachaPools(requireAccountId(request));
  }

  @Post("gacha/draw")
  drawGacha(@Body() body: GachaDrawRequest, @Req() request: Request): Promise<GachaDrawResponse> {
    return this.commerceService.drawGacha({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("gacha/history")
  gachaHistory(@Req() request: Request): Promise<GachaHistoryResponse> {
    return this.commerceService.getGachaHistory(requireAccountId(request));
  }

  @Get("ancient-treasures")
  ancientTreasures(@Req() request: Request): Promise<AncientTreasureListResponse> {
    return this.commerceService.listAncientTreasures(requireAccountId(request));
  }

  @Post("convenience/batch-preview")
  batchPreview(
    @Body() body: ConvenienceBatchPreviewRequest,
    @Req() request: Request,
  ): Promise<ConvenienceBatchPreviewResponse> {
    return this.commerceService.previewBatch({ accountId: requireAccountId(request), body });
  }

  @Post("convenience/strategies")
  saveStrategy(
    @Body() body: SaveConvenienceStrategyRequest,
    @Req() request: Request,
  ): Promise<SaveConvenienceStrategyResponse> {
    return this.commerceService.saveStrategy({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("convenience/automation-queues")
  createAutomationQueue(
    @Body() body: CreateAutomationQueueRequest,
    @Req() request: Request,
  ): Promise<CreateAutomationQueueResponse> {
    return this.commerceService.createAutomationQueue({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("appearances")
  appearances(@Req() request: Request): Promise<AppearanceListResponse> {
    return this.commerceService.listAppearances(requireAccountId(request));
  }

  @Post("appearances/claim")
  claimAppearance(
    @Body() body: ClaimAppearanceRequest,
    @Req() request: Request,
  ): Promise<AppearanceMutationResponse> {
    return this.commerceService.claimAppearance({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("appearances/equip")
  equipAppearance(
    @Body() body: EquipAppearanceRequest,
    @Req() request: Request,
  ): Promise<AppearanceMutationResponse> {
    return this.commerceService.equipAppearance({
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
