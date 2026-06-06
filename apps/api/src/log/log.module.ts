import { Module } from "@nestjs/common";
import { AdminLogsController } from "./admin-logs.controller";
import { LogService } from "./log.service";

@Module({
  controllers: [AdminLogsController],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}
