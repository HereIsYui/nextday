import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { RiskController } from "./risk.controller";
import { RiskService } from "./risk.service";

@Module({
  imports: [DatabaseModule],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
