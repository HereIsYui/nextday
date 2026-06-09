import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { TransferAdminController, TransferController } from "./transfer.controller";
import { TransferService } from "./transfer.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [TransferController, TransferAdminController],
  providers: [TransferService],
  exports: [TransferService],
})
export class TransferModule {}
