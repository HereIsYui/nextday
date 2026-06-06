import { Controller, ForbiddenException, Get, Inject, Param, Query, Req } from "@nestjs/common";
import type { AdminLogType, AdminPlayerLogsResponse } from "@nextday/shared";
import type { Request } from "express";
import { LogService } from "./log.service";

const validLogTypes = new Set(["behavior", "audit", "login", "wallet"]);

@Controller("api/admin/logs")
export class AdminLogsController {
  constructor(@Inject(LogService) private readonly logService: LogService) {}

  @Get("player/:player_id")
  async getPlayerLogs(
    @Param("player_id") playerId: string,
    @Query("type") type: string | undefined,
    @Req() request: Request,
  ): Promise<AdminPlayerLogsResponse> {
    assertAdminToken(request);
    const logType = normalizeLogType(type);
    const rows = await this.logService.queryPlayerLogs(playerId, logType);

    return {
      player_id: playerId,
      type: logType,
      rows: rows.map((row) => JSON.parse(JSON.stringify(row, bigintToString))),
    };
  }
}

function assertAdminToken(request: Request) {
  const expectedToken = process.env.ADMIN_DEV_TOKEN ?? "nextday-admin-dev";

  if (request.header("X-Admin-Token") !== expectedToken) {
    throw new ForbiddenException("开发后台令牌无效");
  }
}

function normalizeLogType(type: string | undefined): AdminLogType {
  if (type && validLogTypes.has(type)) {
    return type as AdminLogType;
  }

  return "behavior";
}

function bigintToString(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
