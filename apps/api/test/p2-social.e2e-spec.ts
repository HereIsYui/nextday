import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P2-4 高级社交系统", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p2-social-secret";
    process.env.ADMIN_DEV_TOKEN = process.env.ADMIN_DEV_TOKEN || "nextday-admin-dev";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await app?.close();
  });

  it("P2 社交配置可读取，且禁止付费资产、唯一战力和贡献倍率", async () => {
    const { token } = await createP2SocialPlayer(app, prisma, "配置");

    for (const configType of ["mentor_rule", "sect_diplomacy", "sect_hire"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

      expect(response.body.data.config_type).toBe(configType);
      const payloadText = JSON.stringify(response.body.data.payload);
      expect(payloadText).not.toMatch(
        /jade_paid|unique_power_item":true|contribution_multiplier":1/i,
      );
    }

    const hireConfig = await request(app.getHttpServer())
      .get("/api/config/sect_hire")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(hireConfig.body.data.payload.contribution_multiplier_allowed).toBe(false);
    expect(hireConfig.body.data.payload.rank_score_allowed).toBe(false);
  });

  it("导师申请、审批、指点任务和出师均支持幂等，不重复发放奖励", async () => {
    const mentor = await createP2SocialPlayer(app, prisma, "导师");
    const apprentice = await createP2SocialPlayer(app, prisma, "徒弟");

    await request(app.getHttpServer())
      .post("/api/mentor/apply")
      .set("Authorization", `Bearer ${apprentice.token}`)
      .set("Idempotency-Key", `idem_p2_mentor_self_${Date.now()}_${randomSuffix()}`)
      .send({ mentor_player_id: apprentice.playerId })
      .expect(400);

    const applyKey = `idem_p2_mentor_apply_${Date.now()}_${randomSuffix()}`;
    const applyBody = { mentor_player_id: mentor.playerId };
    const applied = await request(app.getHttpServer())
      .post("/api/mentor/apply")
      .set("Authorization", `Bearer ${apprentice.token}`)
      .set("Idempotency-Key", applyKey)
      .send(applyBody)
      .expect(201);
    const repeatedApply = await request(app.getHttpServer())
      .post("/api/mentor/apply")
      .set("Authorization", `Bearer ${apprentice.token}`)
      .set("Idempotency-Key", applyKey)
      .send(applyBody)
      .expect(201);

    expect(repeatedApply.body.data.record_id).toBe(applied.body.data.record_id);
    expect(
      await prisma.mentorRelationRecord.count({
        where: { apprenticePlayerId: apprentice.playerId, mentorPlayerId: mentor.playerId },
      }),
    ).toBe(1);

    const secondMentor = await createP2SocialPlayer(app, prisma, "二师");
    await request(app.getHttpServer())
      .post("/api/mentor/apply")
      .set("Authorization", `Bearer ${apprentice.token}`)
      .set("Idempotency-Key", `idem_p2_mentor_second_${Date.now()}_${randomSuffix()}`)
      .send({ mentor_player_id: secondMentor.playerId })
      .expect(400);

    const relationId = applied.body.data.relation.mentor_relation_id as string;
    const reviewKey = `idem_p2_mentor_review_${Date.now()}_${randomSuffix()}`;
    const reviewed = await request(app.getHttpServer())
      .post("/api/mentor/review")
      .set("Authorization", `Bearer ${mentor.token}`)
      .set("Idempotency-Key", reviewKey)
      .send({ decision: "accept", mentor_relation_id: relationId })
      .expect(201);
    const repeatedReview = await request(app.getHttpServer())
      .post("/api/mentor/review")
      .set("Authorization", `Bearer ${mentor.token}`)
      .set("Idempotency-Key", reviewKey)
      .send({ decision: "accept", mentor_relation_id: relationId })
      .expect(201);

    expect(repeatedReview.body.data.record_id).toBe(reviewed.body.data.record_id);
    expect(reviewed.body.data.relation.status).toBe("active");

    const walletBefore = await prisma.playerWallet.findUniqueOrThrow({
      where: { playerId: apprentice.playerId },
    });
    const claimKey = `idem_p2_mentor_task_${Date.now()}_${randomSuffix()}`;
    const claimed = await request(app.getHttpServer())
      .post("/api/mentor/task/claim")
      .set("Authorization", `Bearer ${apprentice.token}`)
      .set("Idempotency-Key", claimKey)
      .send({ mentor_relation_id: relationId })
      .expect(201);
    const repeatedClaim = await request(app.getHttpServer())
      .post("/api/mentor/task/claim")
      .set("Authorization", `Bearer ${apprentice.token}`)
      .set("Idempotency-Key", claimKey)
      .send({ mentor_relation_id: relationId })
      .expect(201);

    expect(repeatedClaim.body.data.record_id).toBe(claimed.body.data.record_id);
    expect(claimed.body.data.rewards.spirit_stone).toBe("80");
    const walletAfter = await prisma.playerWallet.findUniqueOrThrow({
      where: { playerId: apprentice.playerId },
    });
    expect(walletAfter.spiritStone - walletBefore.spiritStone).toBe(80n);
    expect(
      await prisma.walletLog.count({
        where: { playerId: apprentice.playerId, sourceType: "mentor_task" },
      }),
    ).toBe(1);

    const graduated = await request(app.getHttpServer())
      .post("/api/mentor/graduate")
      .set("Authorization", `Bearer ${apprentice.token}`)
      .set("Idempotency-Key", `idem_p2_mentor_grad_${Date.now()}_${randomSuffix()}`)
      .send({ mentor_relation_id: relationId })
      .expect(201);
    expect(graduated.body.data.relation.status).toBe("graduated");
  });

  it("宗门外交需权限审批，不能由非目标宗门处理", async () => {
    const source = await createP2SocialPlayer(app, prisma, "盟源");
    const target = await createP2SocialPlayer(app, prisma, "盟目");
    const outsider = await createP2SocialPlayer(app, prisma, "旁观");
    const sourceSect = await createSect(app, prisma, source, "源宗");
    const targetSect = await createSect(app, prisma, target, "目标宗");
    await createSect(app, prisma, outsider, "旁观宗");

    const proposed = await request(app.getHttpServer())
      .post("/api/sect/diplomacy/propose")
      .set("Authorization", `Bearer ${source.token}`)
      .set("Idempotency-Key", `idem_p2_diplomacy_${Date.now()}_${randomSuffix()}`)
      .send({
        diplomacy_type: "alliance",
        message: "共守九州。",
        target_sect_id: targetSect.sect_id,
      })
      .expect(201);
    expect(proposed.body.data.diplomacy.source_sect_id).toBe(sourceSect.sect_id);
    expect(proposed.body.data.diplomacy.status).toBe("proposed");

    const recordId = proposed.body.data.diplomacy.diplomacy_record_id as string;
    await request(app.getHttpServer())
      .post("/api/sect/diplomacy/review")
      .set("Authorization", `Bearer ${outsider.token}`)
      .set("Idempotency-Key", `idem_p2_diplomacy_forbidden_${Date.now()}_${randomSuffix()}`)
      .send({ decision: "accept", diplomacy_record_id: recordId })
      .expect(403);

    const reviewed = await request(app.getHttpServer())
      .post("/api/sect/diplomacy/review")
      .set("Authorization", `Bearer ${target.token}`)
      .set("Idempotency-Key", `idem_p2_diplomacy_review_${Date.now()}_${randomSuffix()}`)
      .send({ decision: "accept", diplomacy_record_id: recordId })
      .expect(201);
    expect(reviewed.body.data.diplomacy.status).toBe("active");
  });

  it("跨宗门雇佣不能接本宗门委托，结算只发普通灵石且支持幂等", async () => {
    const employer = await createP2SocialPlayer(app, prisma, "雇主");
    const helper = await createP2SocialPlayer(app, prisma, "帮手");
    const employerSect = await createSect(app, prisma, employer, "雇主宗");
    const helperSect = await createSect(app, prisma, helper, "帮手宗");

    const created = await request(app.getHttpServer())
      .post("/api/sect/hire/create")
      .set("Authorization", `Bearer ${employer.token}`)
      .set("Idempotency-Key", `idem_p2_hire_create_${Date.now()}_${randomSuffix()}`)
      .send({ hire_type: "tower_supply", message: "请协助补给九塔。" })
      .expect(201);

    expect(created.body.data.hire.employer_sect_id).toBe(employerSect.sect_id);
    expect(created.body.data.hire.reward_escrow_summary.reward.paid_jade).toBe("0");
    expect(created.body.data.hire.reward_escrow_summary.rank_score).toBe(0);
    expect(created.body.data.hire.reward_escrow_summary.contribution_multiplier).toBe(0);

    const hireId = created.body.data.hire.hire_record_id as string;
    await request(app.getHttpServer())
      .post("/api/sect/hire/accept")
      .set("Authorization", `Bearer ${employer.token}`)
      .set("Idempotency-Key", `idem_p2_hire_same_${Date.now()}_${randomSuffix()}`)
      .send({ hire_record_id: hireId })
      .expect(400);

    const accepted = await request(app.getHttpServer())
      .post("/api/sect/hire/accept")
      .set("Authorization", `Bearer ${helper.token}`)
      .set("Idempotency-Key", `idem_p2_hire_accept_${Date.now()}_${randomSuffix()}`)
      .send({ hire_record_id: hireId })
      .expect(201);
    expect(accepted.body.data.hire.helper_sect_id).toBe(helperSect.sect_id);
    expect(accepted.body.data.hire.status).toBe("accepted");

    const walletBefore = await prisma.playerWallet.findUniqueOrThrow({
      where: { playerId: helper.playerId },
    });
    const settleKey = `idem_p2_hire_settle_${Date.now()}_${randomSuffix()}`;
    const settled = await request(app.getHttpServer())
      .post("/api/sect/hire/settle")
      .set("Authorization", `Bearer ${helper.token}`)
      .set("Idempotency-Key", settleKey)
      .send({ hire_record_id: hireId })
      .expect(201);
    const repeatedSettle = await request(app.getHttpServer())
      .post("/api/sect/hire/settle")
      .set("Authorization", `Bearer ${helper.token}`)
      .set("Idempotency-Key", settleKey)
      .send({ hire_record_id: hireId })
      .expect(201);

    expect(repeatedSettle.body.data.record_id).toBe(settled.body.data.record_id);
    expect(settled.body.data.hire.status).toBe("settled");
    expect(settled.body.data.hire.settlement_status).toBe("settled");
    expect(settled.body.data.rewards.spirit_stone).toBe("40");
    expect(JSON.stringify(settled.body.data)).not.toMatch(/jade_paid|ancient_treasure|unique/i);
    const walletAfter = await prisma.playerWallet.findUniqueOrThrow({
      where: { playerId: helper.playerId },
    });
    expect(walletAfter.spiritStone - walletBefore.spiritStone).toBe(40n);
  });
});

async function createP2SocialPlayer(
  app: INestApplication,
  prisma: PrismaClient,
  label: string,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p2_social_${label}_${nonce}`, nickname: `${label}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_social_create_${nonce}`)
    .send({ name: `${label}${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { chapterId: 2, lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function createSect(
  app: INestApplication,
  prisma: PrismaClient,
  player: { token: string; playerId: string },
  label: string,
): Promise<{ sect_id: string; name: string }> {
  await grantSpiritStone(prisma, player.playerId, 1000);
  const response = await request(app.getHttpServer())
    .post("/api/multiplayer/sects/create")
    .set("Authorization", `Bearer ${player.token}`)
    .set("Idempotency-Key", `idem_p2_social_sect_${Date.now()}_${randomSuffix()}`)
    .send({ alignment: "neutral", name: `${label}${randomSuffix()}`.slice(0, 18) })
    .expect(201);

  return {
    name: response.body.data.sect.name as string,
    sect_id: response.body.data.sect.sect_id as string,
  };
}

async function grantSpiritStone(
  prisma: PrismaClient,
  playerId: string,
  amount: number,
): Promise<void> {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: BigInt(amount) } },
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
