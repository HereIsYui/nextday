import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { defaultEraId } from "../src/game/game.constants";
import { configureApp } from "../src/platform/configure-app";

describe("P3-3 技能学习与战报建议", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p3-combat-skill-secret";
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
    await prisma.$disconnect();
    await app.close();
  });

  it("技能预设会区分已掌握、可学习和战报建议", async () => {
    const { token, playerId } = await createP3SkillPlayer(app);
    await createRecentArrayBattle(prisma, playerId);

    const loadout = await request(app.getHttpServer())
      .get("/api/production/skills/loadout")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const skills = loadout.body.data.available_skills as Array<{
      skill_id: string;
      learned: boolean;
      learnable: boolean;
      unlock_reasons: string[];
      learn_cost?: { spirit_stone?: string; items?: Array<{ item_id: string; count: number }> };
    }>;
    const yuhuo = skills.find((skill) => skill.skill_id === "skill_yuhuo");
    const pozhen = skills.find((skill) => skill.skill_id === "skill_pozhen_jian");
    const leihuo = skills.find((skill) => skill.skill_id === "skill_leihuo_yin");

    expect(yuhuo?.learned).toBe(true);
    expect(pozhen).toMatchObject({
      learned: false,
      learnable: true,
    });
    expect(pozhen?.learn_cost?.spirit_stone).toBe("120");
    expect(pozhen?.learn_cost?.items?.[0]).toMatchObject({
      count: 2,
      item_id: "raw_iron",
    });
    expect(leihuo?.learnable).toBe(false);
    expect(leihuo?.unlock_reasons.join("、")).toContain("5 级");
    expect(
      loadout.body.data.preset_suggestions.some((suggestion: { reason: string }) =>
        suggestion.reason.includes("破阵剑诀"),
      ),
    ).toBe(true);
  });

  it("未学习进阶技能不能保存预设，学习后可保存且幂等不重复扣资源", async () => {
    const { token, playerId } = await createP3SkillPlayer(app);

    await request(app.getHttpServer())
      .post("/api/production/skills/loadout")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_skill_save_before_${Date.now()}_${randomSuffix()}`)
      .send({
        active_skill_ids: ["skill_pozhen_jian"],
        auto_priority: ["skill_benming_faguang", "skill_pozhen_jian"],
        treasure_skill_id: "skill_benming_faguang",
      })
      .expect(400);

    await grantSkillLearningCost(prisma, playerId);

    const idempotencyKey = `idem_p3_skill_learn_${Date.now()}_${randomSuffix()}`;
    const learned = await request(app.getHttpServer())
      .post("/api/production/skills/learn")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ skill_id: "skill_pozhen_jian" })
      .expect(201);

    expect(learned.body.data.skill).toMatchObject({
      learned: true,
      skill_id: "skill_pozhen_jian",
    });
    expect(learned.body.data.wallet.spirit_stone).toBe("180");
    expect(
      learned.body.data.bag.items.find((item: { item_id: string }) => item.item_id === "raw_iron")
        ?.count,
    ).toBe("2");

    await request(app.getHttpServer())
      .post("/api/production/skills/learn")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ skill_id: "skill_pozhen_jian" })
      .expect(201);

    const wallet = await prisma.playerWallet.findUniqueOrThrow({ where: { playerId } });
    const remainingIron = await prisma.playerItem.aggregate({
      _sum: { count: true },
      where: { playerId, itemId: "raw_iron" },
    });
    const skillRecords = await prisma.playerSkillRecord.count({
      where: { playerId, skillId: "skill_pozhen_jian" },
    });
    expect(wallet.spiritStone).toBe(180n);
    expect(remainingIron._sum.count).toBe(2n);
    expect(skillRecords).toBe(1);

    const saved = await request(app.getHttpServer())
      .post("/api/production/skills/loadout")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_skill_save_after_${Date.now()}_${randomSuffix()}`)
      .send({
        active_skill_ids: ["skill_lingdun", "skill_yuhuo", "skill_pozhen_jian"],
        auto_priority: [
          "skill_benming_faguang",
          "skill_pozhen_jian",
          "skill_lingdun",
          "skill_yuhuo",
        ],
        treasure_skill_id: "skill_benming_faguang",
      })
      .expect(201);

    expect(saved.body.data.active_skill_ids).toContain("skill_pozhen_jian");
    expect(saved.body.data.auto_priority[1]).toBe("skill_pozhen_jian");
  });

  it("探索战报返回反制建议，技能配置暴露学习规则", async () => {
    const { token, playerId } = await createP3SkillPlayer(app);
    await createRecentArrayBattle(prisma, playerId);

    const battles = await request(app.getHttpServer())
      .get("/api/game/battles")
      .query({ province_id: "ji", enemy_trait: "阵痕" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(battles.body.data.battles[0].enemy_traits).toContain("阵痕");
    expect(battles.body.data.battles[0].counter_suggestions.join("、")).toContain("克制技能");

    const skillConfig = await request(app.getHttpServer()).get("/api/config/skill").expect(200);
    expect(skillConfig.body.data.config_version).toBe("skill_p3_v1");
    expect(skillConfig.body.data.payload.learning_config_version).toBe("skill_learning_p3_v1");
    expect(
      skillConfig.body.data.payload.learning_rules.some(
        (rule: { skillId: string; cost: { spirit_stone?: string } }) =>
          rule.skillId === "skill_pozhen_jian" && rule.cost.spirit_stone === "120",
      ),
    ).toBe(true);
  });

  it("九塔和 Boss 返回结构化战斗原因与下一步建议", async () => {
    const attacker = await createP3SkillPlayer(app);

    const towers = await request(app.getHttpServer())
      .get("/api/multiplayer/towers")
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    const tower = towers.body.data.towers[0] as { tower_id: string };
    const towerAction = await request(app.getHttpServer())
      .post("/api/multiplayer/towers/action")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p3_tower_reason_${Date.now()}_${randomSuffix()}`)
      .send({ tower_id: tower.tower_id, action_type: "supply", count: 1 })
      .expect(201);

    expect(towerAction.body.data.reason_summary.join("、")).toContain("贡献");
    expect(towerAction.body.data.counter_suggestions.join("、")).toContain("镇封");
    expect(towerAction.body.data.battle_hint).toContain("塔");

    const boss = await request(app.getHttpServer())
      .get("/api/multiplayer/boss")
      .set("Authorization", `Bearer ${attacker.token}`)
      .expect(200);
    const bossChallenge = await request(app.getHttpServer())
      .post("/api/multiplayer/boss/challenge")
      .set("Authorization", `Bearer ${attacker.token}`)
      .set("Idempotency-Key", `idem_p3_boss_reason_${Date.now()}_${randomSuffix()}`)
      .send({ boss_id: boss.body.data.boss.boss_id })
      .expect(201);

    expect(bossChallenge.body.data.reason_summary.join("、")).toContain("伤害");
    expect(bossChallenge.body.data.counter_suggestions.join("、")).toContain("技能预设");
    expect(bossChallenge.body.data.battle_hint).toContain("Boss");
  });
});

async function createP3SkillPlayer(
  app: INestApplication,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p3_skill_${nonce}`, nickname: "P3技法客" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p3_skill_create_${nonce}`)
    .send({ name: `技法${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);

  return {
    playerId: createResponse.body.data.profile.player.player_id as string,
    token,
  };
}

async function grantSkillLearningCost(prisma: PrismaClient, playerId: string) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: 300n },
  });
  await prisma.playerItem.create({
    data: {
      bindType: "bound",
      count: 4n,
      itemId: "raw_iron",
      itemInstanceId: `item_p3_skill_iron_${Date.now()}_${randomSuffix()}`,
      playerId,
      sourceType: "p3_skill_test",
    },
  });
}

async function createRecentArrayBattle(prisma: PrismaClient, playerId: string) {
  await prisma.battleLog.create({
    data: {
      battleId: `battle_p3_skill_${Date.now()}_${randomSuffix()}`,
      battleLog: [
        { actor: "enemy", damage: 18, round: 1, skill: "塔影压身", target_hp: 82 },
        { actor: "player", damage: 90, round: 2, skill: "小周天剑气", target_hp: 0 },
      ],
      battleType: "explore",
      damageDone: 90,
      damageTaken: 18,
      enemyId: "ji_ta_shadow",
      enemyName: "塔影残魇",
      eraId: defaultEraId,
      playerId,
      provinceId: "ji",
      result: "win",
      rewardSnapshot: {
        items: [{ bind_type: "bound", count: 1, item_id: "raw_iron", name: "玄铁砂" }],
      },
      rounds: 2,
    },
  });
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
