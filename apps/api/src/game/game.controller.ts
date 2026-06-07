import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import type {
  BreakthroughResponse,
  CaveCollectResponse,
  CultivationClaimResponse,
  ExploreClaimRequest,
  ExploreCurrentResponse,
  ExploreEventListResponse,
  ExploreRequest,
  ExploreResponse,
  GameOverviewResponse,
  JournalListResponse,
  ResolveExploreEventRequest,
  ResolveExploreEventResponse,
  TaskClaimRequest,
  TaskClaimResponse,
  TaskSummaryResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { GameService } from "./game.service";

@Controller("api/game")
@UseGuards(BearerAuthGuard)
export class GameController {
  constructor(@Inject(GameService) private readonly gameService: GameService) {}

  @Get("overview")
  overview(@Req() request: Request): Promise<GameOverviewResponse> {
    return this.gameService.getOverview(requireAccountId(request));
  }

  @Get("provinces")
  provinces(@Req() request: Request) {
    return this.gameService.getProvinces(requireAccountId(request));
  }

  @Get("journal")
  journal(
    @Query("limit") limit: string | undefined,
    @Query("before") before: string | undefined,
    @Req() request: Request,
  ): Promise<JournalListResponse> {
    return this.gameService.getJournal(requireAccountId(request), { before, limit });
  }

  @Post("cultivation/claim")
  claimCultivation(@Req() request: Request): Promise<CultivationClaimResponse> {
    return this.gameService.claimCultivation({
      accountId: requireAccountId(request),
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("cultivation/breakthrough")
  breakthrough(@Req() request: Request): Promise<BreakthroughResponse> {
    return this.gameService.breakthrough({
      accountId: requireAccountId(request),
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("explore")
  explore(@Body() body: ExploreRequest, @Req() request: Request): Promise<ExploreResponse> {
    return this.gameService.explore({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("explore/current")
  currentExplore(@Req() request: Request): Promise<ExploreCurrentResponse> {
    return this.gameService.getCurrentExplore(requireAccountId(request));
  }

  @Post("explore/claim")
  claimExplore(
    @Body() body: ExploreClaimRequest,
    @Req() request: Request,
  ): Promise<ExploreResponse> {
    return this.gameService.claimExplore({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("explore/events")
  exploreEvents(
    @Query("status") status: string | undefined,
    @Query("limit") limit: string | undefined,
    @Req() request: Request,
  ): Promise<ExploreEventListResponse> {
    return this.gameService.getExploreEvents(requireAccountId(request), { limit, status });
  }

  @Post("explore/events/resolve")
  resolveExploreEvent(
    @Body() body: ResolveExploreEventRequest,
    @Req() request: Request,
  ): Promise<ResolveExploreEventResponse> {
    return this.gameService.resolveExploreEvent({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("tasks")
  tasks(@Req() request: Request): Promise<TaskSummaryResponse> {
    return this.gameService.getTasks(requireAccountId(request));
  }

  @Post("tasks/claim")
  claimTask(@Body() body: TaskClaimRequest, @Req() request: Request): Promise<TaskClaimResponse> {
    return this.gameService.claimTask({
      accountId: requireAccountId(request),
      taskId: body.task_id,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("cave/collect")
  collectCave(@Req() request: Request): Promise<CaveCollectResponse> {
    return this.gameService.collectCave({
      accountId: requireAccountId(request),
      idempotencyKey: requireIdempotencyKey(request),
    });
  }
}

function requireAccountId(request: Request): string {
  if (!request.accountId) {
    throw new Error("缺少账号上下文");
  }

  return request.accountId;
}

function requireIdempotencyKey(request: Request): string {
  const key = request.header("Idempotency-Key");
  if (!key) {
    throw new Error("缺少幂等键");
  }

  return key;
}
