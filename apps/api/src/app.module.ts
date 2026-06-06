import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { HealthController } from "./health/health.controller";
import { IdempotencyKeyMiddleware } from "./platform/idempotency-key.middleware";
import { RequestContextMiddleware } from "./platform/request-context.middleware";

@Module({
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, IdempotencyKeyMiddleware).forRoutes("*");
  }
}
