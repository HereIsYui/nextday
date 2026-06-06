import { Inject, type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DatabaseModule } from "./database/database.module";
import { GameConfigModule } from "./game-config/game-config.module";
import { HealthController } from "./health/health.controller";
import { createBehaviorLogMiddleware } from "./log/behavior-log.middleware";
import { LogModule } from "./log/log.module";
import { LogService } from "./log/log.service";
import { IdempotencyKeyMiddleware } from "./platform/idempotency-key.middleware";
import { RequestContextMiddleware } from "./platform/request-context.middleware";
import { PlayerModule } from "./player/player.module";

@Module({
  imports: [DatabaseModule, LogModule, AuthModule, PlayerModule, GameConfigModule],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  constructor(@Inject(LogService) private readonly logService: LogService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        RequestContextMiddleware,
        createBehaviorLogMiddleware(this.logService),
        IdempotencyKeyMiddleware,
      )
      .forRoutes("*");
  }
}
