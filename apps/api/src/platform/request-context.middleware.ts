import { randomUUID } from "node:crypto";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const requestId = request.header("X-Request-Id") ?? `req_${randomUUID()}`;
    request.requestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  }
}
