import type { INestApplication } from "@nestjs/common";
import { ApiExceptionFilter } from "./filters/api-exception.filter";
import { ApiResponseInterceptor } from "./interceptors/api-response.interceptor";

const defaultCorsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
  "http://localhost:3010",
  "http://127.0.0.1:3010",
  "http://localhost:3012",
  "http://127.0.0.1:3012",
];

export function configureApp(app: INestApplication) {
  app.enableCors({
    origin: getCorsOrigins(),
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-Client-Version",
      "X-Request-Id",
      "X-Admin-Token",
    ],
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.enableShutdownHooks();
}

function getCorsOrigins(): string[] {
  const configuredOrigins = process.env.CORS_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : defaultCorsOrigins;
}
