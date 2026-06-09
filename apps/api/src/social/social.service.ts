import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type {
  AcceptSectHireRequest,
  ApplyMentorRequest,
  ClaimMentorTaskRequest,
  CreateSectHireRequest,
  GraduateMentorRequest,
  MentorMutationResponse,
  MentorRelationState,
  MentorSummaryResponse,
  ProposeSectDiplomacyRequest,
  ReviewMentorRequest,
  ReviewSectDiplomacyRequest,
  SectDiplomacyMutationResponse,
  SectDiplomacyState,
  SectDiplomacySummaryResponse,
  SectHireListResponse,
  SectHireMutationResponse,
  SettleSectHireRequest,
} from "@nextday/shared";
import type {
  MentorRelationRecord,
  Player,
  PlayerProgress,
  Prisma,
  Sect,
  SectDiplomacyRecord,
  SectHireRecord,
  SectMember,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service";
import { hashRequestBody } from "../platform/utils/hash";
import {
  diplomacyBoundary,
  diplomacyConfigVersion,
  diplomacyRules,
  hireBoundary,
  hireConfigVersion,
  hireRules,
  mentorConfigVersion,
  mentorRule,
  socialRewardConfigVersion,
  socialRiskRulesetVersion,
  socialRulesetVersion,
} from "./social.constants";
import { toMentorRelationState, toSectDiplomacyState, toSectHireState } from "./social.mappers";

type Tx = Prisma.TransactionClient;
type DbClient = Tx | PrismaService;
type PlayerWithSocial = Player & {
  progress: PlayerProgress | null;
  sectMembership: SectMember | null;
};

@Injectable()
export class SocialService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getMentorSummary(accountId: string): Promise<MentorSummaryResponse> {
    const player = await this.requirePlayer(accountId);
    const records = await this.prisma.mentorRelationRecord.findMany({
      where: {
        OR: [{ mentorPlayerId: player.playerId }, { apprenticePlayerId: player.playerId }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const states = await this.mapMentorRecords(records);

    return {
      relations: states,
      pending_as_mentor: states.filter(
        (record) => record.mentor_player_id === player.playerId && record.status === "pending",
      ),
      active_as_apprentice:
        states.find(
          (record) => record.apprentice_player_id === player.playerId && record.status === "active",
        ) ?? null,
      rule: mentorRule,
    };
  }

  async applyMentor(input: {
    accountId: string;
    body: ApplyMentorRequest;
    idempotencyKey: string;
  }): Promise<MentorMutationResponse> {
    const apprentice = await this.requirePlayer(input.accountId);
    const body = normalizeApplyMentorRequest(input.body);
    const replay = await this.getIdempotentResponse<MentorMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/apply",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    if (body.mentor_player_id === apprentice.playerId) {
      throw new BadRequestException("不能拜自己为师");
    }
    const mentor = await this.prisma.player.findUnique({
      where: { playerId: body.mentor_player_id },
      include: { progress: true, sectMembership: true },
    });
    if (!mentor) {
      throw new BadRequestException("导师不存在");
    }
    if ((mentor.progress?.chapterId ?? 1) < mentorRule.mentor_condition.chapter_required) {
      throw new BadRequestException("导师尚未达到收徒条件");
    }
    const existingRelation = await this.prisma.mentorRelationRecord.findFirst({
      where: {
        apprenticePlayerId: apprentice.playerId,
        status: { in: ["pending", "active"] },
      },
    });
    if (existingRelation) {
      throw new BadRequestException("已有申请中或进行中的师徒关系");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/apply",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const relation = await tx.mentorRelationRecord.create({
          data: {
            mentorRelationId: `mentor_relation_${randomUUID()}`,
            mentorPlayerId: mentor.playerId,
            apprenticePlayerId: apprentice.playerId,
            eraId: apprentice.progress?.eraId ?? "era_mvp_001",
            status: "pending",
            taskSummary: buildMentorTaskSummary("pending") as Prisma.InputJsonValue,
            rewardBoundarySummary: mentorRewardBoundary() as Prisma.InputJsonValue,
            riskSummary: socialRiskSummary("normal") as Prisma.InputJsonValue,
            idempotencyKey: input.idempotencyKey,
            mentorConfigVersion,
            rewardConfigVersion: socialRewardConfigVersion,
            riskRulesetVersion: socialRiskRulesetVersion,
          },
        });

        return {
          record_id: `mentor_apply_${randomUUID()}`,
          relation: toMentorRelationState(relation, {
            mentorName: mentor.name,
            apprenticeName: apprentice.name,
          }),
        };
      },
    });
  }

  async reviewMentor(input: {
    accountId: string;
    body: ReviewMentorRequest;
    idempotencyKey: string;
  }): Promise<MentorMutationResponse> {
    const mentor = await this.requirePlayer(input.accountId);
    const body = normalizeReviewMentorRequest(input.body);
    const replay = await this.getIdempotentResponse<MentorMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/review",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const relation = await this.prisma.mentorRelationRecord.findUnique({
      where: { mentorRelationId: body.mentor_relation_id },
    });
    if (!relation || relation.mentorPlayerId !== mentor.playerId) {
      throw new ForbiddenException("无权审批该拜师申请");
    }
    if (relation.status !== "pending") {
      throw new BadRequestException("该申请已处理");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/review",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const updated = await tx.mentorRelationRecord.update({
          where: { mentorRelationId: relation.mentorRelationId },
          data: {
            status: body.decision === "accept" ? "active" : "rejected",
            taskSummary: buildMentorTaskSummary(
              body.decision === "accept" ? "active" : "rejected",
            ) as Prisma.InputJsonValue,
            riskSummary: socialRiskSummary("normal") as Prisma.InputJsonValue,
          },
        });
        const names = await this.mentorNames(updated, tx);

        return {
          record_id: `mentor_review_${randomUUID()}`,
          relation: toMentorRelationState(updated, names),
        };
      },
    });
  }

  async claimMentorTask(input: {
    accountId: string;
    body: ClaimMentorTaskRequest;
    idempotencyKey: string;
  }): Promise<MentorMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeMentorRelationRequest(input.body.mentor_relation_id);
    const replay = await this.getIdempotentResponse<MentorMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/task/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const relation = await this.prisma.mentorRelationRecord.findUnique({
      where: { mentorRelationId: body.mentor_relation_id },
    });
    if (!relation || !isMentorParticipant(relation, player.playerId)) {
      throw new ForbiddenException("无权领取该师徒任务");
    }
    if (relation.status !== "active") {
      throw new BadRequestException("师徒关系尚未建立");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/task/claim",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const taskSummary = taskSummaryFromRecord(relation);
        const alreadyClaimed = taskSummary.claimed === true;
        const rewards = alreadyClaimed ? undefined : mentorTaskReward();
        if (!alreadyClaimed) {
          await this.changeSpiritStone(tx, relation.apprenticePlayerId, 80n, {
            sourceType: "mentor_task",
            sourceId: relation.mentorRelationId,
            idempotencyKey: `${input.idempotencyKey}:spirit_stone`,
          });
        }
        const updated = await tx.mentorRelationRecord.update({
          where: { mentorRelationId: relation.mentorRelationId },
          data: {
            taskSummary: {
              ...taskSummary,
              claimed: true,
              claimed_at: new Date().toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
        const names = await this.mentorNames(updated, tx);

        return {
          record_id: `mentor_task_${randomUUID()}`,
          relation: toMentorRelationState(updated, names),
          rewards,
        };
      },
    });
  }

  async graduateMentor(input: {
    accountId: string;
    body: GraduateMentorRequest;
    idempotencyKey: string;
  }): Promise<MentorMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeMentorRelationRequest(input.body.mentor_relation_id);
    const replay = await this.getIdempotentResponse<MentorMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/graduate",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const relation = await this.prisma.mentorRelationRecord.findUnique({
      where: { mentorRelationId: body.mentor_relation_id },
    });
    if (!relation || !isMentorParticipant(relation, player.playerId)) {
      throw new ForbiddenException("无权处理该师徒关系");
    }
    if (relation.status !== "active") {
      throw new BadRequestException("只有进行中的师徒关系可出师");
    }
    const taskSummary = taskSummaryFromRecord(relation);
    if (taskSummary.claimed !== true) {
      throw new BadRequestException("需先完成师徒任务");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/mentor/graduate",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const updated = await tx.mentorRelationRecord.update({
          where: { mentorRelationId: relation.mentorRelationId },
          data: {
            status: "graduated",
            cooldownUntil: new Date(Date.now() + 72 * 60 * 60 * 1000),
          },
        });
        const names = await this.mentorNames(updated, tx);

        return {
          record_id: `mentor_graduate_${randomUUID()}`,
          relation: toMentorRelationState(updated, names),
        };
      },
    });
  }

  async getDiplomacySummary(accountId: string): Promise<SectDiplomacySummaryResponse> {
    const player = await this.requirePlayer(accountId);
    if (!player.sectId) {
      return {
        sect_id: null,
        sect_name: null,
        my_role: null,
        records: [],
        proposals_to_review: [],
        rule: diplomacySummaryRule(),
      };
    }
    const sect = await this.prisma.sect.findUnique({ where: { sectId: player.sectId } });
    const records = await this.prisma.sectDiplomacyRecord.findMany({
      where: {
        OR: [{ sourceSectId: player.sectId }, { targetSectId: player.sectId }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const states = await this.mapDiplomacyRecords(records);

    return {
      sect_id: player.sectId,
      sect_name: sect?.name ?? null,
      my_role: player.sectMembership?.role ?? null,
      records: states,
      proposals_to_review: states.filter(
        (record) => record.target_sect_id === player.sectId && record.status === "proposed",
      ),
      rule: diplomacySummaryRule(),
    };
  }

  async proposeDiplomacy(input: {
    accountId: string;
    body: ProposeSectDiplomacyRequest;
    idempotencyKey: string;
  }): Promise<SectDiplomacyMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeDiplomacyProposal(input.body);
    const replay = await this.getIdempotentResponse<SectDiplomacyMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/sect/diplomacy/propose",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const member = requireSectOfficer(player, "宗门外交提案需要宗主或长老权限");
    if (member.sectId === body.target_sect_id) {
      throw new BadRequestException("不能向本宗门发起外交提案");
    }
    const targetSect = await this.prisma.sect.findUnique({
      where: { sectId: body.target_sect_id },
    });
    if (!targetSect) {
      throw new BadRequestException("目标宗门不存在");
    }
    const existingRecord = await this.prisma.sectDiplomacyRecord.findFirst({
      where: {
        sourceSectId: member.sectId,
        targetSectId: body.target_sect_id,
        diplomacyType: body.diplomacy_type,
        status: { in: ["proposed", "active"] },
      },
    });
    if (existingRecord) {
      throw new BadRequestException("已有相同外交状态或提案");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/sect/diplomacy/propose",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const record = await tx.sectDiplomacyRecord.create({
          data: {
            diplomacyRecordId: `sect_diplomacy_${randomUUID()}`,
            sourceSectId: member.sectId,
            targetSectId: targetSect.sectId,
            eraId: "era_mvp_001",
            diplomacyType: body.diplomacy_type,
            status: "proposed",
            proposalSummary: {
              message: body.message ?? "愿以异步协作为约。",
              proposed_by: player.playerId,
              boundary: diplomacyBoundary,
            } as Prisma.InputJsonValue,
            cooldownUntil: new Date(
              Date.now() + diplomacyCooldownHours(body.diplomacy_type) * 60 * 60 * 1000,
            ),
            idempotencyKey: input.idempotencyKey,
            diplomacyConfigVersion,
            rulesetVersion: socialRulesetVersion,
          },
        });
        const state = await this.mapDiplomacyRecord(record, tx);

        return { record_id: `diplomacy_propose_${randomUUID()}`, diplomacy: state };
      },
    });
  }

  async reviewDiplomacy(input: {
    accountId: string;
    body: ReviewSectDiplomacyRequest;
    idempotencyKey: string;
  }): Promise<SectDiplomacyMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeDiplomacyReview(input.body);
    const replay = await this.getIdempotentResponse<SectDiplomacyMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/sect/diplomacy/review",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const member = requireSectOfficer(player, "宗门外交审批需要宗主或长老权限");
    const record = await this.prisma.sectDiplomacyRecord.findUnique({
      where: { diplomacyRecordId: body.diplomacy_record_id },
    });
    if (!record || record.targetSectId !== member.sectId) {
      throw new ForbiddenException("无权审批该外交提案");
    }
    if (record.status !== "proposed") {
      throw new BadRequestException("该外交提案已处理");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/sect/diplomacy/review",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const updated = await tx.sectDiplomacyRecord.update({
          where: { diplomacyRecordId: record.diplomacyRecordId },
          data: {
            status: body.decision === "accept" ? "active" : "rejected",
            approvalSummary: {
              decision: body.decision,
              reviewed_by: player.playerId,
              role: member.role,
              boundary: diplomacyBoundary,
            } as Prisma.InputJsonValue,
          },
        });
        const state = await this.mapDiplomacyRecord(updated, tx);

        return { record_id: `diplomacy_review_${randomUUID()}`, diplomacy: state };
      },
    });
  }

  async getHireList(accountId: string): Promise<SectHireListResponse> {
    const player = await this.requirePlayer(accountId);
    const records = await this.prisma.sectHireRecord.findMany({
      where: player.sectId
        ? {
            OR: [
              { status: "open" },
              { employerSectId: player.sectId },
              { helperSectId: player.sectId },
              { helperPlayerId: player.playerId },
            ],
          }
        : { status: "open" },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    const states = await this.mapHireRecords(records);
    const sect = player.sectId
      ? await this.prisma.sect.findUnique({ where: { sectId: player.sectId } })
      : null;

    return {
      sect_id: player.sectId ?? null,
      sect_name: sect?.name ?? null,
      open_hires: states.filter((record) => record.status === "open"),
      my_hires: states.filter((record) => record.employer_sect_id === player.sectId),
      accepted_hires: states.filter((record) => record.helper_player_id === player.playerId),
      rule: hireSummaryRule(),
    };
  }

  async createHire(input: {
    accountId: string;
    body: CreateSectHireRequest;
    idempotencyKey: string;
  }): Promise<SectHireMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeCreateHireRequest(input.body);
    const replay = await this.getIdempotentResponse<SectHireMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/sect/hire/create",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const member = requireSectOperator(player, "发布雇佣需要宗门管理权限");
    const rule = requireHireRule(body.hire_type);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/sect/hire/create",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const record = await tx.sectHireRecord.create({
          data: {
            hireRecordId: `sect_hire_${randomUUID()}`,
            employerSectId: member.sectId,
            eraId: "era_mvp_001",
            hireType: rule.hire_type,
            status: "open",
            allowedActionScope: rule.allowed_action_scope as Prisma.InputJsonValue,
            rewardEscrowSummary: buildHireEscrow(rule, "escrowed") as Prisma.InputJsonValue,
            riskStatus: "normal",
            settlementStatus: "pending",
            idempotencyKey: input.idempotencyKey,
            hireConfigVersion,
            rewardConfigVersion: socialRewardConfigVersion,
            riskRulesetVersion: socialRiskRulesetVersion,
          },
        });
        const state = await this.mapHireRecord(record, tx);

        return { record_id: `hire_create_${randomUUID()}`, hire: state };
      },
    });
  }

  async acceptHire(input: {
    accountId: string;
    body: AcceptSectHireRequest;
    idempotencyKey: string;
  }): Promise<SectHireMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeHireRecordRequest(input.body.hire_record_id);
    const replay = await this.getIdempotentResponse<SectHireMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/sect/hire/accept",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const member = requireSectMember(player, "接取雇佣需要加入宗门");
    const record = await this.prisma.sectHireRecord.findUnique({
      where: { hireRecordId: body.hire_record_id },
    });
    if (!record) {
      throw new BadRequestException("雇佣委托不存在");
    }
    if (record.status !== "open") {
      throw new BadRequestException("该雇佣委托不可接取");
    }
    if (record.employerSectId === member.sectId) {
      throw new BadRequestException("不能接取本宗门发布的雇佣");
    }

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/sect/hire/accept",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        const updated = await tx.sectHireRecord.update({
          where: { hireRecordId: record.hireRecordId },
          data: {
            status: "accepted",
            helperSectId: member.sectId,
            helperPlayerId: player.playerId,
            riskStatus: "normal",
          },
        });
        const state = await this.mapHireRecord(updated, tx);

        return { record_id: `hire_accept_${randomUUID()}`, hire: state };
      },
    });
  }

  async settleHire(input: {
    accountId: string;
    body: SettleSectHireRequest;
    idempotencyKey: string;
  }): Promise<SectHireMutationResponse> {
    const player = await this.requirePlayer(input.accountId);
    const body = normalizeHireRecordRequest(input.body.hire_record_id);
    const replay = await this.getIdempotentResponse<SectHireMutationResponse>({
      accountId: input.accountId,
      endpoint: "POST /api/sect/hire/settle",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
    });
    if (replay) {
      return replay;
    }
    const record = await this.prisma.sectHireRecord.findUnique({
      where: { hireRecordId: body.hire_record_id },
    });
    if (!record || record.helperPlayerId !== player.playerId) {
      throw new ForbiddenException("无权结算该雇佣");
    }
    if (record.status !== "accepted") {
      throw new BadRequestException("该雇佣尚未接取或已结算");
    }
    const rule = requireHireRule(record.hireType);

    return this.withIdempotency({
      accountId: input.accountId,
      endpoint: "POST /api/sect/hire/settle",
      idempotencyKey: input.idempotencyKey,
      requestBody: body,
      handler: async (tx) => {
        await this.changeSpiritStone(tx, player.playerId, BigInt(rule.reward.spirit_stone), {
          sourceType: "sect_hire",
          sourceId: record.hireRecordId,
          idempotencyKey: `${input.idempotencyKey}:spirit_stone`,
        });
        const updated = await tx.sectHireRecord.update({
          where: { hireRecordId: record.hireRecordId },
          data: {
            status: "settled",
            settlementStatus: "settled",
            riskStatus: "normal",
            rewardEscrowSummary: buildHireEscrow(rule, "settled") as Prisma.InputJsonValue,
            settledAt: new Date(),
          },
        });
        const state = await this.mapHireRecord(updated, tx);

        return {
          record_id: `hire_settle_${randomUUID()}`,
          hire: state,
          rewards: { spirit_stone: rule.reward.spirit_stone },
        };
      },
    });
  }

  private async requirePlayer(accountId: string): Promise<PlayerWithSocial> {
    const player = await this.prisma.player.findUnique({
      where: { accountId },
      include: { progress: true, sectMembership: true },
    });

    if (!player) {
      throw new BadRequestException("请先创建角色");
    }

    return player;
  }

  private async mentorNames(
    record: MentorRelationRecord,
    client: DbClient = this.prisma,
  ): Promise<{ mentorName: string; apprenticeName: string }> {
    const players = await client.player.findMany({
      where: { playerId: { in: [record.mentorPlayerId, record.apprenticePlayerId] } },
      select: { playerId: true, name: true },
    });
    const names = new Map(players.map((player) => [player.playerId, player.name]));

    return {
      mentorName: names.get(record.mentorPlayerId) ?? "未知导师",
      apprenticeName: names.get(record.apprenticePlayerId) ?? "未知徒弟",
    };
  }

  private async mapMentorRecords(records: MentorRelationRecord[]): Promise<MentorRelationState[]> {
    const playerIds = Array.from(
      new Set(records.flatMap((record) => [record.mentorPlayerId, record.apprenticePlayerId])),
    );
    const players = await this.prisma.player.findMany({
      where: { playerId: { in: playerIds } },
      select: { playerId: true, name: true },
    });
    const names = new Map(players.map((player) => [player.playerId, player.name]));

    return records.map((record) =>
      toMentorRelationState(record, {
        mentorName: names.get(record.mentorPlayerId),
        apprenticeName: names.get(record.apprenticePlayerId),
      }),
    );
  }

  private async mapDiplomacyRecord(
    record: SectDiplomacyRecord,
    client: DbClient = this.prisma,
  ): Promise<SectDiplomacyState> {
    const sects = await client.sect.findMany({
      where: { sectId: { in: [record.sourceSectId, record.targetSectId] } },
      select: { sectId: true, name: true },
    });
    const names = new Map(sects.map((sect) => [sect.sectId, sect.name]));

    return toSectDiplomacyState(record, {
      sourceName: names.get(record.sourceSectId),
      targetName: names.get(record.targetSectId),
    });
  }

  private async mapDiplomacyRecords(records: SectDiplomacyRecord[]): Promise<SectDiplomacyState[]> {
    const sectIds = Array.from(
      new Set(records.flatMap((record) => [record.sourceSectId, record.targetSectId])),
    );
    const sects = await this.prisma.sect.findMany({
      where: { sectId: { in: sectIds } },
      select: { sectId: true, name: true },
    });
    const names = new Map(sects.map((sect) => [sect.sectId, sect.name]));

    return records.map((record) =>
      toSectDiplomacyState(record, {
        sourceName: names.get(record.sourceSectId),
        targetName: names.get(record.targetSectId),
      }),
    );
  }

  private async mapHireRecord(record: SectHireRecord, client: DbClient = this.prisma) {
    const sectIds = [record.employerSectId, record.helperSectId].filter(isString);
    const [sects, helperPlayer] = await Promise.all([
      client.sect.findMany({
        where: { sectId: { in: sectIds } },
        select: { sectId: true, name: true },
      }),
      record.helperPlayerId
        ? client.player.findUnique({
            where: { playerId: record.helperPlayerId },
            select: { name: true },
          })
        : null,
    ]);
    const sectNames = new Map(sects.map((sect) => [sect.sectId, sect.name]));

    return toSectHireState(record, {
      employerName: sectNames.get(record.employerSectId),
      helperSectName: record.helperSectId ? sectNames.get(record.helperSectId) : null,
      helperPlayerName: helperPlayer?.name ?? null,
    });
  }

  private async mapHireRecords(records: SectHireRecord[]) {
    const sectIds = Array.from(
      new Set(
        records.flatMap((record) => [record.employerSectId, record.helperSectId]).filter(isString),
      ),
    );
    const playerIds = Array.from(
      new Set(records.map((record) => record.helperPlayerId).filter(isString)),
    );
    const [sects, players] = await Promise.all([
      this.prisma.sect.findMany({
        where: { sectId: { in: sectIds } },
        select: { sectId: true, name: true },
      }),
      this.prisma.player.findMany({
        where: { playerId: { in: playerIds } },
        select: { playerId: true, name: true },
      }),
    ]);
    const sectNames = new Map(sects.map((sect) => [sect.sectId, sect.name]));
    const playerNames = new Map(players.map((player) => [player.playerId, player.name]));

    return records.map((record) =>
      toSectHireState(record, {
        employerName: sectNames.get(record.employerSectId),
        helperSectName: record.helperSectId ? sectNames.get(record.helperSectId) : null,
        helperPlayerName: record.helperPlayerId ? playerNames.get(record.helperPlayerId) : null,
      }),
    );
  }

  private async changeSpiritStone(
    tx: Tx,
    playerId: string,
    amount: bigint,
    source: { sourceType: string; sourceId: string; idempotencyKey: string },
  ): Promise<void> {
    const wallet = await tx.playerWallet.findUniqueOrThrow({ where: { playerId } });
    const before = wallet.spiritStone;
    const after = before + amount;
    await tx.playerWallet.update({
      where: { playerId },
      data: { spiritStone: after },
    });
    await tx.walletLog.create({
      data: {
        logId: `wallet_log_${randomUUID()}`,
        playerId,
        currencyType: "spirit_stone",
        changeAmount: amount,
        beforeAmount: before,
        afterAmount: after,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        idempotencyKey: source.idempotencyKey,
      },
    });
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

  private async getIdempotentResponse<TResponse>(input: {
    accountId: string;
    endpoint: string;
    idempotencyKey: string;
    requestBody: unknown;
  }): Promise<TResponse | null> {
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!existingRecord) {
      return null;
    }

    if (
      existingRecord.accountId !== input.accountId ||
      existingRecord.endpoint !== input.endpoint ||
      existingRecord.requestHash !== hashRequestBody(input.requestBody)
    ) {
      throw new BadRequestException("幂等键已被其他请求使用");
    }

    return existingRecord.responseData as unknown as TResponse;
  }
}

function normalizeApplyMentorRequest(body: ApplyMentorRequest): ApplyMentorRequest {
  const mentorPlayerId = body?.mentor_player_id?.trim();
  if (!mentorPlayerId) {
    throw new BadRequestException("请选择导师");
  }

  return { mentor_player_id: mentorPlayerId };
}

function normalizeReviewMentorRequest(body: ReviewMentorRequest): ReviewMentorRequest {
  const request = normalizeMentorRelationRequest(body?.mentor_relation_id);
  if (body?.decision !== "accept" && body?.decision !== "reject") {
    throw new BadRequestException("请选择审批结果");
  }

  return { ...request, decision: body.decision };
}

function normalizeMentorRelationRequest(mentorRelationId: string | undefined): {
  mentor_relation_id: string;
} {
  const relationId = mentorRelationId?.trim();
  if (!relationId) {
    throw new BadRequestException("请选择师徒关系");
  }

  return { mentor_relation_id: relationId };
}

function normalizeDiplomacyProposal(
  body: ProposeSectDiplomacyRequest,
): ProposeSectDiplomacyRequest {
  const targetSectId = body?.target_sect_id?.trim();
  const rule = diplomacyRules.find((item) => item.diplomacy_type === body?.diplomacy_type);
  if (!targetSectId || !rule) {
    throw new BadRequestException("请选择有效外交提案");
  }

  return {
    target_sect_id: targetSectId,
    diplomacy_type: rule.diplomacy_type,
    message: body.message?.trim() || undefined,
  };
}

function normalizeDiplomacyReview(body: ReviewSectDiplomacyRequest): ReviewSectDiplomacyRequest {
  const diplomacyRecordId = body?.diplomacy_record_id?.trim();
  if (!diplomacyRecordId || (body.decision !== "accept" && body.decision !== "reject")) {
    throw new BadRequestException("请选择外交记录和审批结果");
  }

  return { diplomacy_record_id: diplomacyRecordId, decision: body.decision };
}

function normalizeCreateHireRequest(body: CreateSectHireRequest): CreateSectHireRequest {
  const rule = hireRules.find((item) => item.hire_type === body?.hire_type);
  if (!rule) {
    throw new BadRequestException("请选择有效雇佣类型");
  }

  return { hire_type: rule.hire_type, message: body.message?.trim() || undefined };
}

function normalizeHireRecordRequest(hireRecordId: string | undefined): { hire_record_id: string } {
  const recordId = hireRecordId?.trim();
  if (!recordId) {
    throw new BadRequestException("请选择雇佣委托");
  }

  return { hire_record_id: recordId };
}

function requireSectMember(player: PlayerWithSocial, message: string): SectMember {
  if (!player.sectMembership || !player.sectId) {
    throw new BadRequestException(message);
  }

  return player.sectMembership;
}

function requireSectOfficer(player: PlayerWithSocial, message: string): SectMember {
  const member = requireSectMember(player, message);
  if (!hasRoleAtLeast(member.role, "elder")) {
    throw new ForbiddenException(message);
  }

  return member;
}

function requireSectOperator(player: PlayerWithSocial, message: string): SectMember {
  const member = requireSectMember(player, message);
  if (!hasRoleAtLeast(member.role, "deacon")) {
    throw new ForbiddenException(message);
  }

  return member;
}

function hasRoleAtLeast(role: string, minimum: "deacon" | "elder"): boolean {
  const rank: Record<string, number> = { disciple: 1, deacon: 2, elder: 3, leader: 4 };
  return (rank[role] ?? 0) >= rank[minimum];
}

function isMentorParticipant(record: MentorRelationRecord, playerId: string): boolean {
  return record.mentorPlayerId === playerId || record.apprenticePlayerId === playerId;
}

function buildMentorTaskSummary(status: string): Record<string, unknown> {
  return {
    status,
    task_id: "mentor_first_guidance",
    progress: status === "active" ? 1 : 0,
    target: 1,
    claimed: false,
  };
}

function taskSummaryFromRecord(record: MentorRelationRecord): Record<string, unknown> {
  if (
    !record.taskSummary ||
    typeof record.taskSummary !== "object" ||
    Array.isArray(record.taskSummary)
  ) {
    return buildMentorTaskSummary(record.status);
  }

  return record.taskSummary as Record<string, unknown>;
}

function mentorRewardBoundary(): Record<string, unknown> {
  return mentorRule.reward_boundary;
}

function mentorTaskReward() {
  return {
    spirit_stone: "80",
    items: [{ item_id: "low_herb", name: "凝露草", count: 1, bind_type: "bound" }],
  };
}

function socialRiskSummary(status: string): Record<string, unknown> {
  return {
    risk_status: status,
    action: "record_score_limit_review",
    normal_script_click_allowed: true,
  };
}

function diplomacySummaryRule(): Record<string, unknown> {
  return {
    diplomacy_rules: diplomacyRules,
    boundary: diplomacyBoundary,
  };
}

function hireSummaryRule(): Record<string, unknown> {
  return {
    hire_rules: hireRules,
    boundary: hireBoundary,
  };
}

function diplomacyCooldownHours(type: string): number {
  return diplomacyRules.find((rule) => rule.diplomacy_type === type)?.cooldown_hours ?? 24;
}

function requireHireRule(hireType: string): (typeof hireRules)[number] {
  const rule = hireRules.find((item) => item.hire_type === hireType);
  if (!rule) {
    throw new BadRequestException("雇佣规则不存在");
  }

  return rule;
}

function buildHireEscrow(rule: (typeof hireRules)[number], state: "escrowed" | "settled") {
  return {
    state,
    reward: rule.reward,
    boundary: hireBoundary,
    rank_score: 0,
    contribution_multiplier: 0,
  };
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}
