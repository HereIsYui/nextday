import { Module } from "@nestjs/common";
import { LogModule } from "../log/log.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { BearerAuthGuard } from "./bearer-auth.guard";

@Module({
  imports: [LogModule],
  controllers: [AuthController],
  providers: [AuthService, BearerAuthGuard],
  exports: [AuthService, BearerAuthGuard],
})
export class AuthModule {}
