import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CommerceModule } from "../commerce/commerce.module";
import { FactionsModule } from "../factions/factions.module";
import { GameModule } from "../game/game.module";
import { InnerWorldModule } from "../inner-world/inner-world.module";
import { MultiplayerModule } from "../multiplayer/multiplayer.module";
import { PluginController } from "./plugin.controller";
import { PluginService } from "./plugin.service";

@Module({
  imports: [
    AuthModule,
    GameModule,
    MultiplayerModule,
    CommerceModule,
    InnerWorldModule,
    FactionsModule,
  ],
  controllers: [PluginController],
  providers: [PluginService],
})
export class PluginModule {}
