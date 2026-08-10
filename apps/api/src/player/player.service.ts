import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  CreatePlayerRequest,
  CreatePlayerResponse,
  CultivationRoute,
  PlayerProfileResponse,
} from "@nextday/shared";
import type { Prisma } from "@prisma/client";
import { lockAccountForTransaction } from "../database/player-transaction";
import { PrismaService } from "../database/prisma.service";
import { getCultivationRatePerHour } from "../game/cultivation-progress";
import { createInitialTaskRows, defaultEraId } from "../game/game.constants";
import { hashRequestBody } from "../platform/utils/hash";
import { toPlayerProfileResponse } from "./player.mapper";

const validRoutes = new Set<CultivationRoute>(["qi", "body"]);
const defaultProvinceIds = ["ji", "yan", "qing", "xu"] as const;

@Injectable()
export class PlayerService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getProfile(accountId: string): Promise<PlayerProfileResponse> {
    const player = await this.prisma.player.findUnique({
      where: { accountId },
      include: { progress: true, wallet: true },
    });

    return toPlayerProfileResponse({
      player,
      progress: player?.progress ?? null,
      wallet: player?.wallet ?? null,
    });
  }

  async createPlayer(input: {
    accountId: string;
    body: CreatePlayerRequest;
    idempotencyKey: string;
    endpoint: string;
  }): Promise<CreatePlayerResponse> {
    const normalizedBody = normalizeCreatePlayerBody(input.body);
    const requestHash = hashRequestBody(normalizedBody);
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existingRecord) {
      if (
        existingRecord.accountId !== input.accountId ||
        existingRecord.endpoint !== input.endpoint ||
        existingRecord.requestHash !== requestHash
      ) {
        throw new BadRequestException("幂等键已被其他请求使用");
      }

      return existingRecord.responseData as unknown as CreatePlayerResponse;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockAccountForTransaction(tx, input.accountId);
        const concurrentRecord = await tx.idempotencyRecord.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (concurrentRecord) {
          if (
            concurrentRecord.accountId !== input.accountId ||
            concurrentRecord.endpoint !== input.endpoint ||
            concurrentRecord.requestHash !== requestHash
          ) {
            throw new BadRequestException("幂等键已被其他请求使用");
          }
          return concurrentRecord.responseData as unknown as CreatePlayerResponse;
        }
        const account = await tx.account.findUnique({
          where: { accountId: input.accountId },
          include: { player: true },
        });

        if (!account) {
          throw new BadRequestException("账号不存在");
        }

        if (account.player) {
          throw new BadRequestException("该账号已经创建角色");
        }

        const occupiedPlayer = await tx.player.findUnique({
          where: { name: normalizedBody.name },
          select: { playerId: true },
        });
        if (occupiedPlayer) {
          throw new BadRequestException("道号已被占用，请更换后重试");
        }

        const playerId = `player_${randomUUID()}`;
        const player = await tx.player.create({
          data: {
            playerId,
            accountId: account.accountId,
            name: normalizedBody.name,
            route: normalizedBody.route,
          },
        });
        const progress = await tx.playerProgress.create({
          data: {
            playerId,
            eraId: defaultEraId,
            cultivationRatePerHour: getCultivationRatePerHour(1),
            lastCultivationAt: new Date(Date.now() - 30 * 60 * 1000),
            newbieProtectionUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        const wallet = await tx.playerWallet.create({
          data: {
            playerId,
          },
        });
        await tx.playerActionState.create({
          data: {
            playerId,
            eraId: defaultEraId,
          },
        });
        await tx.playerCaveState.create({
          data: {
            playerId,
            lastCollectedAt: new Date(Date.now() - 30 * 60 * 1000),
          },
        });
        await tx.playerProvinceProgress.createMany({
          data: defaultProvinceIds.map((provinceId) => ({
            provinceProgressId: `province_progress_${randomUUID()}`,
            playerId,
            eraId: defaultEraId,
            provinceId,
            unlocked: provinceId === "ji",
          })),
        });
        await tx.playerTaskState.createMany({
          data: createInitialTaskRows(playerId),
        });

        const responseData: CreatePlayerResponse = {
          record_id: `create_player_${randomUUID()}`,
          profile: toPlayerProfileResponse({ player, progress, wallet }),
        };

        await tx.auditLog.create({
          data: {
            auditLogId: `audit_${randomUUID()}`,
            accountId: account.accountId,
            playerId,
            action: "player_create",
            targetType: "player",
            targetId: playerId,
            afterSnapshot: responseData.profile as unknown as Prisma.InputJsonValue,
            reason: "开发期创建角色",
            idempotencyKey: input.idempotencyKey,
            configVersion: "m1_minimal_player_v1",
          },
        });

        await tx.idempotencyRecord.create({
          data: {
            idempotencyKey: input.idempotencyKey,
            accountId: account.accountId,
            endpoint: input.endpoint,
            requestHash,
            responseData: responseData as unknown as Prisma.InputJsonValue,
            statusCode: 200,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        return responseData;
      });
    } catch (error) {
      if (isPlayerNameUniqueConstraintError(error)) {
        throw new BadRequestException("道号已被占用，请更换后重试");
      }

      throw error;
    }
  }
}

function normalizeCreatePlayerBody(body: CreatePlayerRequest): CreatePlayerRequest {
  const name = body?.name?.trim();
  const route = body?.route;

  if (!name || name.length < 2 || name.length > 16) {
    throw new BadRequestException("角色名需为 2-16 个字符");
  }

  if (!validRoutes.has(route)) {
    throw new BadRequestException("修行路线只能选择 qi 或 body");
  }

  return { name, route };
}

function isPlayerNameUniqueConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") {
    return false;
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (Array.isArray(target)) {
    return target.includes("name");
  }

  return target === "name" || (typeof target === "string" && target.includes("name"));
}
