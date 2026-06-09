import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  AppearancePlusCatalogResponse,
  EquipAppearancePlusRequest,
  EquipAppearancePlusResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { AppearancePlusService } from "./appearance-plus.service";

@Controller("api/appearance-plus")
@UseGuards(BearerAuthGuard)
export class AppearancePlusController {
  constructor(
    @Inject(AppearancePlusService) private readonly appearancePlusService: AppearancePlusService,
  ) {}

  @Get("catalog")
  catalog(@Req() request: Request): Promise<AppearancePlusCatalogResponse> {
    return this.appearancePlusService.getCatalog(requireAccountId(request));
  }

  @Post("equip")
  equip(
    @Body() body: EquipAppearancePlusRequest,
    @Req() request: Request,
  ): Promise<EquipAppearancePlusResponse> {
    return this.appearancePlusService.equip({
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
    throw new Error("缺少 Idempotency-Key");
  }

  return key;
}
