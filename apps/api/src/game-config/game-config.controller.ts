import { Controller, Get, Inject, Param } from "@nestjs/common";
import type { ConfigEnvelope } from "@nextday/shared";
import { GameConfigService } from "./game-config.service";

@Controller("api/config")
export class GameConfigController {
  constructor(@Inject(GameConfigService) private readonly gameConfigService: GameConfigService) {}

  @Get(":config_type")
  getConfig(@Param("config_type") configType: string): Promise<ConfigEnvelope> {
    return this.gameConfigService.getConfig(configType);
  }
}
