import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type {
  ActionState,
  ActivityDetailResponse,
  ActivityListResponse,
  ClaimActivityRewardRequest,
  ClaimActivityRewardResponse,
  ExperiencePayload,
  RewardBundle,
  SubmitActivityProgressRequest,
  SubmitActivityProgressResponse,
} from "@nextday/shared";
import type { EventInstance, EventRecord, Player, Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { lockAccountForTransaction } from "../database/player-transaction";
import { allocateCultivation } from "../game/cultivation-progress";
import { defaultEraId, provinceConfigs } from "../game/game.constants";
import { toActionState } from "../game/game.mappers";
import { writeJournalFromResponse } from "../journal/journal.utils";
import { hashRequestBody } from "../platform/utils/hash";
import {
  type EventTemplateConfig,
  eventAsyncRule,
  eventConfigVersion,
  eventRewardBoundary,
  eventRewardConfigVersion,
  eventRiskRulesetVersion,
  eventRulesetVersion,
  eventTemplateConfigs,
} from "./events.constants";
import {
  toActivityRecordState,
  toActivitySummaryState,
  toActivityTemplateState,
} from "./events.mappers";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;

@Injectable()
export class EventsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(accountId: string): Promise<ActivityListResponse> {
    const player = await this.requirePlayer(accountId);
    const instances = await this.ensureEventInstances();
    const records = await this.prisma.eventRecord.findMany({
      where: {
        playerId: player.playerId,
        eventInstanceId: { in: instances.map((item) => item.eventInstanceId) },
      },
    });
    const recordMap = new Map(records.map((record) => [record.eventInstanceId, record]));
    const events = eventTemplateConfigs.map((config) => {
      const instance = requireInstance(instances, config.eventId);
      return toActivitySummaryState({
        instance,
        config,
        record: recordMap.get(instance.eventInstanceId) ?? null,
      });
    });

    return {
      events,
      claimable_count: events.filter((event) => event.claimable).length,
      async_rule: eventAsyncRule,
      reward_boundary: eventRewardBoundary,
    };
  }

  async detail(accountId: string, eventId: string): Promise<ActivityDetailResponse> {
    const player = await this.requirePlayer(accountId);
    const { config, instance } = await this.getEventContext(eventId);
    const record = await this.prisma.eventRecord.findUnique({
      where: {
        eventInstanceId_playerId_periodKey: {
          eventInstanceId: instance.eventInstanceId,
          playerId: player.playerId,
          periodKey: getEventPeriodKey(instance),
        },
      },
    });

    return {
      event: toActivitySummaryState({ instance, config, record }),
      template: toActivityTemplateState(config),
      record: record ? toActivityRecordState(record) : null,
      announcement_template: {
        title: config.announcementTitle,
        content: config.announcementContent,
      },
      progress_actions: [
        {
          action_type: config.eventType,
          label: config.actionLabel,
          count_limit: config.countLimit,
          action_point_cost: config.actionPointCost,
        },
      ],
    };
  }

  async submitProgress(input: {
    accountId: string;
    body: SubmitActivityProgressRequest;
    idempotencyKey: string;
  }): Promise<SubmitActivityProgressResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeSubmitRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/events/progress",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const { config, instance } = await this.getEventContext(body.event_id, tx);
        await this.assertEventEligibility(tx, player.playerId, config.eventType, instance.cycleKey);
        assertActiveEvent(instance);
        const count = Math.min(body.count ?? 1, config.countLimit);
        const existing = await tx.eventRecord.findUnique({
          where: {
            eventInstanceId_playerId_periodKey: {
              eventInstanceId: instance.eventInstanceId,
              playerId: player.playerId,
              periodKey: getEventPeriodKey(instance),
            },
          },
        });
        if (existing?.rewardState === "claimed") {
          throw new BadRequestException("活动奖励已领取，不能继续提交");
        }
        const currentProgress = existing?.progress ?? 0;
        const acceptedCount = Math.min(count, Math.max(0, config.targetProgress - currentProgress));
        if (acceptedCount <= 0) {
          throw new BadRequestException("活动进度已达成，请领取奖励");
        }

        const actionState = await this.consumeActionPoints(
          tx,
          player.playerId,
          config.actionPointCost * acceptedCount,
        );
        const nextProgress = currentProgress + acceptedCount;
        const rewardState = nextProgress >= config.targetProgress ? "claimable" : "unsettled";
        const contributionGained = config.contributionPerAction * acceptedCount;
        const rankScoreGained = config.rankScorePerAction * acceptedCount;
        const record = existing
          ? await tx.eventRecord.update({
              where: { eventRecordId: existing.eventRecordId },
              data: {
                provinceId: body.province_id ?? existing.provinceId,
                sectId: player.sectId,
                progress: nextProgress,
                contribution: { increment: contributionGained },
                rankScore: { increment: rankScoreGained },
                rewardState,
                lastActionAt: new Date(),
                settledAt: rewardState === "claimable" ? new Date() : existing.settledAt,
                idempotencyKey: input.idempotencyKey,
              },
            })
          : await tx.eventRecord.create({
              data: {
                eventRecordId: `event_record_${randomUUID()}`,
                eventInstanceId: instance.eventInstanceId,
                eventId: config.eventId,
                playerId: player.playerId,
                eraId: defaultEraId,
                periodKey: getEventPeriodKey(instance),
                provinceId: body.province_id ?? null,
                sectId: player.sectId,
                progress: nextProgress,
                targetProgress: config.targetProgress,
                contribution: contributionGained,
                rankScore: rankScoreGained,
                rewardState,
                eventConfigVersion: eventConfigVersion,
                rewardConfigVersion: eventRewardConfigVersion,
                rulesetVersion: eventRulesetVersion,
                idempotencyKey: input.idempotencyKey,
                lastActionAt: new Date(),
                settledAt: rewardState === "claimable" ? new Date() : null,
              },
            });

        return {
          record_id: record.eventRecordId,
          event: toActivitySummaryState({ instance, config, record }),
          record: toActivityRecordState(record),
          action_state: actionState,
          contribution_gained: contributionGained,
          rank_score_gained: rankScoreGained,
          reward_state: rewardState,
          experience: buildEventExperience({
            title: `${config.name}进度回放`,
            summary: `${config.actionLabel} ${acceptedCount} 次，进度 ${record.progress}/${config.targetProgress}。`,
            rewards: rewardState === "claimable" ? config.reward : {},
            tags: ["async_event", "server_settled", "reward_boundary"],
          }),
        };
      },
    });
  }

  async claimReward(input: {
    accountId: string;
    body: ClaimActivityRewardRequest;
    idempotencyKey: string;
  }): Promise<ClaimActivityRewardResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeClaimRequest(input.body);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/events/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const { config, instance } = await this.getEventContext(body.event_id, tx);
        await this.assertEventEligibility(tx, player.playerId, config.eventType, instance.cycleKey);
        const record = await tx.eventRecord.findUnique({
          where: {
            eventInstanceId_playerId_periodKey: {
              eventInstanceId: instance.eventInstanceId,
              playerId: player.playerId,
              periodKey: getEventPeriodKey(instance),
            },
          },
        });
        if (!record || record.rewardState !== "claimable") {
          throw new BadRequestException("活动奖励暂不可领取");
        }

        const claimed = await tx.eventRecord.updateMany({
          where: { eventRecordId: record.eventRecordId, rewardState: "claimable" },
          data: { rewardState: "claimed" },
        });
        if (claimed.count !== 1) {
          throw new BadRequestException("活动奖励已领取");
        }

        rejectForbiddenEventRewards(config.reward);
        await this.applyReward(tx, player.playerId, config.reward, config.eventId);
        const rewardRecord = await tx.eventRewardRecord.create({
          data: {
            rewardRecordId: `event_reward_${randomUUID()}`,
            eventInstanceId: instance.eventInstanceId,
            eventRecordId: record.eventRecordId,
            playerId: player.playerId,
            eraId: defaultEraId,
            rewardType: "progress",
            rewardSummary: config.reward as unknown as Prisma.InputJsonValue,
            status: "claimed",
            claimIdempotencyKey: input.idempotencyKey,
            rewardConfigVersion: eventRewardConfigVersion,
            riskRulesetVersion: eventRiskRulesetVersion,
            claimedAt: new Date(),
          },
        });
        const updatedRecord = await tx.eventRecord.findUniqueOrThrow({
          where: { eventRecordId: record.eventRecordId },
        });

        return {
          reward_record_id: rewardRecord.rewardRecordId,
          event: toActivitySummaryState({ instance, config, record: updatedRecord }),
          record: toActivityRecordState(updatedRecord),
          rewards: config.reward,
          experience: buildEventExperience({
            title: `${config.name}奖励领取`,
            summary: "活动奖励已按绑定规则入账。",
            rewards: config.reward,
            tags: ["bound_reward", "no_rank_reissue"],
          }),
        };
      },
    });
  }

  private async getEventContext(
    eventId: string,
    tx: DbClient = this.prisma,
  ): Promise<{ config: EventTemplateConfig; instance: EventInstance }> {
    const config = eventTemplateConfigs.find((item) => item.eventId === eventId);
    if (!config) {
      throw new BadRequestException("未知活动");
    }
    await this.ensureEventInstances(tx);
    const instance = await tx.eventInstance.findUnique({
      where: {
        eraId_eventId_cycleKey: {
          eraId: defaultEraId,
          eventId: config.eventId,
          cycleKey: getCurrentCycleKey(),
        },
      },
    });
    if (!instance) {
      throw new BadRequestException("活动实例尚未开启");
    }

    return { config, instance };
  }

  private async ensureEventInstances(tx: DbClient = this.prisma): Promise<EventInstance[]> {
    const now = new Date();
    const cycleKey = getCurrentCycleKey(now);
    const startsAt = getCycleStart(cycleKey);
    const endsAt = new Date(startsAt.getTime() + eventCycleMilliseconds);
    const settlementAt = new Date(endsAt.getTime() + 24 * 60 * 60 * 1000);
    const instances: EventInstance[] = [];

    for (const config of eventTemplateConfigs) {
      await tx.eventInstance.updateMany({
        where: {
          eraId: defaultEraId,
          eventId: config.eventId,
          cycleKey: { not: cycleKey },
          status: "active",
        },
        data: { status: "settled" },
      });
      const instance = await tx.eventInstance.upsert({
        where: {
          eraId_eventId_cycleKey: {
            eraId: defaultEraId,
            eventId: config.eventId,
            cycleKey,
          },
        },
        create: {
          eventInstanceId: `event_instance_${randomUUID()}`,
          eventId: config.eventId,
          eraId: defaultEraId,
          cycleKey,
          serverId: "default",
          eventType: config.eventType,
          status: "active",
          asyncEnabled: true,
          startsAt,
          endsAt,
          settlementAt,
          eventConfigVersion: eventConfigVersion,
          rewardConfigVersion: eventRewardConfigVersion,
        },
        update: {
          eventType: config.eventType,
          status: "active",
          asyncEnabled: true,
          eventConfigVersion: eventConfigVersion,
          rewardConfigVersion: eventRewardConfigVersion,
        },
      });
      instances.push(instance);
    }

    return instances;
  }

  private async assertEventEligibility(
    tx: DbClient,
    playerId: string,
    eventType: string,
    cycleKey: string,
  ): Promise<void> {
    if (eventType !== "return_support" && eventType !== "compensation") {
      return;
    }

    const eventId = eventTemplateConfigs.find((config) => config.eventType === eventType)?.eventId;
    if (!eventId) {
      throw new ForbiddenException("活动资格不存在");
    }
    const eligibility = await tx.eventEligibility.findUnique({
      where: { playerId_eventId_cycleKey: { playerId, eventId, cycleKey } },
    });
    if (
      !eligibility ||
      eligibility.status !== "eligible" ||
      (eligibility.expiresAt && eligibility.expiresAt.getTime() <= Date.now())
    ) {
      throw new ForbiddenException("当前账号暂无该活动资格");
    }
  }

  private async consumeActionPoints(
    tx: Tx,
    playerId: string,
    actionPointCost: number,
  ): Promise<ActionState> {
    const state = await tx.playerActionState.findUniqueOrThrow({ where: { playerId } });
    const recoveredPoints = calculateRecoveredActionPoints(state);
    if (recoveredPoints < actionPointCost) {
      throw new BadRequestException("行动令不足");
    }
    const updated = await tx.playerActionState.update({
      where: { playerId },
      data: { actionPoints: recoveredPoints - actionPointCost, lastRecoveredAt: new Date() },
    });

    return toActionState(updated);
  }

  private async applyReward(tx: Tx, playerId: string, rewards: RewardBundle, sourceId: string) {
    const cultivation = BigInt(rewards.cultivation ?? "0");
    if (cultivation > 0n) {
      const player = await tx.player.findUniqueOrThrow({
        where: { playerId },
        include: { progress: true },
      });
      if (!player.progress) {
        throw new BadRequestException("角色修行进度不存在");
      }
      const allocation = allocateCultivation(
        {
          currentRealm: player.currentRealm,
          currentStage: player.currentStage,
          currentLevel: player.currentLevel,
          cultivationValue: player.progress.cultivationValue,
        },
        cultivation,
      );
      await tx.player.update({
        where: { playerId },
        data: {
          currentRealm: allocation.currentRealm,
          currentStage: allocation.currentStage,
          currentLevel: allocation.currentLevel,
        },
      });
      await tx.playerProgress.update({
        where: { playerId },
        data: { cultivationValue: allocation.cultivationValue },
      });
    }
    const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
    const spiritStone = BigInt(rewards.spirit_stone ?? "0");
    if (spiritStone > 0n) {
      await tx.playerWallet.update({
        where: { playerId },
        data: { spiritStone: { increment: spiritStone } },
      });
      await tx.walletLog.create({
        data: {
          logId: `wallet_${randomUUID()}`,
          playerId,
          currencyType: "spirit_stone",
          changeAmount: spiritStone,
          beforeAmount: wallet.spiritStone,
          afterAmount: wallet.spiritStone + spiritStone,
          sourceType: "event_reward",
          sourceId,
        },
      });
    }

    if ((rewards.action_points ?? 0) > 0) {
      const actionState = await tx.playerActionState.findUniqueOrThrow({ where: { playerId } });
      await tx.playerActionState.update({
        where: { playerId },
        data: {
          actionPoints: Math.min(
            actionState.actionPointCap,
            actionState.actionPoints + (rewards.action_points ?? 0),
          ),
          lastRecoveredAt: new Date(),
        },
      });
    }

    for (const item of rewards.items ?? []) {
      await tx.playerItem.create({
        data: {
          itemInstanceId: `item_${randomUUID()}`,
          playerId,
          itemId: item.item_id,
          count: BigInt(item.count),
          bindType: "bound",
          sourceType: "event_reward",
        },
      });
    }
  }

  private async requirePlayer(accountId: string): Promise<Player> {
    const player = await this.prisma.player.findUnique({ where: { accountId } });
    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
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
      await lockAccountForTransaction(tx, input.accountId);
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
      await writeJournalFromResponse(tx, {
        accountId: input.accountId,
        endpoint: input.endpoint,
        response,
        idempotencyKey: input.idempotencyKey,
      });

      return response;
    });
  }
}

function normalizeSubmitRequest(
  body: SubmitActivityProgressRequest,
): Required<SubmitActivityProgressRequest> {
  const eventId = body?.event_id?.trim();
  if (!eventId) {
    throw new BadRequestException("请选择活动");
  }
  const count = Math.max(1, Math.min(5, Math.floor(body.count ?? 1)));
  const provinceId = body.province_id?.trim() || "ji";
  if (!provinceConfigs.some((province) => province.provinceId === provinceId)) {
    throw new BadRequestException("未知州域");
  }

  return { event_id: eventId, count, province_id: provinceId };
}

function normalizeClaimRequest(body: ClaimActivityRewardRequest): ClaimActivityRewardRequest {
  const eventId = body?.event_id?.trim();
  if (!eventId) {
    throw new BadRequestException("请选择活动");
  }

  return { event_id: eventId };
}

function requireInstance(instances: EventInstance[], eventId: string): EventInstance {
  const instance = instances.find((item) => item.eventId === eventId);
  if (!instance) {
    throw new BadRequestException("活动实例尚未开启");
  }

  return instance;
}

function assertActiveEvent(instance: EventInstance) {
  if (!instance.asyncEnabled || instance.status !== "active") {
    throw new BadRequestException("活动暂未开放异步参与");
  }
  const now = Date.now();
  if (instance.startsAt.getTime() > now || instance.endsAt.getTime() < now) {
    throw new BadRequestException("活动不在开放期");
  }
}

function rejectForbiddenEventRewards(rewards: RewardBundle) {
  const text = JSON.stringify(rewards);
  if (BigInt(rewards.jade_paid ?? "0") > 0n || BigInt(rewards.jade_bound ?? "0") > 0n) {
    throw new BadRequestException("活动奖励不能发放仙玉");
  }
  const forbiddenFragments = [
    "ancient_treasure",
    "gubao",
    "limited",
    "unique_power",
    "reward_multiplier",
    "contribution_multiplier",
    "damage_multiplier",
  ];
  if (forbiddenFragments.some((fragment) => text.includes(fragment))) {
    throw new BadRequestException("活动奖励不能包含限定产物、唯一战力或倍率奖励");
  }
  for (const item of rewards.items ?? []) {
    if (item.bind_type !== "bound") {
      throw new BadRequestException("活动奖励材料必须绑定");
    }
  }
}

function getEventPeriodKey(instance: EventInstance): string {
  return instance.cycleKey;
}

const eventCycleMilliseconds = 14 * 24 * 60 * 60 * 1000;
const eventCycleEpochMilliseconds = Date.parse("2026-01-01T00:00:00.000Z");

function getCurrentCycleKey(now = new Date()): string {
  const cycle = Math.max(
    0,
    Math.floor((now.getTime() - eventCycleEpochMilliseconds) / eventCycleMilliseconds),
  );
  return `cycle_${String(cycle).padStart(6, "0")}`;
}

function getCycleStart(cycleKey: string): Date {
  const cycle = Number(cycleKey.replace("cycle_", ""));
  return new Date(eventCycleEpochMilliseconds + cycle * eventCycleMilliseconds);
}

function calculateRecoveredActionPoints(state: {
  actionPoints: number;
  actionPointCap: number;
  actionPointRestorePerHour: number;
  lastRecoveredAt: Date;
}): number {
  const elapsedHours = Math.floor(
    (Date.now() - state.lastRecoveredAt.getTime()) / (60 * 60 * 1000),
  );
  const recovered = elapsedHours * state.actionPointRestorePerHour;

  return Math.min(state.actionPointCap, state.actionPoints + recovered);
}

function buildEventExperience(input: {
  title: string;
  summary: string;
  rewards: RewardBundle;
  tags: string[];
}): ExperiencePayload {
  return {
    title: input.title,
    summary: input.summary,
    timeline: [
      {
        step: 1,
        title: "异步提交",
        description: "活动行动由服务端结算，错过结算时间不会损失已提交进度。",
        tone: "neutral",
      },
      {
        step: 2,
        title: "奖励边界",
        description: formatRewards(input.rewards),
        tone: "success",
      },
    ],
    delta_summary: [
      { label: "奖励", delta: formatRewards(input.rewards), tone: "success" },
      { label: "规则", after: eventRewardBoundary, tone: "neutral" },
    ],
    next_recommendations: [
      {
        label: "查看活动中心",
        reason: "可继续查看其他异步活动、可领取状态和公告模板。",
        action_hint: "events",
        priority: "medium",
      },
    ],
    reason_tags: input.tags.map((tag) => ({
      code: tag,
      label: tag,
      description: "P1 活动只增加运营节奏和回流目标，不改变付费强度边界。",
      tone: "neutral",
    })),
  };
}

function formatRewards(rewards: RewardBundle): string {
  const parts: string[] = [];
  if (rewards.spirit_stone) {
    parts.push(`灵石 +${rewards.spirit_stone}`);
  }
  if (rewards.action_points) {
    parts.push(`行动令 +${rewards.action_points}`);
  }
  for (const item of rewards.items ?? []) {
    parts.push(`${item.name} x${item.count}`);
  }

  return parts.length > 0 ? parts.join("，") : "本次只推进活动进度";
}
