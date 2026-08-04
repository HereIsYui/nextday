import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type {
  AlchemyRecordListResponse,
  BagSummaryResponse,
  EquipmentInscribeRequest,
  EquipmentListResponse,
  EquipmentOperationRecordListResponse,
  EquipmentOperationResponse,
  EquipmentTargetRequest,
  LearnSkillRequest,
  LearnSkillResponse,
  PillUseRequest,
  ProductionCraftMaterialListResponse,
  SaveSkillLoadoutRequest,
  SetEquipmentLockRequest,
  SetItemLockRequest,
  SetItemLockResponse,
  SkillLoadoutResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import type {
  DiscoveredAlchemyCraftResponse,
  DiscoveredForgeCraftResponse,
  DiscoveredPillUseResponse,
  FormulaCraftResponse,
  ProductionCraftRequest,
  ProductionFormulaListQuery,
  ProductionFormulaListResponse,
  ProductionFormulaResponse,
  SaveProductionFormulaRequest,
} from "./production.formula-types";
import { ProductionService } from "./production.service";

@Controller("api/production")
@UseGuards(BearerAuthGuard)
export class ProductionController {
  constructor(@Inject(ProductionService) private readonly productionService: ProductionService) {}

  @Get("bag/items")
  bagItems(@Req() request: Request): Promise<BagSummaryResponse> {
    return this.productionService.getBagItems(requireAccountId(request));
  }

  @Post("bag/items/lock")
  setItemLock(
    @Body() body: SetItemLockRequest,
    @Req() request: Request,
  ): Promise<SetItemLockResponse> {
    return this.productionService.setItemLock({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("alchemy/records")
  alchemyRecords(@Req() request: Request): Promise<AlchemyRecordListResponse> {
    return this.productionService.getAlchemyRecords(requireAccountId(request));
  }

  @Post("alchemy/craft")
  craftAlchemy(
    @Body() body: ProductionCraftRequest,
    @Req() request: Request,
  ): Promise<DiscoveredAlchemyCraftResponse> {
    return this.productionService.craftAlchemy({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("pills/use")
  usePill(
    @Body() body: PillUseRequest,
    @Req() request: Request,
  ): Promise<DiscoveredPillUseResponse> {
    return this.productionService.usePill({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("forge/craft")
  craftForge(
    @Body() body: ProductionCraftRequest,
    @Req() request: Request,
  ): Promise<DiscoveredForgeCraftResponse> {
    return this.productionService.craftForge({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("materials")
  craftableMaterials(
    @Query("kind") kind: string | undefined,
    @Req() request: Request,
  ): Promise<ProductionCraftMaterialListResponse> {
    return this.productionService.getCraftableMaterials(
      requireAccountId(request),
      kind === "alchemy" || kind === "forge" ? kind : undefined,
    );
  }

  @Get("formulas")
  formulas(
    @Query() query: ProductionFormulaListQuery,
    @Req() request: Request,
  ): Promise<ProductionFormulaListResponse> {
    return this.productionService.listProductionFormulas(requireAccountId(request), query);
  }

  @Post("formulas")
  saveFormula(
    @Body() body: SaveProductionFormulaRequest,
    @Req() request: Request,
  ): Promise<ProductionFormulaResponse> {
    return this.productionService.saveProductionFormula({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("formulas/:formulaId/publish")
  publishFormula(
    @Param("formulaId") formulaId: string,
    @Req() request: Request,
  ): Promise<ProductionFormulaResponse> {
    return this.productionService.publishProductionFormula({
      accountId: requireAccountId(request),
      formulaId,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("formulas/:formulaId/unpublish")
  unpublishFormula(
    @Param("formulaId") formulaId: string,
    @Req() request: Request,
  ): Promise<ProductionFormulaResponse> {
    return this.productionService.unpublishProductionFormula({
      accountId: requireAccountId(request),
      formulaId,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("formulas/:formulaId/craft")
  craftFormula(
    @Param("formulaId") formulaId: string,
    @Req() request: Request,
  ): Promise<FormulaCraftResponse> {
    return this.productionService.craftProductionFormula({
      accountId: requireAccountId(request),
      formulaId,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("equipment")
  equipment(@Req() request: Request): Promise<EquipmentListResponse> {
    return this.productionService.listEquipment(requireAccountId(request));
  }

  @Get("equipment/records")
  equipmentRecords(@Req() request: Request): Promise<EquipmentOperationRecordListResponse> {
    return this.productionService.getEquipmentRecords(requireAccountId(request));
  }

  @Post("equipment/refine")
  refineEquipment(
    @Body() body: EquipmentTargetRequest,
    @Req() request: Request,
  ): Promise<EquipmentOperationResponse> {
    return this.productionService.refineEquipment({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("equipment/inscribe")
  inscribeEquipment(
    @Body() body: EquipmentInscribeRequest,
    @Req() request: Request,
  ): Promise<EquipmentOperationResponse> {
    return this.productionService.inscribeEquipment({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("equipment/decompose")
  decomposeEquipment(
    @Body() body: EquipmentTargetRequest,
    @Req() request: Request,
  ): Promise<EquipmentOperationResponse> {
    return this.productionService.decomposeEquipment({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("equipment/lock")
  setEquipmentLock(
    @Body() body: SetEquipmentLockRequest,
    @Req() request: Request,
  ): Promise<EquipmentOperationResponse> {
    return this.productionService.setEquipmentLock({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("skills/loadout")
  skillLoadout(@Req() request: Request): Promise<SkillLoadoutResponse> {
    return this.productionService.getSkillLoadout(requireAccountId(request));
  }

  @Post("skills/learn")
  learnSkill(
    @Body() body: LearnSkillRequest,
    @Req() request: Request,
  ): Promise<LearnSkillResponse> {
    return this.productionService.learnSkill({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("skills/loadout")
  saveSkillLoadout(
    @Body() body: SaveSkillLoadoutRequest,
    @Req() request: Request,
  ): Promise<SkillLoadoutResponse> {
    return this.productionService.saveSkillLoadout({
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
