import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { WorldMapResponse, WorldProvinceListResponse } from "@nextday/shared";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { WorldService } from "./world.service";

@Controller("api/world")
@UseGuards(BearerAuthGuard)
export class WorldController {
  constructor(@Inject(WorldService) private readonly worldService: WorldService) {}

  @Get("provinces")
  provinces(): WorldProvinceListResponse {
    return this.worldService.getProvinces();
  }

  @Get("map")
  map(@Query("province_id") provinceId: string | undefined): WorldMapResponse {
    return this.worldService.getMap({ provinceId });
  }
}
