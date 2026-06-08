import { randomUUID } from "node:crypto";
import type { ExperiencePayload, ExperienceReasonTag, ExperienceTone } from "@nextday/shared";
import type { Prisma } from "@prisma/client";
import { defaultEraId } from "../game/game.constants";

type Tx = Prisma.TransactionClient;

const journalSourceLabels: Record<string, string> = {
  "POST /api/commerce/gacha/draw": "机缘抽取",
  "POST /api/events/progress": "活动推进",
  "POST /api/events/rewards/claim": "活动领奖",
  "POST /api/factions/choose": "路线选择",
  "POST /api/factions/reputation": "声望推进",
  "POST /api/game/cave/collect": "洞府收取",
  "POST /api/game/cultivation/breakthrough": "境界突破",
  "POST /api/game/cultivation/claim": "领取修为",
  "POST /api/game/explore/claim": "探索领取",
  "POST /api/game/explore/events/resolve": "探索奇遇",
  "POST /api/inner-world/assignments/claim": "内天地收取",
  "POST /api/inner-world/assignments/dispatch": "内天地派驻",
  "POST /api/inner-world/support": "九州支援",
  "POST /api/inner-world/upgrade": "内天地培养",
  "POST /api/multiplayer/boss/challenge": "挑战 Boss",
  "POST /api/multiplayer/pvp/attack": "资源点争夺",
  "POST /api/multiplayer/sects/tasks/complete": "宗门任务",
  "POST /api/multiplayer/sects/warehouse/deposit": "宗门入库",
  "POST /api/multiplayer/sects/warehouse/withdraw": "宗门出库",
  "POST /api/multiplayer/towers/action": "九塔提交",
  "POST /api/production/alchemy/craft": "炼丹",
  "POST /api/production/forge/craft": "炼器",
  "POST /api/production/equipment/forge": "炼器",
  "POST /api/production/equipment/inscribe": "铭刻",
  "POST /api/production/equipment/refine": "淬炼",
  "POST /api/production/equipment/star-up": "升星",
  "POST /api/production/equipment/wash": "洗髓",
  "POST /api/production/pills/use": "服丹",
};

const visibleRiskJournalTagCodes = new Set([
  "delayed_settlement",
  "decayed",
  "manual_review",
  "rate_limited",
]);

const systemBoundaryJournalTagCodes = new Set([
  "async_collect",
  "async_tower",
  "async_event",
  "async_assignment",
  "async_claim",
  "server_settled",
  "reward_boundary",
  "risk_normal",
  "reward_unchanged",
  "bound_only",
  "no_paid_output",
  "no_ancient_treasure",
  "permanent_pool",
  "server_roll",
  "sect_async",
  "loss_not_destroy",
  "warehouse_whitelist",
  "warehouse_audit",
]);

const systemBoundaryJournalLabelFragments = [
  "异步",
  "风控正常",
  "不触发审核",
  "无风险",
  "奖励未加成",
  "不加成",
  "不增收益",
  "奖励边界",
  "服务端",
  "幂等",
  "掷骰",
  "绑定产出",
  "无付费产出",
  "不产出九大古宝",
  "常驻机缘",
  "失败不毁号",
  "白名单流通",
  "仓库日志",
];

const experienceTagLabels: Record<string, string> = {
  auto_battle: "自动战斗",
  decayed: "收益衰减",
  delayed_settlement: "延迟结算",
  event_choice: "奇遇选择",
  honor_reward: "荣誉奖励",
  manual_review: "人工审核",
  mirror_boss: "镜像挑战",
  rate_limited: "请求限频",
  reputation_cleared: "声望清除",
  route_locked: "路线锁定",
  sect_conflict_checked: "宗门校验",
  transfer_cooldown: "转道冷却",
};

export async function writeJournalFromResponse(
  tx: Tx,
  input: {
    accountId: string;
    endpoint: string;
    response: unknown;
    idempotencyKey?: string;
  },
) {
  const experience = findExperience(input.response);
  if (!experience) {
    return;
  }

  const player = await tx.player.findUnique({
    where: { accountId: input.accountId },
    select: { playerId: true },
  });
  if (!player) {
    return;
  }

  await tx.playerJournalEntry.create({
    data: {
      journalEntryId: `journal_${randomUUID()}`,
      playerId: player.playerId,
      eraId: defaultEraId,
      sourceType: journalSourceLabels[input.endpoint] ?? input.endpoint,
      sourceId: findSourceId(input.response),
      title: experience.title,
      summary: experience.summary,
      deltaSummary: experience.delta_summary.map(
        formatDeltaSummary,
      ) as unknown as Prisma.InputJsonValue,
      tags: filterJournalTags(experience.reason_tags) as unknown as Prisma.InputJsonValue,
      recommendations: experience.next_recommendations
        .map((item) => item.label)
        .slice(0, 3) as unknown as Prisma.InputJsonValue,
      experienceSnapshot: experience as unknown as Prisma.InputJsonValue,
      configVersion: "p1_7_journal_v1",
    },
  });
}

function findExperience(response: unknown): ExperiencePayload | null {
  if (!isRecord(response)) {
    return null;
  }

  const experience = response.experience;
  return isExperiencePayload(experience) ? experience : null;
}

function findSourceId(response: unknown): string | null {
  if (!isRecord(response)) {
    return null;
  }

  if (typeof response.record_id === "string") {
    return response.record_id;
  }

  const event = response.event;
  if (isRecord(event) && typeof event.event_id === "string") {
    return event.event_id;
  }

  return null;
}

function isExperiencePayload(value: unknown): value is ExperiencePayload {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.timeline) &&
    Array.isArray(value.delta_summary) &&
    Array.isArray(value.next_recommendations) &&
    Array.isArray(value.reason_tags)
  );
}

function filterJournalTags(tags: ExperienceReasonTag[]): string[] {
  return uniqueStrings(
    tags
      .filter((tag) => !isSystemBoundaryJournalTag(tag))
      .map((tag) => experienceTagLabel(tag.code, tag.label))
      .filter(Boolean)
      .slice(0, 4),
  );
}

function isSystemBoundaryJournalTag(tag: ExperienceReasonTag): boolean {
  const displayLabel = experienceTagLabel(tag.code, tag.label);
  if (visibleRiskJournalTagCodes.has(tag.code) || visibleRiskJournalTagCodes.has(tag.label)) {
    return false;
  }
  if (["延迟结算", "收益衰减", "人工审核", "请求限频"].includes(displayLabel)) {
    return false;
  }
  if (systemBoundaryJournalTagCodes.has(tag.code) || systemBoundaryJournalTagCodes.has(tag.label)) {
    return true;
  }

  return [tag.label, displayLabel].some((value) =>
    systemBoundaryJournalLabelFragments.some((fragment) => value.includes(fragment)),
  );
}

function experienceTagLabel(code: string, label: string): string {
  return experienceTagLabels[code] ?? experienceTagLabels[label] ?? label ?? code;
}

function formatDeltaSummary(item: ExperiencePayload["delta_summary"][number]): string {
  if (item.delta !== undefined && item.delta !== null) {
    return `${item.label} ${item.delta}`;
  }

  const values = [item.before, item.after]
    .filter((value) => value !== undefined && value !== null)
    .map((value) => String(value));

  return `${item.label} ${values.length > 0 ? values.join(" → ") : "-"}`;
}

function uniqueStrings(values: string[]): string[] {
  return values.filter((value, index, array) => array.indexOf(value) === index);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildJournalExperience(input: {
  title: string;
  summary: string;
  deltas?: ExperiencePayload["delta_summary"];
  tags?: Array<{ code: string; label: string; tone?: ExperienceTone }>;
  recommendations?: ExperiencePayload["next_recommendations"];
}): ExperiencePayload {
  return {
    title: input.title,
    summary: input.summary,
    timeline: [
      {
        description: input.summary,
        step: 1,
        title: input.title,
        tone: "success",
      },
    ],
    delta_summary: input.deltas ?? [],
    next_recommendations: input.recommendations ?? [],
    reason_tags: input.tags ?? [],
  };
}
