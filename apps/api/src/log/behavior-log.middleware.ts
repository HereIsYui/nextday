import type { NextFunction, Request, Response } from "express";
import type { LogService } from "./log.service";

export function createBehaviorLogMiddleware(logService: LogService) {
  return (request: Request, response: Response, next: NextFunction) => {
    request.startedAt = Date.now();

    response.on("finish", () => {
      const durationMs = Math.max(0, Date.now() - (request.startedAt ?? Date.now()));
      logService
        .writeBehaviorLog({
          request,
          statusCode: response.statusCode,
          durationMs,
        })
        .catch(() => {
          // 行为日志不能反向影响用户请求，失败留给后续监控处理。
        });
    });

    next();
  };
}
