import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import type { HealthStatus } from "@nextday/shared";

@Controller()
export class HealthController {
  @Get("health")
  getHealth(): HealthStatus {
    return {
      status: "ok",
      service: "nextday-api",
      version: "0.0.0",
    };
  }

  @Post("health/idempotency-example")
  @HttpCode(200)
  checkIdempotencyExample() {
    return {
      accepted: true,
    };
  }
}
