import { Inject, type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AppearancePlusModule } from "./appearance-plus/appearance-plus.module";
import { AuthModule } from "./auth/auth.module";
import { CollectionModule } from "./collection/collection.module";
import { ChatModule } from "./chat/chat.module";
import { CommerceModule } from "./commerce/commerce.module";
import { DatabaseModule } from "./database/database.module";
import { EventsModule } from "./events/events.module";
import { FactionsModule } from "./factions/factions.module";
import { GameConfigModule } from "./game-config/game-config.module";
import { GameModule } from "./game/game.module";
import { HealthController } from "./health/health.controller";
import { InnerWorldModule } from "./inner-world/inner-world.module";
import { createBehaviorLogMiddleware } from "./log/behavior-log.middleware";
import { LogModule } from "./log/log.module";
import { LogService } from "./log/log.service";
import { MultiplayerModule } from "./multiplayer/multiplayer.module";
import { IdempotencyKeyMiddleware } from "./platform/idempotency-key.middleware";
import { RequestContextMiddleware } from "./platform/request-context.middleware";
import { TransientRateLimitMiddleware } from "./platform/transient-rate-limit.middleware";
import { PlayerModule } from "./player/player.module";
import { PluginModule } from "./plugin/plugin.module";
import { ProductionModule } from "./production/production.module";
import { RiskModule } from "./risk/risk.module";
import { SocialModule } from "./social/social.module";
import { StoryModule } from "./story/story.module";
import { TransferModule } from "./transfer/transfer.module";

@Module({
  imports: [
    DatabaseModule,
    LogModule,
    AppearancePlusModule,
    AuthModule,
    PlayerModule,
    CollectionModule,
    ChatModule,
    GameModule,
    GameConfigModule,
    ProductionModule,
    MultiplayerModule,
    CommerceModule,
    RiskModule,
    InnerWorldModule,
    FactionsModule,
    EventsModule,
    StoryModule,
    SocialModule,
    TransferModule,
    PluginModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  constructor(@Inject(LogService) private readonly logService: LogService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestContextMiddleware,
        createBehaviorLogMiddleware(this.logService),
        TransientRateLimitMiddleware,
        IdempotencyKeyMiddleware,
      )
      .forRoutes("*");
  }
}
