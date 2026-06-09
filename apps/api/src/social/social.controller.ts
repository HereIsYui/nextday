import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type {
  AcceptSectHireRequest,
  ApplyMentorRequest,
  ClaimMentorTaskRequest,
  CreateSectHireRequest,
  GraduateMentorRequest,
  MentorMutationResponse,
  MentorSummaryResponse,
  ProposeSectDiplomacyRequest,
  ReviewMentorRequest,
  ReviewSectDiplomacyRequest,
  SectDiplomacyMutationResponse,
  SectDiplomacySummaryResponse,
  SectHireListResponse,
  SectHireMutationResponse,
  SettleSectHireRequest,
} from "@nextday/shared";
import type { Request } from "express";
import { BearerAuthGuard } from "../auth/bearer-auth.guard";
import { SocialService } from "./social.service";

@Controller("api/mentor")
@UseGuards(BearerAuthGuard)
export class MentorController {
  constructor(@Inject(SocialService) private readonly socialService: SocialService) {}

  @Get("summary")
  summary(@Req() request: Request): Promise<MentorSummaryResponse> {
    return this.socialService.getMentorSummary(requireAccountId(request));
  }

  @Post("apply")
  apply(
    @Body() body: ApplyMentorRequest,
    @Req() request: Request,
  ): Promise<MentorMutationResponse> {
    return this.socialService.applyMentor({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("review")
  review(
    @Body() body: ReviewMentorRequest,
    @Req() request: Request,
  ): Promise<MentorMutationResponse> {
    return this.socialService.reviewMentor({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("task/claim")
  claimTask(
    @Body() body: ClaimMentorTaskRequest,
    @Req() request: Request,
  ): Promise<MentorMutationResponse> {
    return this.socialService.claimMentorTask({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("graduate")
  graduate(
    @Body() body: GraduateMentorRequest,
    @Req() request: Request,
  ): Promise<MentorMutationResponse> {
    return this.socialService.graduateMentor({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }
}

@Controller("api/sect/diplomacy")
@UseGuards(BearerAuthGuard)
export class SectDiplomacyController {
  constructor(@Inject(SocialService) private readonly socialService: SocialService) {}

  @Get("summary")
  summary(@Req() request: Request): Promise<SectDiplomacySummaryResponse> {
    return this.socialService.getDiplomacySummary(requireAccountId(request));
  }

  @Post("propose")
  propose(
    @Body() body: ProposeSectDiplomacyRequest,
    @Req() request: Request,
  ): Promise<SectDiplomacyMutationResponse> {
    return this.socialService.proposeDiplomacy({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("review")
  review(
    @Body() body: ReviewSectDiplomacyRequest,
    @Req() request: Request,
  ): Promise<SectDiplomacyMutationResponse> {
    return this.socialService.reviewDiplomacy({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }
}

@Controller("api/sect/hire")
@UseGuards(BearerAuthGuard)
export class SectHireController {
  constructor(@Inject(SocialService) private readonly socialService: SocialService) {}

  @Get("list")
  list(@Req() request: Request): Promise<SectHireListResponse> {
    return this.socialService.getHireList(requireAccountId(request));
  }

  @Post("create")
  create(
    @Body() body: CreateSectHireRequest,
    @Req() request: Request,
  ): Promise<SectHireMutationResponse> {
    return this.socialService.createHire({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("accept")
  accept(
    @Body() body: AcceptSectHireRequest,
    @Req() request: Request,
  ): Promise<SectHireMutationResponse> {
    return this.socialService.acceptHire({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }

  @Post("settle")
  settle(
    @Body() body: SettleSectHireRequest,
    @Req() request: Request,
  ): Promise<SectHireMutationResponse> {
    return this.socialService.settleHire({
      accountId: requireAccountId(request),
      body,
      idempotencyKey: requireIdempotencyKey(request),
    });
  }
}

function requireAccountId(request: Request): string {
  if (!request.accountId) {
    throw new Error("缺少账号上下文");
  }

  return request.accountId;
}

function requireIdempotencyKey(request: Request): string {
  const key = request.header("Idempotency-Key");
  if (!key) {
    throw new Error("缺少幂等键");
  }

  return key;
}
