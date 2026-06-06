import { BadRequestException, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const stateChangingMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class IdempotencyKeyMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    if (stateChangingMethods.has(request.method) && !request.header("Idempotency-Key")) {
      throw new BadRequestException("状态变更接口必须提供 Idempotency-Key");
    }

    next();
  }
}
