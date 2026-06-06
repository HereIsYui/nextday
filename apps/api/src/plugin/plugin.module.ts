import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommerceModule } from "../commerce/commerce.module";
import { GameModule } from "../game/game.module";
import { MultiplayerModule } from "../multiplayer/multiplayer.module";
import { PluginController } from "./plugin.controller";
import { PluginService } from "./plugin.service";

@Module({
  imports: [AuthModule, GameModule, MultiplayerModule, CommerceModule],
  controllers: [PluginController],
  providers: [PluginService],
})
export class PluginModule {}
