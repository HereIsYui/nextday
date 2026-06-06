import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RiskModule } from "../risk/risk.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [DatabaseModule, RiskModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
