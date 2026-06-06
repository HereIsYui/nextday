import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from "@nestjs/common";
import { ErrorCode } from "@nextday/shared";
import type { Request, Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof Error ? exception.message : "系统异常";

    response.status(status).json({
      code: getErrorCode(exception, status),
      message,
      server_time: Math.floor(Date.now() / 1000),
      data: null,
      trace_id: request.requestId ?? "req_unknown",
    });
  }
}

function getErrorCode(exception: unknown, status: number): number {
  if (exception instanceof UnauthorizedException) {
    return ErrorCode.authRequired;
  }

  if (exception instanceof ForbiddenException) {
    return ErrorCode.entitlementRequired;
  }

  if (status === HttpStatus.TOO_MANY_REQUESTS) {
    return ErrorCode.rateLimited;
  }

  return status >= 500 ? ErrorCode.systemError : ErrorCode.validationFailed;
}
