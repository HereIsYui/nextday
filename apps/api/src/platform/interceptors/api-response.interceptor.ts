import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { createSuccessResponse } from "@nextday/shared";
import type { Request } from "express";
import { type Observable, map } from "rxjs";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    return next
      .handle()
      .pipe(map((data) => createSuccessResponse(data, request.requestId ?? "req_unknown")));
  }
}
