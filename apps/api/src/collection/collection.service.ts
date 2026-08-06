import { randomUUID } from "node:crypto";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type {
  CollectionSummaryResponse,
  EquipCollectionDisplayRequest,
  EquipCollectionDisplayResponse,
  EraMuseumResponse,
} from "@nextday/shared";
import type { Player, PlayerProgress, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { hashRequestBody } from "../platform/utils/hash";
import { toEraChronicleEntry } from "../story/story.mappers";
import {
  type EraCollectionConfig,
  collectionBlessingCapPercent,
  collectionConfigVersion,
  collectionDisplaySlots,
  collectionRewardBoundaryVersion,
  collectionRulesetVersion,
  eraCollectionConfigs,
} from "./collection.constants";
import {
  buildCollectionBlessingSummary,
  toCollectionDisplaySlots,
  toEraCollectionItem,
} from "./collection.mappers";

type PlayerWithProgress = Player & { progress: PlayerProgress | null };
type Tx = Prisma.TransactionClient;

@Injectable()
export class CollectionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getSummary(accountId: string): Promise<CollectionSummaryResponse> {
    const player = await this.requirePlayer(accountId);
    const eraId = player.progress?.eraId ?? "era_mvp_001";
    await this.ensureMuseumChronicleRecords(eraId);
    const records = await this.ensureCollectionRecords(player);
    const recordByCollectionId = new Map(records.map((record) => [record.collectionId, record]));
    const collections = eraCollectionConfigs.map((config) =>
      toEraCollectionItem(config, recordByCollectionId.get(config.collectionId) ?? null),
    );
    const chronicleRecords = await this.prisma.eraChronicleRecord.findMany({
      where: { eraId, visibilityRule: { in: ["public", "server"] } },
      orderBy: [{ chronicleType: "asc" }, { createdAt: "desc" }],
    });

    return {
      collections,
      display_slots: toCollectionDisplaySlots(collections),
      chronicle_entries: chronicleRecords.map(toEraChronicleEntry),
      blessing_summary: buildCollectionBlessingSummary(collections),
      config_version: collectionConfigVersion,
      ruleset_version: collectionRulesetVersion,
    };
  }

  async getMuseum(accountId: string): Promise<EraMuseumResponse> {
    const summary = await this.getSummary(accountId);

    return {
      entries: summary.chronicle_entries,
      featured_collections: summary.collections
        .filter((collection) => collection.owned)
        .sort((a, b) => rarityWeight(b.rarity) - rarityWeight(a.rarity))
        .slice(0, 4),
      sensitive_filtered: true,
      config_version: collectionConfigVersion,
    };
  }

  async equipDisplay(input: {
    accountId: string;
    body: EquipCollectionDisplayRequest;
    idempotencyKey: string;
  }): Promise<EquipCollectionDisplayResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeEquipRequest(input.body);
    const slot = collectionDisplaySlots.find((item) => item.slotId === body.display_slot);
    if (!slot) {
      throw new BadRequestException("展示栏不存在");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/collection/display/equip",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.ensureCollectionRecords(player, tx);
        const record = await tx.eraCollectionRecord.findUnique({
          where: {
            playerId_collectionId: {
              playerId: player.playerId,
              collectionId: body.collection_id,
            },
          },
        });
        if (!record) {
          throw new BadRequestException("尚未拥有该收藏");
        }
        if (!slot.allowedTypes.includes(record.collectionType)) {
          throw new BadRequestException("该收藏不能放入所选展示栏");
        }

        await tx.eraCollectionRecord.updateMany({
          where: { playerId: player.playerId, displaySlot: body.display_slot },
          data: { displaySlot: null },
        });
        const equipped = await tx.eraCollectionRecord.update({
          where: { collectionRecordId: record.collectionRecordId },
          data: { displaySlot: body.display_slot },
        });
        const records = await tx.eraCollectionRecord.findMany({
          where: { playerId: player.playerId },
        });
        const recordByCollectionId = new Map(
          records.map((collectionRecord) => [collectionRecord.collectionId, collectionRecord]),
        );
        const collections = eraCollectionConfigs.map((config) =>
          toEraCollectionItem(config, recordByCollectionId.get(config.collectionId) ?? null),
        );
        const config = requireCollectionConfig(equipped.collectionId);

        return {
          record_id: `collection_display_${randomUUID()}`,
          collection: toEraCollectionItem(config, equipped),
          display_slots: toCollectionDisplaySlots(collections),
          blessing_summary: buildCollectionBlessingSummary(collections),
        };
      },
    });
  }

  private async requirePlayer(accountId: string): Promise<PlayerWithProgress> {
    const player = await this.prisma.player.findUnique({
      where: { accountId },
      include: { progress: true },
    });

    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
  }

  private async ensureCollectionRecords(
    player: PlayerWithProgress,
    client: Tx | PrismaService = this.prisma,
  ) {
    const eraId = player.progress?.eraId ?? "era_mvp_001";
    const [scrolls, chronicles, appearances, treasures] = await Promise.all([
      client.storyScrollRecord.findMany({
        where: { playerId: player.playerId, eraId },
      }),
      client.eraChronicleRecord.findMany({
        where: { eraId, visibilityRule: { in: ["public", "server"] } },
      }),
      client.playerAppearance.findMany({
        where: { playerId: player.playerId },
      }),
      client.ancientTreasureState.findMany({
        where: { playerId: player.playerId, eraId, owned: true },
      }),
    ]);

    const unlockContext = {
      chapterId: player.progress?.chapterId ?? 1,
      scrollIds: new Set(scrolls.map((record) => record.scrollId)),
      chronicleTypes: new Set(chronicles.map((record) => record.chronicleType)),
      appearanceById: new Map(
        appearances.map((appearance) => [appearance.appearanceId, appearance]),
      ),
      hasAncientTreasure: treasures.length > 0,
    };
    const unlockedConfigs = eraCollectionConfigs.filter((config) =>
      isCollectionUnlocked(config, unlockContext),
    );

    await Promise.all(
      unlockedConfigs.map((config) => {
        const appearance = config.unlock.appearanceId
          ? unlockContext.appearanceById.get(config.unlock.appearanceId)
          : null;

        return client.eraCollectionRecord.upsert({
          where: {
            playerId_collectionId: {
              playerId: player.playerId,
              collectionId: config.collectionId,
            },
          },
          create: {
            collectionRecordId: `era_collection_${randomUUID()}`,
            playerId: player.playerId,
            eraId,
            collectionId: config.collectionId,
            collectionType: config.collectionType,
            sourceType: config.sourceType,
            sourceId: config.sourceId,
            rarity: config.rarity,
            inherited: appearance?.inherited ?? false,
            duplicateCount: 0,
            displayLevel: 1,
            blessingPercent: Math.min(config.blessingPercent, collectionBlessingCapPercent),
            displayPayload: buildDisplayPayload(config) as unknown as Prisma.InputJsonValue,
            inheritRule: config.inheritRule,
            configVersion: collectionConfigVersion,
            rulesetVersion: collectionRulesetVersion,
            rewardBoundaryVersion: collectionRewardBoundaryVersion,
          },
          update: {
            collectionType: config.collectionType,
            sourceType: config.sourceType,
            sourceId: config.sourceId,
            rarity: config.rarity,
            inherited: appearance?.inherited ?? undefined,
            blessingPercent: Math.min(config.blessingPercent, collectionBlessingCapPercent),
            displayPayload: buildDisplayPayload(config) as unknown as Prisma.InputJsonValue,
            inheritRule: config.inheritRule,
            configVersion: collectionConfigVersion,
            rulesetVersion: collectionRulesetVersion,
            rewardBoundaryVersion: collectionRewardBoundaryVersion,
          },
        });
      }),
    );

    return client.eraCollectionRecord.findMany({
      where: { playerId: player.playerId },
      orderBy: [{ acquiredAt: "asc" }, { collectionId: "asc" }],
    });
  }

  private async ensureMuseumChronicleRecords(eraId: string): Promise<void> {
    const [collectionCount, latestRank, latestChronicles] = await Promise.all([
      this.prisma.eraCollectionRecord.count({ where: { eraId } }),
      this.prisma.rankSnapshot.findFirst({
        where: { eraId },
        orderBy: { generatedAt: "desc" },
      }),
      this.prisma.eraChronicleRecord.findMany({
        where: { eraId },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
    ]);

    const records = [
      {
        type: "tower",
        title: "九塔纪事",
        summary: "史册记录九塔公开进度，收藏馆只取可展示片段。",
        highlights: ["九州九塔可入博物志", "展示不改变九塔贡献", "公开史料可跨纪元回看"],
        sources: latestChronicles.map((record) => record.chronicleId),
      },
      {
        type: "event",
        title: "岁时活动",
        summary: "活动纪念只保存可公开节点，奖励仍按活动记录本身结算。",
        highlights: ["活动纪念可陈列", "不继承活动奖励", "不发付费资产"],
        sources: latestChronicles.map((record) => record.chronicleId),
      },
      {
        type: "history_catalog",
        title: "历史图鉴",
        summary: "图鉴收录称号、九塔、活动与古宝外观的公开记忆，只用于回看和陈列。",
        highlights: [
          `已归档收藏 ${collectionCount} 件`,
          latestRank ? `最近排行快照 ${latestRank.periodKey}` : "排行仍在积累",
          "收藏不会改变战斗、掉落、贡献或排行公式",
        ],
        sources: latestChronicles.map((record) => record.chronicleId),
      },
      {
        type: "era_museum",
        title: "纪元博物志",
        summary: "博物志整理本服公开纪年、活动节点和可展示收藏，供下一纪元回看。",
        highlights: [
          "跨纪元只继承展示资产",
          "重复收藏只转展示材料或展示等级",
          "纪元祝福有效值最多 1%",
        ],
        sources: latestChronicles.map((record) => record.chronicleId),
      },
    ];

    await Promise.all(
      records.map((record) =>
        this.prisma.eraChronicleRecord.upsert({
          where: {
            eraId_serverId_chronicleType: {
              eraId,
              serverId: "default",
              chronicleType: record.type,
            },
          },
          create: {
            chronicleId: `era_chronicle_${eraId}_${record.type}`,
            eraId,
            serverId: "default",
            chronicleType: record.type,
            publicSummary: {
              title: record.title,
              summary: record.summary,
              highlights: record.highlights,
            },
            privateSummary: {
              generated_by: "system",
              sensitive_filtered: true,
            },
            relatedSourceIds: record.sources,
            visibilityRule: "server",
            storyConfigVersion: "story_p2_3_v1",
            collectionConfigVersion,
          },
          update: {
            publicSummary: {
              title: record.title,
              summary: record.summary,
              highlights: record.highlights,
            },
            relatedSourceIds: record.sources,
            collectionConfigVersion,
          },
        }),
      ),
    );
  }

  private async withIdempotency<TResponse>(input: {
    accountId: string;
    endpoint: string;
    idempotencyKey: string;
    requestBody: unknown;
    handler: (tx: Tx) => Promise<TResponse>;
  }): Promise<TResponse> {
    const requestHash = hashRequestBody(input.requestBody);
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

      return existingRecord.responseData as unknown as TResponse;
    }

    return this.prisma.$transaction(async (tx) => {
      const response = await input.handler(tx);
      await tx.idempotencyRecord.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          accountId: input.accountId,
          endpoint: input.endpoint,
          requestHash,
          responseData: response as unknown as Prisma.InputJsonValue,
          statusCode: 200,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return response;
    });
  }
}

function normalizeEquipRequest(body: EquipCollectionDisplayRequest): EquipCollectionDisplayRequest {
  const collectionId = body?.collection_id?.trim();
  const displaySlot = body?.display_slot?.trim();
  if (!collectionId || !displaySlot) {
    throw new BadRequestException("请选择收藏和展示栏");
  }

  return { collection_id: collectionId, display_slot: displaySlot };
}

function requireCollectionConfig(collectionId: string): EraCollectionConfig {
  const config = eraCollectionConfigs.find((item) => item.collectionId === collectionId);
  if (!config) {
    throw new BadRequestException("收藏配置不存在");
  }

  return config;
}

function isCollectionUnlocked(
  config: EraCollectionConfig,
  context: {
    chapterId: number;
    scrollIds: Set<string>;
    chronicleTypes: Set<string>;
    appearanceById: Map<string, { inherited: boolean }>;
    hasAncientTreasure: boolean;
  },
): boolean {
  if (config.unlock.appearanceId) {
    return context.appearanceById.has(config.unlock.appearanceId);
  }
  if (config.unlock.ancientTreasureId) {
    return context.hasAncientTreasure;
  }
  if (config.unlock.chronicleType) {
    return context.chronicleTypes.has(config.unlock.chronicleType);
  }
  if (config.unlock.storyScrollId) {
    return (
      context.scrollIds.has(config.unlock.storyScrollId) ||
      context.chapterId >= (config.unlock.chapterRequired ?? 1)
    );
  }

  return context.chapterId >= (config.unlock.chapterRequired ?? 1);
}

function buildDisplayPayload(config: EraCollectionConfig): Record<string, unknown> {
  return {
    name: config.name,
    public_summary: config.publicSummary,
    source_hint: config.sourceHint,
    display_positions: config.displayPositions,
    stat_bonus: null,
  };
}

function rarityWeight(rarity: string): number {
  switch (rarity) {
    case "legendary":
      return 4;
    case "epic":
      return 3;
    case "rare":
      return 2;
    default:
      return 1;
  }
}
