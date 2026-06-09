import { Controller, Get, Inject, Param, Req, UseGuards } from "@nestjs/common";
import type {
  BattleNarrativeResponse,
  EraChronicleResponse,
  StoryScrollDetailResponse,
  StoryScrollListResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { StoryService } from "./story.service";

@Controller("api/story")
@UseGuards(BearerAuthGuard)
export class StoryController {
  constructor(@Inject(StoryService) private readonly storyService: StoryService) {}

  @Get("scrolls")
  scrolls(@Req() request: Request): Promise<StoryScrollListResponse> {
    return this.storyService.getScrolls(requireAccountId(request));
  }

  @Get("scrolls/:scroll_id")
  scrollDetail(
    @Param("scroll_id") scrollId: string,
    @Req() request: Request,
  ): Promise<StoryScrollDetailResponse> {
    return this.storyService.getScrollDetail(requireAccountId(request), scrollId);
  }

  @Get("battle-narratives/:battle_id")
  battleNarrative(
    @Param("battle_id") battleId: string,
    @Req() request: Request,
  ): Promise<BattleNarrativeResponse> {
    return this.storyService.getBattleNarrative(requireAccountId(request), battleId);
  }

  @Get("era-chronicle")
  eraChronicle(@Req() request: Request): Promise<EraChronicleResponse> {
    return this.storyService.getEraChronicle(requireAccountId(request));
  }
}

function requireAccountId(request: Request): string {
  if (!request.accountId) {
    throw new Error("缺少账号上下文");
  }

  return request.accountId;
}
