import { HttpException, HttpStatus, Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { transientRateLimitConfig } from "../risk/risk.constants";

interface RateBucket {
  windowStartedAt: number;
  count: number;
}

const buckets = new Map<string, RateBucket>();
let lastSweepAt = Date.now();

@Injectable()
export class TransientRateLimitMiddleware implements NestMiddleware {
  use(request: Request, _response: Response, next: NextFunction) {
    sweepExpiredBuckets();
    const key = createRateLimitKey(request);
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now - bucket.windowStartedAt > transientRateLimitConfig.windowMs) {
      buckets.set(key, { windowStartedAt: now, count: 1 });
      next();
      return;
    }

    bucket.count += 1;
    if (bucket.count > transientRateLimitConfig.maxRequestsPerKey) {
      throw new HttpException("请求过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
    }

    next();
  }
}

function createRateLimitKey(request: Request): string {
  const path = (request.originalUrl ?? request.url).split("?")[0];
  return `${request.ip ?? "unknown"}:${request.method}:${path}`;
}

function sweepExpiredBuckets() {
  const now = Date.now();
  if (now - lastSweepAt < transientRateLimitConfig.sweepIntervalMs) {
    return;
  }
  lastSweepAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (now - bucket.windowStartedAt > transientRateLimitConfig.windowMs) {
      buckets.delete(key);
    }
  }
}
