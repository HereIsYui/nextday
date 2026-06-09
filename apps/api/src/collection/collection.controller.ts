import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  CollectionSummaryResponse,
  EquipCollectionDisplayRequest,
  EquipCollectionDisplayResponse,
  EraMuseumResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { CollectionService } from "./collection.service";

@Controller("api/collection")
@UseGuards(BearerAuthGuard)
export class CollectionController {
  constructor(@Inject(CollectionService) private readonly collectionService: CollectionService) {}

  @Get("summary")
  summary(@Req() request: Request): Promise<CollectionSummaryResponse> {
    return this.collectionService.getSummary(requireAccountId(request));
  }

  @Get("museum")
  museum(@Req() request: Request): Promise<EraMuseumResponse> {
    return this.collectionService.getMuseum(requireAccountId(request));
  }

  @Post("display/equip")
  equipDisplay(
    @Body() body: EquipCollectionDisplayRequest,
    @Req() request: Request,
  ): Promise<EquipCollectionDisplayResponse> {
    return this.collectionService.equipDisplay({
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
