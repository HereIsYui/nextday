import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { FactionsController } from "./factions.controller";
import { FactionsService } from "./factions.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [FactionsController],
  providers: [FactionsService],
  exports: [FactionsService],
})
export class FactionsModule {}
