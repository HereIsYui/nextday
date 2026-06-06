import { BadRequestException, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const exemptPaths = new Set(["/api/auth/guest-login", "/api/auth/mock-fishpi-login"]);

@Injectable()
export class IdempotencyKeyMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    const path = (request.originalUrl ?? request.url).split("?")[0];

    if (
      stateChangingMethods.has(request.method) &&
      !exemptPaths.has(path) &&
      !request.header("Idempotency-Key")
    ) {
      throw new BadRequestException("状态变更接口必须提供 Idempotency-Key");
    }

    next();
  }
}
