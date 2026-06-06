import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type {
  AdminConfigVersionListResponse,
  AdminGmOperationListResponse,
  AdminMailListResponse,
  AdminPlayerDigestResponse,
  AnnouncementListResponse,
  CreateAnnouncementRequest,
  CreateAnnouncementResponse,
  PublishAdminConfigRequest,
  PublishAdminConfigResponse,
  ResolveRiskRecordRequest,
  ResolveRiskRecordResponse,
  RollbackAdminConfigRequest,
  RollbackAdminConfigResponse,
  SendAdminMailRequest,
  SendAdminMailResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { AdminService } from "./admin.service";

@Controller("api/admin")
export class AdminController {
  constructor(@Inject(AdminService) private readonly adminService: AdminService) {}

  @Get("player-digest")
  playerDigest(
    @Query("player_id") playerId: string | undefined,
    @Req() request: Request,
  ): Promise<AdminPlayerDigestResponse> {
    assertAdminToken(request);
    return this.adminService.getPlayerDigest(requireQuery(playerId, "玩家 ID"));
  }

  @Get("mails")
  mails(
    @Query("player_id") playerId: string | undefined,
    @Req() request: Request,
  ): Promise<AdminMailListResponse> {
    assertAdminToken(request);
    return this.adminService.listMails(playerId);
  }

  @Post("mails/send")
  sendMail(
    @Body() body: SendAdminMailRequest,
    @Req() request: Request,
  ): Promise<SendAdminMailResponse> {
    assertAdminToken(request);
    return this.adminService.sendMail({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("announcements")
  announcements(@Req() request: Request): Promise<AnnouncementListResponse> {
    assertAdminToken(request);
    return this.adminService.listAnnouncements();
  }

  @Post("announcements")
  createAnnouncement(
    @Body() body: CreateAnnouncementRequest,
    @Req() request: Request,
  ): Promise<CreateAnnouncementResponse> {
    assertAdminToken(request);
    return this.adminService.createAnnouncement({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("configs")
  configs(
    @Query("config_type") configType: string | undefined,
    @Req() request: Request,
  ): Promise<AdminConfigVersionListResponse> {
    assertAdminToken(request);
    return this.adminService.listConfigVersions(configType);
  }

  @Post("configs/publish")
  publishConfig(
    @Body() body: PublishAdminConfigRequest,
    @Req() request: Request,
  ): Promise<PublishAdminConfigResponse> {
    assertAdminToken(request);
    return this.adminService.publishConfig({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("configs/rollback")
  rollbackConfig(
    @Body() body: RollbackAdminConfigRequest,
    @Req() request: Request,
  ): Promise<RollbackAdminConfigResponse> {
    assertAdminToken(request);
    return this.adminService.rollbackConfig({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("risk/resolve")
  resolveRisk(
    @Body() body: ResolveRiskRecordRequest,
    @Req() request: Request,
  ): Promise<ResolveRiskRecordResponse> {
    assertAdminToken(request);
    return this.adminService.resolveRiskRecord({
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("operations")
  operations(@Req() request: Request): Promise<AdminGmOperationListResponse> {
    assertAdminToken(request);
    return this.adminService.listOperations();
  }
}

function assertAdminToken(request: Request) {
  const expectedToken = process.env.ADMIN_DEV_TOKEN ?? "nextday-admin-dev";

  if (request.header("X-Admin-Token") !== expectedToken) {
    throw new ForbiddenException("开发后台令牌无效");
  }
}

function requireQuery(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException(`缺少${label}`);
  }

  return normalized;
}

function requireIdempotencyKey(request: Request): string {
  const key = request.header("Idempotency-Key");
  if (!key) {
    throw new BadRequestException("缺少幂等键");
  }

  return key;
}
