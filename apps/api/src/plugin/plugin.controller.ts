import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  PluginExpandedPanelResponse,
  PluginNavigationLinksResponse,
  PluginQuickClaimRequest,
  PluginQuickClaimResponse,
  PluginStatusCardResponse,
  PluginSubmitPresetRequest,
  PluginSubmitPresetResponse,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { PluginService } from "./plugin.service";

@Controller("api/plugin")
@UseGuards(BearerAuthGuard)
export class PluginController {
  constructor(@Inject(PluginService) private readonly pluginService: PluginService) {}

  @Get("status-card")
  statusCard(@Req() request: Request): Promise<PluginStatusCardResponse> {
    return this.pluginService.getStatusCard(requireAccountId(request));
  }

  @Get("expanded-panel")
  expandedPanel(@Req() request: Request): Promise<PluginExpandedPanelResponse> {
    return this.pluginService.getExpandedPanel(requireAccountId(request));
  }

  @Post("quick-claim")
  quickClaim(
    @Body() body: PluginQuickClaimRequest,
    @Req() request: Request,
  ): Promise<PluginQuickClaimResponse> {
    return this.pluginService.quickClaim({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("submit-preset")
  submitPreset(
    @Body() body: PluginSubmitPresetRequest,
    @Req() request: Request,
  ): Promise<PluginSubmitPresetResponse> {
    return this.pluginService.submitPreset({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Get("navigation-links")
  navigationLinks(): PluginNavigationLinksResponse {
    return this.pluginService.getNavigationLinks();
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
