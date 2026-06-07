import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { InnerWorldController } from "./inner-world.controller";
import { InnerWorldService } from "./inner-world.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InnerWorldController],
  providers: [InnerWorldService],
  exports: [InnerWorldService],
})
export class InnerWorldModule {}
