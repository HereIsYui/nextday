import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type {
  BattleNarrativeResponse,
  EraChronicleResponse,
  EraChronicleStrategicSummary,
  StoryScrollDetailResponse,
  StoryScrollFragmentState,
  StoryScrollListResponse,
  WarMeritPeriodSnapshot,
} from "@nextday/shared";
import type { BattleLog, Player, PlayerProgress, Prisma, StoryScrollRecord } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { toBattleSummary } from "../game/game.mappers";
import { towerConfigs } from "../multiplayer/multiplayer.constants";
import { worldSeasonName } from "../world/world.constants";
import {
  sensitiveStoryTerms,
  storyCollectionConfigVersion,
  storyConfigVersion,
  storyRulesetVersion,
  storyScrollConfigs,
} from "./story.constants";
import {
  toBattleNarrative,
  toEraChronicleEntry,
  toStoryBattleReference,
  toStoryScrollDetail,
  toStoryScrollSummary,
} from "./story.mappers";

type PlayerWithProgress = Player & { progress: PlayerProgress | null };

@Injectable()
export class StoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getScrolls(accountId: string): Promise<StoryScrollListResponse> {
    const player = await this.requirePlayer(accountId);
    const records = await this.ensureStoryScrollRecords(player);
    const recordByScrollId = new Map(records.map((record) => [record.scrollId, record]));

    return {
      scrolls: storyScrollConfigs.map((config) =>
        toStoryScrollSummary(config, recordByScrollId.get(config.scrollId) ?? null),
      ),
    };
  }

  async getScrollDetail(accountId: string, scrollId: string): Promise<StoryScrollDetailResponse> {
    const player = await this.requirePlayer(accountId);
    const config = storyScrollConfigs.find((item) => item.scrollId === scrollId);
    if (!config) {
      throw new BadRequestException("章节卷轴不存在");
    }

    const records = await this.ensureStoryScrollRecords(player);
    const record = records.find((item) => item.scrollId === scrollId) ?? null;

    return { scroll: toStoryScrollDetail(config, record) };
  }

  async getBattleNarrative(accountId: string, battleId: string): Promise<BattleNarrativeResponse> {
    const player = await this.requirePlayer(accountId);
    const battle = await this.prisma.battleLog.findUnique({ where: { battleId } });
    if (!battle || battle.playerId !== player.playerId) {
      throw new ForbiddenException("无权查看该战报叙事");
    }

    return toBattleNarrative(battle, toBattleSummary(battle));
  }

  async getEraChronicle(accountId: string): Promise<EraChronicleResponse> {
    const player = await this.requirePlayer(accountId);
    const eraId = player.progress?.eraId ?? "era_mvp_001";
    await this.ensureEraChronicleRecords(eraId);
    const records = await this.prisma.eraChronicleRecord.findMany({
      where: { eraId, visibilityRule: { in: ["public", "server"] } },
      orderBy: [{ chronicleType: "asc" }, { createdAt: "desc" }],
    });

    return {
      entries: records.map(toEraChronicleEntry),
      story_config_version: storyConfigVersion,
      collection_config_version: storyCollectionConfigVersion,
    };
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

  private async ensureStoryScrollRecords(player: PlayerWithProgress): Promise<StoryScrollRecord[]> {
    const eraId = player.progress?.eraId ?? "era_mvp_001";
    const chapterId = player.progress?.chapterId ?? 1;
    const unlockedConfigs = storyScrollConfigs.filter((config) => config.chapterId <= chapterId);
    const [battles, events, journals] = await Promise.all([
      this.prisma.battleLog.findMany({
        where: { playerId: player.playerId },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      this.prisma.exploreEventRecord.findMany({
        where: { playerId: player.playerId, status: "resolved" },
        orderBy: { resolvedAt: "desc" },
        take: 6,
      }),
      this.prisma.playerJournalEntry.findMany({
        where: { playerId: player.playerId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    await Promise.all(
      unlockedConfigs.map((config) => {
        const relatedBattles = battles.filter(
          (battle) =>
            config.battleTypes.length === 0 || config.battleTypes.includes(battle.battleType),
        );
        const fragments = buildFragments(config, {
          battleCount: relatedBattles.length,
          eventCount: events.length,
          journalCount: journals.length,
        });
        const battleRefs = relatedBattles
          .slice(0, 3)
          .map((battle) => toStoryBattleReference(battle, toBattleSummary(battle)));
        const choiceSummary = events
          .slice(0, 3)
          .map((event) =>
            sanitizeStoryText(
              `${event.title}：选择 ${event.selectedChoiceId ?? "未记录"}，获得普通修行回响。`,
            ),
          );

        return this.prisma.storyScrollRecord.upsert({
          where: {
            playerId_eraId_scrollId: {
              playerId: player.playerId,
              eraId,
              scrollId: config.scrollId,
            },
          },
          create: {
            scrollRecordId: `story_scroll_record_${randomUUID()}`,
            playerId: player.playerId,
            eraId,
            scrollId: config.scrollId,
            chapterId: config.chapterId,
            unlockState: "unlocked",
            fragmentState: fragments as unknown as Prisma.InputJsonValue,
            battleRefs: battleRefs as unknown as Prisma.InputJsonValue,
            choiceSummary: choiceSummary as unknown as Prisma.InputJsonValue,
            sourceType: "story_scroll",
            sourceId: config.scrollId,
            storyConfigVersion,
            storyRulesetVersion,
          },
          update: {
            unlockState: "unlocked",
            fragmentState: fragments as unknown as Prisma.InputJsonValue,
            battleRefs: battleRefs as unknown as Prisma.InputJsonValue,
            choiceSummary: choiceSummary as unknown as Prisma.InputJsonValue,
            storyConfigVersion,
            storyRulesetVersion,
          },
        });
      }),
    );

    return this.prisma.storyScrollRecord.findMany({
      where: { playerId: player.playerId, eraId },
      orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
    });
  }

  private async ensureEraChronicleRecords(eraId: string): Promise<void> {
    const [towers, rankSnapshot, activeEvents] = await Promise.all([
      this.prisma.towerState.findMany({
        where: { eraId },
        orderBy: { towerId: "asc" },
        take: 9,
      }),
      this.prisma.rankSnapshot.findFirst({
        where: { eraId },
        orderBy: { generatedAt: "desc" },
      }),
      this.prisma.eventInstance.findMany({
        where: { eraId },
        orderBy: { startsAt: "desc" },
        take: 5,
      }),
    ]);

    const towerHighlights = towers.length
      ? towers.slice(0, 3).map((tower) => `${tower.towerName} 完整度 ${tower.integrity}`)
      : towerConfigs.slice(0, 3).map((tower) => `${tower.towerName} 等待本纪元记录`);
    const rankHighlights = rankSnapshot
      ? [`${rankSnapshot.rankType} 榜已在 ${rankSnapshot.periodKey} 生成快照`]
      : ["本纪元排行仍在积累，尚未形成最终快照"];
    const eventHighlights = activeEvents.length
      ? activeEvents.map((event) => `${event.eventType} · ${event.status}`)
      : ["活动节点尚未写入，本条用于验证史册降级展示"];

    const records = [
      {
        type: "tower",
        title: "九塔纪事",
        summary: "史册记录九塔状态，只展示公开进度，不展示后台审计。",
        highlights: towerHighlights,
        sources: towers.map((tower) => tower.towerStateId),
      },
      {
        type: "rank",
        title: "群修名录",
        summary: "排行快照会成为纪元史料，但不会把称号 Buff 叠加到下个纪元。",
        highlights: rankHighlights,
        sources: rankSnapshot ? [rankSnapshot.rankSnapshotId] : [],
      },
      {
        type: "event",
        title: "岁时活动",
        summary: "活动只记录可公开节点，奖励仍按原活动记录结算。",
        highlights: eventHighlights,
        sources: activeEvents.map((event) => event.eventInstanceId),
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
              summary: sanitizeStoryText(record.summary),
              highlights: record.highlights.map(sanitizeStoryText),
            },
            privateSummary: {
              generated_by: "system",
              sensitive_filtered: true,
            },
            relatedSourceIds: record.sources,
            visibilityRule: "server",
            storyConfigVersion,
            collectionConfigVersion: storyCollectionConfigVersion,
          },
          update: {
            publicSummary: {
              title: record.title,
              summary: sanitizeStoryText(record.summary),
              highlights: record.highlights.map(sanitizeStoryText),
            },
            privateSummary: {
              generated_by: "system",
              sensitive_filtered: true,
            },
            relatedSourceIds: record.sources,
            storyConfigVersion,
            collectionConfigVersion: storyCollectionConfigVersion,
          },
        }),
      ),
    );
    await this.ensureCityEraChronicle(eraId);
  }

  private async ensureCityEraChronicle(eraId: string): Promise<void> {
    const settlement = await this.prisma.warSeasonSettlement.findFirst({
      where: { eraId, status: "settled" },
      orderBy: { settledAt: "desc" },
    });
    if (!settlement) return;
    const stored = settlement.finalSnapshot as unknown as {
      rankings?: WarMeritPeriodSnapshot;
      strategic?: EraChronicleStrategicSummary;
    };
    if (!stored.strategic || !stored.rankings) return;
    const strategic = stored.strategic;
    const highlights = [
      strategic.champion_province
        ? `${strategic.champion_province}位列州势之首`
        : "本纪元未产生州势冠军",
      strategic.dominant_sect
        ? `${strategic.dominant_sect}成为本纪元主导宗门`
        : "本纪元没有宗门取得显著控制优势",
      `本纪元共有 ${strategic.captured_sub_city_count} 座分城易主`,
      stored.rankings.entries[0]
        ? `${stored.rankings.entries[0].display_name}以 ${stored.rankings.entries[0].score} 战功居首`
        : "个人战功榜尚无记录",
    ];
    await this.prisma.eraChronicleRecord.upsert({
      where: {
        eraId_serverId_chronicleType: {
          eraId,
          serverId: "default",
          chronicleType: "city_era",
        },
      },
      create: {
        chronicleId: `era_chronicle_${eraId}_city_era`,
        eraId,
        serverId: "default",
        chronicleType: "city_era",
        publicSummary: {
          title: worldSeasonName,
          summary: "九州版图、城池攻守与州战功业已在赛季结算时定卷。",
          highlights,
          strategic_summary: strategic,
        } as unknown as Prisma.InputJsonValue,
        privateSummary: {
          generated_by: "season_settlement",
          immutable_after_settlement: true,
        },
        relatedSnapshotId: settlement.settlementId,
        relatedSourceIds: [settlement.settlementId],
        visibilityRule: "server",
        storyConfigVersion,
        collectionConfigVersion: storyCollectionConfigVersion,
      },
      update: {},
    });
  }
}

function buildFragments(
  config: (typeof storyScrollConfigs)[number],
  context: { battleCount: number; eventCount: number; journalCount: number },
): StoryScrollFragmentState[] {
  return config.fragments.map((fragment, index) => {
    const unlocked =
      index === 0 ||
      (fragment.fragmentType === "battle_ref" && context.battleCount > 0) ||
      (fragment.fragmentType === "choice" && context.eventCount > 0) ||
      (fragment.fragmentType === "ending" && context.journalCount >= 2);

    return {
      fragment_id: fragment.fragmentId,
      title: fragment.title,
      body: sanitizeStoryText(unlocked ? fragment.body : fragment.unlockHint),
      fragment_type: fragment.fragmentType,
      unlocked,
      source_type: unlocked ? "story_scroll" : undefined,
      source_id: unlocked ? config.scrollId : null,
    };
  });
}

function sanitizeStoryText(text: string): string {
  return sensitiveStoryTerms.reduce((current, term) => current.replaceAll(term, "记录"), text);
}
