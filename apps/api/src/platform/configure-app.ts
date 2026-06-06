import type { INestApplication } from "@nestjs/common";
import { ApiExceptionFilter } from "./filters/api-exception.filter";
import { ApiResponseInterceptor } from "./interceptors/api-response.interceptor";

export function configureApp(app: INestApplication) {
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.enableShutdownHooks();
}
