import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  WorldChatListResponse,
  WorldChatMessageState,
  WorldChatSendRequest,
} from "@nextday/shared";
import type { Prisma } from "@prisma/client";
import { lockPlayerForTransaction } from "../database/player-transaction";
import { PrismaService } from "../database/prisma.service";
import { getRealmName, getRealmStageConfig } from "../game/realm-progression.constants";
import { toBagItemState } from "../production/production.mappers";

@Injectable()
export class ChatService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    accountId: string,
    input: { mapId?: string; after?: string; limit?: string },
  ): Promise<WorldChatListResponse> {
    const player = await this.requirePlayer(accountId);
    const mapId = normalizeMapId(input.mapId) ?? (await this.defaultMap(player.playerId));
    await this.ensureMapAccess(player.playerId, mapId);
    const after = input.after ? new Date(input.after) : null;
    const limit = Math.min(50, Math.max(1, Number(input.limit ?? 30) || 30));
    const rows = await this.prisma.worldChatMessage.findMany({
      where: {
        serverId: "default",
        mapId,
        ...(after && !Number.isNaN(after.getTime()) ? { createdAt: { gt: after } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: { player: { select: chatPlayerSelect } },
    });
    return {
      map_id: mapId,
      messages: rows.map(toChatMessage),
      next_cursor: rows.at(-1)?.createdAt.toISOString() ?? null,
    };
  }

  async send(input: {
    accountId: string;
    body: WorldChatSendRequest;
    idempotencyKey: string;
  }): Promise<WorldChatMessageState> {
    const content = String(input.body?.content ?? "").trim();
    if (!content || content.length > 240) {
      throw new BadRequestException("聊天内容不能为空且不能超过 240 字。");
    }
    const player = await this.requirePlayer(input.accountId);
    const mapId = normalizeMapId(input.body?.map_id) ?? (await this.defaultMap(player.playerId));
    await this.ensureMapAccess(player.playerId, mapId);
    return this.prisma.$transaction(async (tx) => {
      await lockPlayerForTransaction(tx, player.playerId);
      const existing = await tx.worldChatMessage.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { player: { select: chatPlayerSelect } },
      });
      if (existing) return toChatMessage(existing);
      let itemShare: Prisma.InputJsonValue | undefined;
      if (input.body.item_instance_id) {
        const item = await tx.playerItem.findFirst({
          where: {
            playerId: player.playerId,
            itemInstanceId: input.body.item_instance_id,
            count: { gt: 0 },
          },
        });
        if (!item) throw new BadRequestException("要分享的物品不存在或数量为零");
        const snapshot = toBagItemState(item);
        itemShare = {
          item_id: snapshot.item_id,
          name: snapshot.name,
          usage_hint: snapshot.usage_hint,
          category: snapshot.category,
          quality: snapshot.quality ?? null,
          count: snapshot.count,
          bind_type: snapshot.bind_type,
          tradeable: snapshot.tradeable,
          expired: snapshot.expired,
        } as unknown as Prisma.InputJsonValue;
      }
      const row = await tx.worldChatMessage.create({
        data: {
          messageId: `chat_${randomUUID()}`,
          playerId: player.playerId,
          eraId: "era_mvp_001",
          serverId: "default",
          mapId,
          playerName: player.name,
          content,
          ...(itemShare ? { itemShare } : {}),
          idempotencyKey: input.idempotencyKey,
        },
        include: { player: { select: chatPlayerSelect } },
      });
      return toChatMessage(row);
    });
  }

  private async requirePlayer(accountId: string) {
    const player = await this.prisma.player.findUnique({ where: { accountId } });
    if (!player) throw new BadRequestException("请先创建角色");
    return player;
  }

  private async defaultMap(playerId: string): Promise<string> {
    const action = await this.prisma.playerActionState.findUnique({ where: { playerId } });
    if (action?.activeActionProvinceId) return action.activeActionProvinceId;
    const province = await this.prisma.playerProvinceProgress.findFirst({
      where: { playerId, unlocked: true },
      orderBy: { createdAt: "asc" },
    });
    return province?.provinceId ?? "ji";
  }

  private async ensureMapAccess(playerId: string, mapId: string): Promise<void> {
    if (mapId === "all") return;
    const province = await this.prisma.playerProvinceProgress.findUnique({
      where: { playerId_provinceId: { playerId, provinceId: mapId } },
      select: { unlocked: true },
    });
    if (!province?.unlocked) throw new BadRequestException("当前角色尚未进入该州域");
  }
}

function toChatMessage(row: {
  messageId: string;
  mapId: string;
  playerId: string;
  playerName: string;
  content: string;
  itemShare: unknown;
  createdAt: Date;
  player?: ChatPlayerSnapshot | null;
}): WorldChatMessageState {
  const player = row.player;
  return {
    message_id: row.messageId,
    map_id: row.mapId,
    player_id: row.playerId,
    player_name: row.playerName,
    player_level_text: player ? formatPlayerLevel(player) : "修士",
    membership_tier: player ? getMembershipTier(player) : "free",
    content: row.content,
    item_share:
      row.itemShare && typeof row.itemShare === "object"
        ? (row.itemShare as WorldChatMessageState["item_share"])
        : null,
    created_at: row.createdAt.toISOString(),
  };
}

const chatPlayerSelect = {
  route: true,
  currentRealm: true,
  currentStage: true,
  currentLevel: true,
  vipState: { select: { vipLevel: true, activeUntil: true } },
  monthlyCards: { select: { activeUntil: true } },
} as const;

type ChatPlayerSnapshot = {
  route: string;
  currentRealm: number;
  currentStage: number;
  currentLevel: number;
  vipState: { vipLevel: number; activeUntil: Date | null } | null;
  monthlyCards: Array<{ activeUntil: Date }>;
};

function formatPlayerLevel(player: ChatPlayerSnapshot): string {
  const route = player.route === "body" ? "body" : "qi";
  const realmName = getRealmName(player.currentRealm, route);
  const stageName = getRealmStageConfig(player.currentRealm, player.currentStage, route).qiName;
  return `${realmName}·${stageName}·${player.currentLevel}级`;
}

function getMembershipTier(player: ChatPlayerSnapshot): WorldChatMessageState["membership_tier"] {
  const now = Date.now();
  const vipActive =
    player.vipState &&
    (player.vipState.activeUntil === null || player.vipState.activeUntil.getTime() > now) &&
    player.vipState.vipLevel > 0;
  if (vipActive) {
    return "vip";
  }
  if (player.monthlyCards.some((card) => card.activeUntil.getTime() > now)) {
    return "monthly";
  }
  return "free";
}

function normalizeMapId(value: string | undefined): string | null {
  const map = value?.trim().toLowerCase();
  return map && /^[a-z0-9_-]{1,32}$/u.test(map) ? map : null;
}
