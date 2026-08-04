import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MultiplayerModule } from "../multiplayer/multiplayer.module";
import { ProductionModule } from "../production/production.module";
import { StoryModule } from "../story/story.module";
import { GameCommandService } from "./game-command.service";
import { GameController } from "./game.controller";
import { GameService } from "./game.service";

@Module({
  imports: [AuthModule, MultiplayerModule, ProductionModule, StoryModule],
  controllers: [GameController],
  providers: [GameService, GameCommandService],
  exports: [GameService],
})
export class GameModule {}
