import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./platform/configure-app";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  let isClosing = false;
  const shutdown = async () => {
    if (isClosing) {
      return;
    }
    isClosing = true;

    // 开发监视器会等待子进程退出；给 Nest/Prisma 一个有限的清理窗口，避免旧进程卡住热重载。
    const forceExitTimer = setTimeout(() => {
      process.exit(0);
    }, 4_000);
    forceExitTimer.unref();

    try {
      await app.close();
    } finally {
      clearTimeout(forceExitTimer);
      process.exit(0);
    }
  };

  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
}

void bootstrap().catch((error) => {
  console.error("API 启动失败", error);
  process.exitCode = 1;
});
