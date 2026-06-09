import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { MentorController, SectDiplomacyController, SectHireController } from "./social.controller";
import { SocialService } from "./social.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [MentorController, SectDiplomacyController, SectHireController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
