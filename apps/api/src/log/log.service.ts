import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service";
import { getRequestIp, sha256Digest } from "../platform/utils/hash";

export interface LoginLogInput {
  accountId: string;
  playerId?: string | null;
  loginType: string;
  deviceId?: string;
  request: Request;
}

export interface AuditLogInput {
  accountId?: string | null;
  playerId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  beforeSnapshot?: Prisma.InputJsonValue | null;
  afterSnapshot?: Prisma.InputJsonValue | null;
  reason?: string | null;
  idempotencyKey?: string | null;
  configVersion?: string | null;
}

@Injectable()
export class LogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async writeLoginLog(input: LoginLogInput) {
    const requestHashes = getRequestHashes(input.request);
    await this.prisma.loginLog.create({
      data: {
        loginLogId: `login_${randomUUID()}`,
        accountId: input.accountId,
        playerId: input.playerId ?? null,
        loginType: input.loginType,
        deviceId: input.deviceId,
        clientVersion: input.request.header("X-Client-Version") ?? null,
        ipHash: requestHashes.ipHash,
        userAgentHash: requestHashes.userAgentHash,
      },
    });
  }

  async writeAuditLog(input: AuditLogInput) {
    await this.prisma.auditLog.create({
      data: {
        auditLogId: `audit_${randomUUID()}`,
        accountId: input.accountId ?? null,
        playerId: input.playerId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        beforeSnapshot: input.beforeSnapshot ?? undefined,
        afterSnapshot: input.afterSnapshot ?? undefined,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        configVersion: input.configVersion ?? null,
      },
    });
  }

  async writeBehaviorLog(input: { request: Request; statusCode: number; durationMs: number }) {
    const requestHashes = getRequestHashes(input.request);

    await this.prisma.behaviorLog.create({
      data: {
        behaviorLogId: `behavior_${randomUUID()}`,
        requestId: input.request.requestId ?? `req_${randomUUID()}`,
        accountId: input.request.accountId ?? null,
        playerId: input.request.playerId ?? null,
        method: input.request.method,
        path: input.request.originalUrl ?? input.request.url,
        statusCode: input.statusCode,
        durationMs: input.durationMs,
        idempotencyKey: input.request.header("Idempotency-Key") ?? null,
        clientVersion: input.request.header("X-Client-Version") ?? null,
        ipHash: requestHashes.ipHash,
        userAgentHash: requestHashes.userAgentHash,
      },
    });
  }

  async queryPlayerLogs(playerId: string, type: "behavior" | "audit" | "login" | "wallet") {
    switch (type) {
      case "audit":
        return this.prisma.auditLog.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
      case "login":
        return this.prisma.loginLog.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
      case "wallet":
        return this.prisma.walletLog.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
      default:
        return this.prisma.behaviorLog.findMany({
          where: { playerId },
          orderBy: { createdAt: "desc" },
          take: 50,
        });
    }
  }
}

function getRequestHashes(request: Request): {
  ipHash: string | null;
  userAgentHash: string | null;
} {
  return {
    ipHash: sha256Digest(getRequestIp({ ip: request.ip, headers: request.headers })),
    userAgentHash: sha256Digest(request.header("User-Agent")),
  };
}
