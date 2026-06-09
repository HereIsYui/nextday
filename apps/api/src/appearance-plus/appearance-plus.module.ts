import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { AppearancePlusController } from "./appearance-plus.controller";
import { AppearancePlusService } from "./appearance-plus.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AppearancePlusController],
  providers: [AppearancePlusService],
  exports: [AppearancePlusService],
})
export class AppearancePlusModule {}
