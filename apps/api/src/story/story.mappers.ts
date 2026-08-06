import type {
  BattleNarrativeResponse,
  BattleRoundLog,
  BattleSummary,
  EraChronicleEntryState,
  StoryBattleReference,
  StoryScrollDetailState,
  StoryScrollFragmentState,
  StoryScrollSummaryState,
} from "@nextday/shared";
import type { BattleLog, EraChronicleRecord, StoryScrollRecord } from "@prisma/client";
import { type StoryScrollConfig, storyConfigVersion } from "./story.constants";

export function toStoryScrollSummary(
  config: StoryScrollConfig,
  record: StoryScrollRecord | null,
): StoryScrollSummaryState {
  const fragments = storyFragmentsFromJson(record?.fragmentState);
  const unlockedCount = fragments.filter((fragment) => fragment.unlocked).length;
  const progressPercent =
    config.fragments.length > 0 ? Math.round((unlockedCount / config.fragments.length) * 100) : 0;

  return {
    scroll_record_id: record?.scrollRecordId ?? null,
    scroll_id: config.scrollId,
    title: config.title,
    subtitle: config.subtitle,
    chapter_id: config.chapterId,
    unlock_state: (record?.unlockState as StoryScrollSummaryState["unlock_state"]) ?? "locked",
    progress_percent: record ? progressPercent : 0,
    latest_fragment: latestUnlockedFragmentTitle(fragments),
    updated_at: record?.updatedAt.toISOString() ?? null,
    story_config_version: record?.storyConfigVersion ?? storyConfigVersion,
  };
}

function latestUnlockedFragmentTitle(fragments: StoryScrollFragmentState[]): string {
  for (let index = fragments.length - 1; index >= 0; index -= 1) {
    const fragment = fragments[index];
    if (fragment?.unlocked) {
      return fragment.title;
    }
  }

  return "尚未解锁";
}

export function toStoryScrollDetail(
  config: StoryScrollConfig,
  record: StoryScrollRecord | null,
): StoryScrollDetailState {
  const summary = toStoryScrollSummary(config, record);

  return {
    ...summary,
    fragments: record ? storyFragmentsFromJson(record.fragmentState) : lockedFragments(config),
    battle_refs: storyBattleRefsFromJson(record?.battleRefs),
    choice_summary: stringArrayFromJson(record?.choiceSummary),
    sensitive_filtered: true,
  };
}

export function toBattleNarrative(
  battle: BattleLog,
  summary: BattleSummary,
): BattleNarrativeResponse {
  const roundLines = summary.log.slice(0, 3).map((round) => {
    const damageText = round.damage > 0 ? `造成 ${round.damage} 点伤害` : "试探对手气机";
    return `第 ${round.round} 回合，${round.actor} 施展${round.skill}，${damageText}。`;
  });
  const resultText =
    battle.result === "win"
      ? `你压住了${battle.enemyName}的攻势，战斗以胜利收束。`
      : `${battle.enemyName}逼退了你，这一战暴露了修为或装备短板。`;

  return {
    battle_id: battle.battleId,
    battle_type: battle.battleType,
    title: `${battle.enemyName}战记`,
    summary: resultText,
    narrative_lines: [
      `战斗发生在${battle.provinceId ?? "未知州域"}，共 ${battle.rounds} 回合。`,
      ...roundLines,
      resultText,
    ],
    key_rounds: roundLines,
    result_reason: summary.reason_summary ?? [],
    source_battle_id: battle.battleId,
    story_config_version: storyConfigVersion,
  };
}

export function toStoryBattleReference(
  battle: BattleLog,
  summary: BattleSummary,
): StoryBattleReference {
  const resultText = battle.result === "win" ? "胜" : "败";

  return {
    battle_id: battle.battleId,
    battle_type: battle.battleType,
    title: `${battle.enemyName} · ${resultText}`,
    summary:
      summary.reason_summary?.[0] ?? `共 ${battle.rounds} 回合，造成 ${battle.damageDone} 伤害。`,
    result: battle.result,
    created_at: battle.createdAt.toISOString(),
  };
}

export function toEraChronicleEntry(record: EraChronicleRecord): EraChronicleEntryState {
  const summary = objectFromJson(record.publicSummary);

  return {
    chronicle_id: record.chronicleId,
    era_id: record.eraId,
    server_id: record.serverId,
    chronicle_type: record.chronicleType,
    title: stringFromUnknown(summary.title, "纪元记录"),
    summary: stringFromUnknown(summary.summary, "本纪元记录仍在整理。"),
    highlights: stringArrayFromUnknown(summary.highlights),
    visibility_rule: record.visibilityRule,
    related_source_ids: stringArrayFromJson(record.relatedSourceIds),
    created_at: record.createdAt.toISOString(),
  };
}

export function storyFragmentsFromJson(value: unknown): StoryScrollFragmentState[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isStoryFragment);
}

function storyBattleRefsFromJson(value: unknown): StoryBattleReference[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isStoryBattleReference);
}

function lockedFragments(config: StoryScrollConfig): StoryScrollFragmentState[] {
  return config.fragments.map((fragment) => ({
    fragment_id: fragment.fragmentId,
    title: fragment.title,
    body: fragment.unlockHint,
    fragment_type: fragment.fragmentType,
    unlocked: false,
  }));
}

function stringArrayFromJson(value: unknown): string[] {
  return stringArrayFromUnknown(value);
}

function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function objectFromJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function stringFromUnknown(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function isStoryFragment(value: unknown): value is StoryScrollFragmentState {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<StoryScrollFragmentState>;
  return (
    typeof item.fragment_id === "string" &&
    typeof item.title === "string" &&
    typeof item.body === "string" &&
    typeof item.fragment_type === "string" &&
    typeof item.unlocked === "boolean"
  );
}

function isStoryBattleReference(value: unknown): value is StoryBattleReference {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Partial<StoryBattleReference>;
  return (
    typeof item.battle_id === "string" &&
    typeof item.battle_type === "string" &&
    typeof item.title === "string" &&
    typeof item.summary === "string" &&
    typeof item.created_at === "string"
  );
}
