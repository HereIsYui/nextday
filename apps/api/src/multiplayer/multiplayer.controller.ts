import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type {
  CreateSectRequest,
  JoinSectRequest,
  PvpAttackRequest,
  PvpBattleResponse,
  RankListResponse,
  RankType,
  ResourcePointListResponse,
  SectDetailResponse,
  SectListResponse,
  SectMutationResponse,
  SectTaskResponse,
  SectWarehouseDepositRequest,
  SectWarehouseResponse,
  SectWarehouseWithdrawRequest,
  TowerActionRequest,
  TowerActionResponse,
  TowerListResponse,
  WorldBossChallengeRequest,
  WorldBossChallengeResponse,
  WorldBossResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { MultiplayerService } from "./multiplayer.service";

@Controller("api/multiplayer")
@UseGuards(BearerAuthGuard)
export class MultiplayerController {
  constructor(
    @Inject(MultiplayerService) private readonly multiplayerService: MultiplayerService,
  ) {}

  @Get("towers")
  towers(): Promise<TowerListResponse> {
    return this.multiplayerService.getTowers();
  }

  @Post("towers/action")
  towerAction(
    @Body() body: TowerActionRequest,
    @Req() request: Request,
  ): Promise<TowerActionResponse> {
    return this.multiplayerService.submitTowerAction({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("boss")
  boss(): Promise<WorldBossResponse> {
    return this.multiplayerService.getWorldBoss();
  }

  @Post("boss/challenge")
  challengeBoss(
    @Body() body: WorldBossChallengeRequest,
    @Req() request: Request,
  ): Promise<WorldBossChallengeResponse> {
    return this.multiplayerService.challengeWorldBoss({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("sects")
  sects(@Req() request: Request): Promise<SectListResponse> {
    return this.multiplayerService.listSects(requireAccountId(request));
  }

  @Get("sects/me")
  mySect(@Req() request: Request): Promise<SectDetailResponse> {
    return this.multiplayerService.getMySect(requireAccountId(request));
  }

  @Post("sects/create")
  createSect(
    @Body() body: CreateSectRequest,
    @Req() request: Request,
  ): Promise<SectMutationResponse> {
    return this.multiplayerService.createSect({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("sects/join")
  joinSect(@Body() body: JoinSectRequest, @Req() request: Request): Promise<SectMutationResponse> {
    return this.multiplayerService.joinSect({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("sects/tasks/complete")
  completeSectTask(
    @Body() body: { task_id: string },
    @Req() request: Request,
  ): Promise<SectTaskResponse> {
    return this.multiplayerService.completeSectTask({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("sects/warehouse/deposit")
  depositWarehouse(
    @Body() body: SectWarehouseDepositRequest,
    @Req() request: Request,
  ): Promise<SectWarehouseResponse> {
    return this.multiplayerService.depositWarehouse({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("sects/warehouse/withdraw")
  withdrawWarehouse(
    @Body() body: SectWarehouseWithdrawRequest,
    @Req() request: Request,
  ): Promise<SectWarehouseResponse> {
    return this.multiplayerService.withdrawWarehouse({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("resource-points")
  resourcePoints(): Promise<ResourcePointListResponse> {
    return this.multiplayerService.getResourcePoints();
  }

  @Post("pvp/attack")
  pvpAttack(@Body() body: PvpAttackRequest, @Req() request: Request): Promise<PvpBattleResponse> {
    return this.multiplayerService.attackPlayer({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("ranks/:rankType")
  ranks(@Param("rankType") rankType: RankType): Promise<RankListResponse> {
    return this.multiplayerService.getRankList(rankType);
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
