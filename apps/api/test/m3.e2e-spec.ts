import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("M3 生产成长循环", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "m3-test-secret";
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

  it("炼丹会消耗材料、写入记录，成功和失败都有可追溯结果", async () => {
    const { token, playerId } = await createM3Player(app, prisma, "炼丹", "qi");
    await grantMaterials(prisma, playerId, { lowHerb: 20, rawIron: 0, spiritStone: 2000 });

    const successKey = findIdempotencyKey("m3_alchemy_success", "recipe_juling_1", 9200, true);
    const success = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", successKey)
      .send({ recipe_id: "recipe_juling_1" })
      .expect(201);

    expect(success.body.data.record.success).toBe(true);
    expect(success.body.data.record.pill_item_id).toBe("pill_juling_1");
    expect(
      success.body.data.bag.items.some(
        (item: { item_id: string }) => item.item_id === "pill_juling_1",
      ),
    ).toBe(true);

    const failKey = findIdempotencyKey("m3_alchemy_fail", "recipe_pojing_1", 7000, false);
    const failed = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", failKey)
      .send({ recipe_id: "recipe_pojing_1" })
      .expect(201);

    expect(failed.body.data.record.success).toBe(false);
    expect(failed.body.data.record.failure_returns.items[0].item_id).toBe("pill_dust");

    const records = await request(app.getHttpServer())
      .get("/api/production/alchemy/records")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(
      records.body.data.records.map((record: { record_id: string }) => record.record_id),
    ).toContain(success.body.data.record_id);
    expect(await prisma.alchemyRecord.count({ where: { playerId } })).toBe(2);
  });

  it("服丹按同类同阶记录递减：前 3 颗 100%，第 4-10 颗 50%，第 11 颗后 10%", async () => {
    const { token, playerId } = await createM3Player(app, prisma, "服丹", "qi");
    const pillInstanceId = `item_m3_pill_${Date.now()}_${randomSuffix()}`;
    await prisma.playerItem.create({
      data: {
        itemInstanceId: pillInstanceId,
        playerId,
        itemId: "pill_juling_1",
        count: 11,
        bindType: "bound",
        sourceType: "test_seed",
        metadata: { quality: "middle" },
      },
    });

    const rates: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/production/pills/use")
        .set("Authorization", `Bearer ${token}`)
        .set("Idempotency-Key", `idem_m3_pill_${index}_${Date.now()}_${randomSuffix()}`)
        .send({ item_instance_id: pillInstanceId })
        .expect(201);

      rates.push(response.body.data.effective_rate as number);
    }

    expect(rates.slice(0, 3)).toEqual([100, 100, 100]);
    expect(rates.slice(3, 10)).toEqual([50, 50, 50, 50, 50, 50, 50]);
    expect(rates[10]).toBe(10);
  });

  it("炼器不产出九大古宝，铭刻锁定词条后淬炼不会改变锁定词条", async () => {
    const { token, playerId } = await createM3Player(app, prisma, "炼器", "qi");
    await grantMaterials(prisma, playerId, { lowHerb: 0, rawIron: 30, spiritStone: 3000 });

    const forged = await request(app.getHttpServer())
      .post("/api/production/forge/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_forge_${Date.now()}_${randomSuffix()}`)
      .send({ recipe_id: "forge_xuantie_sword_1" })
      .expect(201);

    const equipment = forged.body.data.equipment;
    expect(equipment.equipment_id).not.toContain("ancient_treasure");
    expect(equipment.name).not.toContain("古宝");

    const subAffix = equipment.affixes.find(
      (affix: { affix_type: string }) => affix.affix_type === "sub",
    );
    expect(subAffix).toBeTruthy();

    const inscribed = await request(app.getHttpServer())
      .post("/api/production/equipment/inscribe")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_inscribe_${Date.now()}_${randomSuffix()}`)
      .send({
        equipment_instance_id: equipment.equipment_instance_id,
        affix_id: subAffix.affix_id,
      })
      .expect(201);
    const lockedAffix = inscribed.body.data.equipment.affixes.find(
      (affix: { affix_id: string }) => affix.affix_id === subAffix.affix_id,
    );
    expect(lockedAffix.locked).toBe(true);

    const refined = await request(app.getHttpServer())
      .post("/api/production/equipment/refine")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_refine_${Date.now()}_${randomSuffix()}`)
      .send({ equipment_instance_id: equipment.equipment_instance_id })
      .expect(201);
    const preserved = refined.body.data.equipment.affixes.find(
      (affix: { affix_id: string }) => affix.affix_id === subAffix.affix_id,
    );

    expect(preserved).toMatchObject({
      affix_id: subAffix.affix_id,
      affix_key: subAffix.affix_key,
      value: subAffix.value,
      locked: true,
    });
  });

  it("锁定法宝不能分解，解锁后可分解并返还材料", async () => {
    const { token, playerId } = await createM3Player(app, prisma, "分解", "qi");
    await grantMaterials(prisma, playerId, { lowHerb: 0, rawIron: 20, spiritStone: 2000 });

    const forged = await request(app.getHttpServer())
      .post("/api/production/forge/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_decompose_forge_${Date.now()}_${randomSuffix()}`)
      .send({ recipe_id: "forge_xuantie_sword_1" })
      .expect(201);
    const equipmentId = forged.body.data.equipment.equipment_instance_id as string;

    await request(app.getHttpServer())
      .post("/api/production/equipment/lock")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_lock_${Date.now()}_${randomSuffix()}`)
      .send({ equipment_instance_id: equipmentId, locked: true })
      .expect(201);

    const lockedDecompose = await request(app.getHttpServer())
      .post("/api/production/equipment/decompose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_locked_decompose_${Date.now()}_${randomSuffix()}`)
      .send({ equipment_instance_id: equipmentId })
      .expect(400);
    expect(lockedDecompose.body.message).toContain("已锁定");

    await request(app.getHttpServer())
      .post("/api/production/equipment/lock")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_unlock_${Date.now()}_${randomSuffix()}`)
      .send({ equipment_instance_id: equipmentId, locked: false })
      .expect(201);

    const decomposed = await request(app.getHttpServer())
      .post("/api/production/equipment/decompose")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_decompose_${Date.now()}_${randomSuffix()}`)
      .send({ equipment_instance_id: equipmentId })
      .expect(201);

    expect(decomposed.body.data.equipment.status).toBe("decomposed");
    expect(
      decomposed.body.data.rewards.items.some(
        (item: { item_id: string }) => item.item_id === "artifact_soul",
      ),
    ).toBe(true);
  });

  it("技能预设保存后，普通探索战报会写入玩家配置的技能名", async () => {
    const { token } = await createM3Player(app, prisma, "技能", "qi");

    await request(app.getHttpServer())
      .post("/api/production/skills/loadout")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_skill_${Date.now()}_${randomSuffix()}`)
      .send({
        active_skill_ids: ["skill_lingdun", "skill_yuhuo", "skill_xiaozhoutian"],
        treasure_skill_id: "skill_benming_faguang",
        auto_priority: [
          "skill_benming_faguang",
          "skill_xiaozhoutian",
          "skill_yuhuo",
          "skill_lingdun",
        ],
      })
      .expect(201);

    const explored = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_skill_explore_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji", count: 1 })
      .expect(201);
    await prisma.exploreActionRecord.update({
      where: { recordId: explored.body.data.record_id },
      data: { completesAt: new Date(Date.now() - 1000) },
    });
    const claimed = await request(app.getHttpServer())
      .post("/api/game/explore/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_m3_skill_claim_${Date.now()}_${randomSuffix()}`)
      .send({ record_id: explored.body.data.record_id })
      .expect(201);

    const skillNames = claimed.body.data.battles[0].log.map(
      (round: { skill: string }) => round.skill,
    );
    expect(skillNames).toContain("小周天剑气");
    expect(skillNames).toContain("本命法光");
  });

  it("生产状态变更接口缺少幂等键时被拒绝", async () => {
    const { token } = await createM3Player(app, prisma, "缺键", "qi");

    const response = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .send({ recipe_id: "recipe_juling_1" })
      .expect(400);

    expect(response.body.message).toContain("Idempotency-Key");
  });

  it("M3 新增配置类型都返回合法 envelope", async () => {
    for (const configType of ["pill", "forge", "skill", "bag"]) {
      const response = await request(app.getHttpServer())
        .get(`/api/config/${configType}`)
        .expect(200);

      expect(response.body.data.config_type).toBe(configType);
      expect(response.body.data.ruleset_version).toBe("ruleset_m3_v1");
    }
  });
});

async function createM3Player(
  app: INestApplication,
  prisma: PrismaClient,
  namePrefix: string,
  route: "qi" | "body",
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `m3_${namePrefix}_${nonce}`, nickname: `${namePrefix}道友` })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_m3_create_${nonce}`)
    .send({ name: `${namePrefix}${nonce}`.slice(0, 16), route })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;

  await prisma.playerProgress.update({
    where: { playerId },
    data: { lastCultivationAt: new Date() },
  });

  return { token, playerId };
}

async function grantMaterials(
  prisma: PrismaClient,
  playerId: string,
  input: { lowHerb: number; rawIron: number; spiritStone: number },
) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: { increment: BigInt(input.spiritStone) } },
  });

  if (input.lowHerb > 0) {
    await prisma.playerItem.create({
      data: {
        itemInstanceId: `item_m3_herb_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "low_herb",
        count: input.lowHerb,
        bindType: "bound",
        sourceType: "test_seed",
      },
    });
  }

  if (input.rawIron > 0) {
    await prisma.playerItem.create({
      data: {
        itemInstanceId: `item_m3_iron_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId: "raw_iron",
        count: input.rawIron,
        bindType: "bound",
        sourceType: "test_seed",
      },
    });
  }
}

function findIdempotencyKey(
  prefix: string,
  recipeId: string,
  threshold: number,
  shouldSucceed: boolean,
): string {
  for (let index = 0; index < 1000; index += 1) {
    const key = `idem_${prefix}_${Date.now()}_${randomSuffix()}_${index}`;
    const roll = roll10000(`${key}:${recipeId}:success`);
    if ((shouldSucceed && roll < threshold) || (!shouldSucceed && roll >= threshold)) {
      return key;
    }
  }

  throw new Error("未找到满足期望的幂等键");
}

function roll10000(seed: string): number {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  }
  return hash;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
