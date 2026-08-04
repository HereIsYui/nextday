import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database/database.module";
import { StoryController } from "./story.controller";
import { StoryService } from "./story.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [StoryController],
  providers: [StoryService],
  exports: [StoryService],
})
export class StoryModule {}
