import { randomUUID } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthMeResponse, LoginResponse, PlayerSummary, PublicAccount } from "@nextday/shared";
import type { Account, Player } from "@prisma/client";
import type { Request } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { PrismaService } from "../database/prisma.service";
import { LogService } from "../log/log.service";
import type { AuthTokenPayload } from "./auth.types";

const defaultJwtSecret = "nextday-dev-secret";
const defaultJwtExpiresIn = "7d";

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(LogService) private readonly logService: LogService,
  ) {}

  async guestLogin(input: { device_id?: string; nickname?: string }, request: Request) {
    const normalizedDeviceId = input.device_id?.trim() || undefined;
    const nickname = input.nickname?.trim() || "过路修士";
    const account = normalizedDeviceId
      ? await this.prisma.account.upsert({
          where: { deviceId: normalizedDeviceId },
          create: {
            accountId: `acc_${randomUUID()}`,
            accountType: "guest",
            deviceId: normalizedDeviceId,
            username: nickname,
            lastLoginAt: new Date(),
          },
          update: {
            username: nickname,
            lastLoginAt: new Date(),
          },
          include: { player: true },
        })
      : await this.prisma.account.create({
          data: {
            accountId: `acc_${randomUUID()}`,
            accountType: "guest",
            username: nickname,
            lastLoginAt: new Date(),
          },
          include: { player: true },
        });

    await this.logService.writeLoginLog({
      accountId: account.accountId,
      playerId: account.player?.playerId ?? null,
      loginType: "guest",
      deviceId: normalizedDeviceId,
      request,
    });

    request.accountId = account.accountId;
    request.playerId = account.player?.playerId;

    return this.toLoginResponse(account, account.player ?? null);
  }

  async mockFishpiLogin(
    input: { fishpi_user_id: string; username: string },
    request: Request,
  ): Promise<LoginResponse> {
    const fishpiUserId = input.fishpi_user_id?.trim();
    const username = input.username?.trim();

    if (!fishpiUserId || !username) {
      throw new UnauthorizedException("模拟鱼排登录参数不完整");
    }

    const account = await this.prisma.account.upsert({
      where: { fishpiUserId },
      create: {
        accountId: `acc_${randomUUID()}`,
        accountType: "fishpi_mock",
        fishpiUserId,
        username,
        lastLoginAt: new Date(),
      },
      update: {
        username,
        lastLoginAt: new Date(),
      },
      include: { player: true },
    });

    await this.logService.writeLoginLog({
      accountId: account.accountId,
      playerId: account.player?.playerId ?? null,
      loginType: "mock_fishpi",
      request,
    });

    request.accountId = account.accountId;
    request.playerId = account.player?.playerId;

    return this.toLoginResponse(account, account.player ?? null);
  }

  async getMe(accountId: string): Promise<AuthMeResponse> {
    const account = await this.prisma.account.findUnique({
      where: { accountId },
      include: { player: true },
    });

    if (!account) {
      throw new UnauthorizedException("账号不存在");
    }

    return {
      account: toPublicAccount(account),
      player: account.player ? toPlayerSummary(account.player) : null,
    };
  }

  signToken(account: Account, player: Player | null): string {
    const payload: AuthTokenPayload = {
      sub: account.accountId,
      account_type: account.accountType,
      player_id: player?.playerId,
    };

    const signOptions: SignOptions = {
      expiresIn: (process.env.JWT_EXPIRES_IN ?? defaultJwtExpiresIn) as SignOptions["expiresIn"],
    };

    return jwt.sign(payload, getJwtSecret(), signOptions);
  }

  verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, getJwtSecret()) as AuthTokenPayload;
    } catch {
      throw new UnauthorizedException("登录状态无效或已过期");
    }
  }

  private toLoginResponse(account: Account, player: Player | null): LoginResponse {
    return {
      token: this.signToken(account, player),
      expires_in: process.env.JWT_EXPIRES_IN ?? defaultJwtExpiresIn,
      account: toPublicAccount(account),
      player: player ? toPlayerSummary(player) : null,
    };
  }
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET || defaultJwtSecret;
}

export function toPublicAccount(account: Account): PublicAccount {
  return {
    account_id: account.accountId,
    account_type: account.accountType,
    username: account.username,
    status: account.status,
    created_at: account.createdAt.toISOString(),
    last_login_at: account.lastLoginAt?.toISOString() ?? null,
  };
}

export function toPlayerSummary(player: Player): PlayerSummary {
  return {
    player_id: player.playerId,
    account_id: player.accountId,
    name: player.name,
    route: player.route as PlayerSummary["route"],
    alignment: player.alignment,
    current_realm: player.currentRealm,
    current_stage: player.currentStage,
    current_level: player.currentLevel,
    status: player.status,
  };
}
