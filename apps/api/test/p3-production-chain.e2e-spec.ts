import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { getExploreCultivationReward } from "../src/game/cultivation-progress";
import { configureApp } from "../src/platform/configure-app";
import {
  buildProductionBalanceWarnings,
  getMaterialCompositionHash,
  materialSourceConfigs,
} from "../src/production/production.constants";

type CraftKind = "alchemy" | "forge";
type CraftMaterial = { item_id: string; count: number };
type ProductionEffectRow = {
  effectId: string;
  effectType: string;
  effectValue: number;
  remainingUses: number;
  consumedAt: Date | null;
};

describe("P3-2 自研丹器与材料链", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p3-production-secret";
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

  it("材料接口只公开专用可投炉材料，默认配方路由已移除", async () => {
    const { token } = await createP3ProductionPlayer(app, prisma);

    const alchemy = await request(app.getHttpServer())
      .get("/api/production/materials?kind=alchemy")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(alchemy.body.data.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "alch_moon_dew_herb", kind: "alchemy" }),
        expect.objectContaining({ item_id: "alch_break_marrow_root", kind: "alchemy" }),
        expect.objectContaining({ item_id: "alch_void_moss", kind: "alchemy" }),
      ]),
    );
    expect(
      alchemy.body.data.materials.every(
        (material: { kind: string }) => material.kind === "alchemy",
      ),
    ).toBe(true);
    expect(alchemy.body.data.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item_id: "low_herb",
          kind: "alchemy",
          source_hint: "冀州探索、首章任务",
        }),
      ]),
    );

    const forge = await request(app.getHttpServer())
      .get("/api/production/materials?kind=forge")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(forge.body.data.materials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ item_id: "forge_star_iron", kind: "forge" }),
        expect.objectContaining({ item_id: "forge_spiritwood_core", kind: "forge" }),
        expect.objectContaining({ item_id: "forge_artifact_marrow", kind: "forge" }),
      ]),
    );
    expect(
      forge.body.data.materials.every((material: { kind: string }) => material.kind === "forge"),
    ).toBe(true);

    await request(app.getHttpServer())
      .get("/api/production/alchemy/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get("/api/production/forge/recipes")
      .set("Authorization", `Bearer ${token}`)
      .expect(404);
  });

  it("无序材料组合稳定结算、扣除材料，未知组合失败且不可保存单方", async () => {
    const { token, playerId } = await createP3ProductionPlayer(app, prisma);
    const materials: CraftMaterial[] = [
      { item_id: "alch_moon_dew_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    await grantProductionMaterials(prisma, playerId, {
      alch_moon_dew_herb: 4,
      alch_spirit_resin: 2,
      alch_sunfire_petal: 1,
    });
    const beforeMoonHerb = await getItemCount(prisma, playerId, "alch_moon_dew_herb");
    const beforeSpiritResin = await getItemCount(prisma, playerId, "alch_spirit_resin");

    const firstKey = findCraftSuccessKey("p3_unordered_first", "alchemy", materials, 8800);
    const first = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", firstKey)
      .send({
        materials: [
          { item_id: "alch_spirit_resin", count: 1 },
          { item_id: "alch_moon_dew_herb", count: 1 },
          { item_id: "alch_moon_dew_herb", count: 1 },
        ],
      })
      .expect(201);
    const replayedFirst = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", firstKey)
      .send({ materials })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set(
        "Idempotency-Key",
        findCraftSuccessKey("p3_unordered_second", "alchemy", materials, 8800),
      )
      .send({ materials })
      .expect(201);

    expect(first.body.data.record.success).toBe(true);
    expect(replayedFirst.body.data.record_id).toBe(first.body.data.record_id);
    expect(second.body.data.record.success).toBe(true);
    expect(first.body.data.record.pill_item_id).toBe("pill_nourishing_essence");
    expect(second.body.data.record.pill_item_id).toBe("pill_nourishing_essence");
    expect(first.body.data.discovery.composition_hash).toBe(
      second.body.data.discovery.composition_hash,
    );
    expect(first.body.data.discovery.result_template).toEqual(
      second.body.data.discovery.result_template,
    );
    expect(await getItemCount(prisma, playerId, "alch_moon_dew_herb")).toBe(beforeMoonHerb - 4);
    expect(await getItemCount(prisma, playerId, "alch_spirit_resin")).toBe(beforeSpiritResin - 2);

    const failed = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_unknown_${Date.now()}_${randomSuffix()}`)
      .send({ materials: [{ item_id: "alch_sunfire_petal", count: 1 }] })
      .expect(201);
    expect(failed.body.data.record.success).toBe(false);
    expect(failed.body.data.record.pill_item_id).toBeNull();
    expect(failed.body.data.record.failure_returns.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ item_id: "pill_dust" })]),
    );

    const failedSave = await request(app.getHttpServer())
      .post("/api/production/formulas")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_failed_formula_${Date.now()}_${randomSuffix()}`)
      .send({ kind: "alchemy", source_record_id: failed.body.data.record_id, name: "炉灰残卷" })
      .expect(400);
    expect(failedSave.body.message).toContain("成功的炼丹记录");
  });

  it("不同幂等键并发炼丹不会重复扣除同一批材料", async () => {
    const { token, playerId } = await createP3ProductionPlayer(app, prisma);
    const materials: CraftMaterial[] = [
      { item_id: "alch_moon_dew_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    await grantProductionMaterials(prisma, playerId, {
      alch_moon_dew_herb: 2,
      alch_spirit_resin: 1,
    });
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post("/api/production/alchemy/craft")
        .set("Authorization", `Bearer ${token}`)
        .set(
          "Idempotency-Key",
          findCraftSuccessKey("p3_concurrent_craft_a", "alchemy", materials, 8800),
        )
        .send({ materials }),
      request(app.getHttpServer())
        .post("/api/production/alchemy/craft")
        .set("Authorization", `Bearer ${token}`)
        .set(
          "Idempotency-Key",
          findCraftSuccessKey("p3_concurrent_craft_b", "alchemy", materials, 8800),
        )
        .send({ materials }),
    ]);
    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);
    expect(responses.filter((response) => response.status === 400)).toHaveLength(1);
    expect(await getItemCount(prisma, playerId, "alch_moon_dew_herb")).toBe(0);
    expect(await getItemCount(prisma, playerId, "alch_spirit_resin")).toBe(0);
  });

  it("冀州首炉丹组合可成功炼制，失败炼丹不推进第一炉丹任务", async () => {
    const { token, playerId } = await createP3ProductionPlayer(app, prisma);
    const starterMaterials: CraftMaterial[] = [
      { item_id: "low_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    await grantProductionMaterials(prisma, playerId, {
      alch_spirit_resin: 2,
      low_herb: 2,
    });

    const failed = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_first_furnace_failed_${Date.now()}_${randomSuffix()}`)
      .send({ materials: [{ item_id: "alch_spirit_resin", count: 1 }] })
      .expect(201);
    expect(failed.body.data.record.success).toBe(false);
    expect(failed.body.data.completed_task_ids).not.toContain("novice_craft_alchemy");

    const afterFailure = await request(app.getHttpServer())
      .get("/api/game/tasks")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(
      afterFailure.body.data.tasks.find(
        (task: { task_id: string }) => task.task_id === "novice_craft_alchemy",
      ),
    ).toMatchObject({ status: "in_progress" });

    const completed = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${token}`)
      .set(
        "Idempotency-Key",
        findCraftSuccessKey("p3_first_furnace", "alchemy", starterMaterials, 10000),
      )
      .send({ materials: starterMaterials })
      .expect(201);
    expect(completed.body.data.record.success).toBe(true);
    expect(completed.body.data.record.pill_item_id).toBe("pill_nourishing_essence");
    expect(completed.body.data.completed_task_ids).toContain("novice_craft_alchemy");

    const afterSuccess = await request(app.getHttpServer())
      .get("/api/game/tasks")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(
      afterSuccess.body.data.tasks.find(
        (task: { task_id: string }) => task.task_id === "novice_craft_alchemy",
      ),
    ).toMatchObject({ status: "completed" });
  });

  it("炼器组合稳定决定法宝模板，词条随炼制记录变化且成功记录可保存器方", async () => {
    const { token, playerId } = await createP3ProductionPlayer(app, prisma);
    const materials: CraftMaterial[] = [
      { item_id: "forge_star_iron", count: 3 },
      { item_id: "forge_spiritwood_core", count: 1 },
    ];
    await grantProductionMaterials(prisma, playerId, {
      forge_star_iron: 6,
      forge_spiritwood_core: 2,
    });

    const firstKey = findCraftSuccessKey("p3_forge_first", "forge", materials, 9000);
    const first = await request(app.getHttpServer())
      .post("/api/production/forge/craft")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", firstKey)
      .send({ materials })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post("/api/production/forge/craft")
      .set("Authorization", `Bearer ${token}`)
      .set(
        "Idempotency-Key",
        findForgeSuccessKeyWithDifferentMainValue("p3_forge_second", materials, firstKey),
      )
      .send({
        materials: [
          { item_id: "forge_spiritwood_core", count: 1 },
          { item_id: "forge_star_iron", count: 3 },
        ],
      })
      .expect(201);

    expect(first.body.data.discovery.success).toBe(true);
    expect(second.body.data.discovery.success).toBe(true);
    expect(first.body.data.discovery.result_template).toEqual(
      second.body.data.discovery.result_template,
    );
    expect(first.body.data.equipment).toMatchObject({
      equipment_id: "equipment_starwood_blade",
      equipment_type: "weapon",
      rarity: "ordinary",
    });
    expect(second.body.data.equipment.equipment_instance_id).not.toBe(
      first.body.data.equipment.equipment_instance_id,
    );
    const firstMain = first.body.data.equipment.affixes.find(
      (affix: { affix_type: string }) => affix.affix_type === "main",
    );
    const secondMain = second.body.data.equipment.affixes.find(
      (affix: { affix_type: string }) => affix.affix_type === "main",
    );
    expect(firstMain.value).not.toBe(secondMain.value);

    const saved = await request(app.getHttpServer())
      .post("/api/production/formulas")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_save_forge_${Date.now()}_${randomSuffix()}`)
      .send({ kind: "forge", source_record_id: first.body.data.record_id, name: "星木长锋器方" })
      .expect(201);
    expect(saved.body.data.formula).toMatchObject({
      kind: "forge",
      visibility: "private",
      source_record_id: first.body.data.record_id,
    });
    expect(saved.body.data.formula.result_template.forge.equipment_id).toBe(
      "equipment_starwood_blade",
    );
  });

  it("单方仅作者可公开，公开后其他玩家可检索并复用，取消公开后立即收回", async () => {
    const owner = await createP3ProductionPlayer(app, prisma);
    const visitor = await createP3ProductionPlayer(app, prisma);
    const materials: CraftMaterial[] = [
      { item_id: "alch_moon_dew_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    await grantProductionMaterials(prisma, owner.playerId, {
      alch_moon_dew_herb: 2,
      alch_spirit_resin: 1,
    });
    await grantProductionMaterials(prisma, visitor.playerId, {
      alch_moon_dew_herb: 2,
      alch_spirit_resin: 1,
    });

    const crafted = await request(app.getHttpServer())
      .post("/api/production/alchemy/craft")
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Idempotency-Key", findCraftSuccessKey("p3_formula_owner", "alchemy", materials, 8800))
      .send({ materials })
      .expect(201);
    const saved = await request(app.getHttpServer())
      .post("/api/production/formulas")
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Idempotency-Key", `idem_p3_formula_save_${Date.now()}_${randomSuffix()}`)
      .send({ kind: "alchemy", source_record_id: crafted.body.data.record_id, name: "月露蕴灵方" })
      .expect(201);
    const formulaId = saved.body.data.formula.formula_id as string;
    expect(saved.body.data.formula.visibility).toBe("private");

    const privateCraft = await request(app.getHttpServer())
      .post(`/api/production/formulas/${formulaId}/craft`)
      .set("Authorization", `Bearer ${visitor.token}`)
      .set("Idempotency-Key", `idem_p3_private_craft_${Date.now()}_${randomSuffix()}`)
      .expect(400);
    expect(privateCraft.body.message).toContain("尚未公开");

    const unauthorizedPublish = await request(app.getHttpServer())
      .post(`/api/production/formulas/${formulaId}/publish`)
      .set("Authorization", `Bearer ${visitor.token}`)
      .set("Idempotency-Key", `idem_p3_unauthorized_publish_${Date.now()}_${randomSuffix()}`)
      .expect(400);
    expect(unauthorizedPublish.body.message).toContain("无权修改");

    const beforePublish = await request(app.getHttpServer())
      .get("/api/production/formulas?scope=public&kind=alchemy")
      .set("Authorization", `Bearer ${visitor.token}`)
      .expect(200);
    expect(
      beforePublish.body.data.formulas.some(
        (formula: { formula_id: string }) => formula.formula_id === formulaId,
      ),
    ).toBe(false);

    const published = await request(app.getHttpServer())
      .post(`/api/production/formulas/${formulaId}/publish`)
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Idempotency-Key", `idem_p3_publish_${Date.now()}_${randomSuffix()}`)
      .expect(201);
    expect(published.body.data.formula.visibility).toBe("public");
    expect(published.body.data.formula.published_at).toBeTruthy();

    const publicList = await request(app.getHttpServer())
      .get("/api/production/formulas?scope=public&kind=alchemy&keyword=月露")
      .set("Authorization", `Bearer ${visitor.token}`)
      .expect(200);
    const publicFormula = publicList.body.data.formulas.find(
      (formula: { formula_id: string }) => formula.formula_id === formulaId,
    );
    expect(publicFormula).toMatchObject({ reusable: true, visibility: "public" });

    const reused = await request(app.getHttpServer())
      .post(`/api/production/formulas/${formulaId}/craft`)
      .set("Authorization", `Bearer ${visitor.token}`)
      .set("Idempotency-Key", findCraftSuccessKey("p3_formula_reuse", "alchemy", materials, 8800))
      .expect(201);
    expect(reused.body.data.kind).toBe("alchemy");
    expect(reused.body.data.result.discovery.formula_id).toBe(formulaId);
    expect(reused.body.data.result.record.success).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/production/formulas/${formulaId}/unpublish`)
      .set("Authorization", `Bearer ${owner.token}`)
      .set("Idempotency-Key", `idem_p3_unpublish_${Date.now()}_${randomSuffix()}`)
      .expect(201);
    const afterUnpublish = await request(app.getHttpServer())
      .get("/api/production/formulas?scope=public&kind=alchemy")
      .set("Authorization", `Bearer ${visitor.token}`)
      .expect(200);
    expect(
      afterUnpublish.body.data.formulas.some(
        (formula: { formula_id: string }) => formula.formula_id === formulaId,
      ),
    ).toBe(false);
  });

  it("三类自研丹药分别作用于修为、下一次突破和下一次探索，并在使用后消费效果", async () => {
    const { token, playerId } = await createP3ProductionPlayer(app, prisma);
    const cultivationMaterials: CraftMaterial[] = [
      { item_id: "alch_moon_dew_herb", count: 2 },
      { item_id: "alch_spirit_resin", count: 1 },
    ];
    const breakthroughMaterials: CraftMaterial[] = [
      { item_id: "alch_break_marrow_root", count: 1 },
      { item_id: "alch_spirit_resin", count: 1 },
      { item_id: "alch_sunfire_petal", count: 1 },
    ];
    const exploreMaterials: CraftMaterial[] = [
      { item_id: "alch_moon_dew_herb", count: 1 },
      { item_id: "alch_spirit_resin", count: 1 },
      { item_id: "alch_void_moss", count: 1 },
    ];
    await grantProductionMaterials(prisma, playerId, {
      alch_moon_dew_herb: 3,
      alch_spirit_resin: 3,
      alch_break_marrow_root: 1,
      alch_sunfire_petal: 1,
      alch_void_moss: 1,
    });

    const cultivationCraft = await craftAlchemy(
      app,
      token,
      "p3_effect_cultivation",
      cultivationMaterials,
      8800,
    );
    const breakthroughCraft = await craftAlchemy(
      app,
      token,
      "p3_effect_breakthrough",
      breakthroughMaterials,
      7600,
    );
    const exploreCraft = await craftAlchemy(
      app,
      token,
      "p3_effect_explore",
      exploreMaterials,
      8200,
    );

    const cultivationUse = await useCraftedPill(
      app,
      token,
      cultivationCraft,
      "pill_nourishing_essence",
      "p3_use_cultivation",
    );
    expect(cultivationUse.body.data.pill_effect).toBe("cultivation");
    expect(BigInt(cultivationUse.body.data.after_cultivation)).toBeGreaterThan(
      BigInt(cultivationUse.body.data.before_cultivation),
    );

    const breakthroughUse = await useCraftedPill(
      app,
      token,
      breakthroughCraft,
      "pill_barrier_breaking",
      "p3_use_breakthrough",
    );
    expect(breakthroughUse.body.data.pill_effect).toBe("breakthrough_support");
    const breakthroughEffect = (await getProductionEffects(prisma, playerId)).find(
      (effect) => effect.effectType === "breakthrough_support",
    );
    expect(breakthroughEffect).toMatchObject({ remainingUses: 1, consumedAt: null });

    const supportValue = Number(breakthroughUse.body.data.effect_value);
    await prisma.player.update({
      where: { playerId },
      data: { currentRealm: 1, currentStage: 3, currentLevel: 3 },
    });
    await prisma.playerProgress.update({
      where: { playerId },
      data: { cultivationValue: BigInt(600 - supportValue) },
    });
    const breakthrough = await request(app.getHttpServer())
      .post("/api/game/cultivation/breakthrough")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_breakthrough_${Date.now()}_${randomSuffix()}`)
      .expect(201);
    expect(breakthrough.body.data.success).toBe(true);
    expect(breakthrough.body.data.message).toContain("破障丹助你抵消");
    const consumedBreakthroughEffect = (await getProductionEffects(prisma, playerId)).find(
      (effect) => effect.effectId === breakthroughEffect?.effectId,
    );
    expect(consumedBreakthroughEffect).toMatchObject({ remainingUses: 0 });
    expect(consumedBreakthroughEffect?.consumedAt).toBeTruthy();

    const exploreUse = await useCraftedPill(
      app,
      token,
      exploreCraft,
      "pill_cloud_walking",
      "p3_use_explore",
    );
    expect(exploreUse.body.data.pill_effect).toBe("explore_boost");
    const exploreBonus = Number(exploreUse.body.data.effect_value);
    expect(exploreBonus).toBeGreaterThan(0);
    const exploreEffect = (await getProductionEffects(prisma, playerId)).find(
      (effect) => effect.effectType === "explore_boost",
    );
    expect(exploreEffect).toMatchObject({
      effectValue: exploreBonus,
      remainingUses: 1,
      consumedAt: null,
    });

    await prisma.playerActionState.update({
      where: { playerId },
      data: { actionPoints: 10 },
    });
    const started = await request(app.getHttpServer())
      .post("/api/game/explore")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p3_explore_boost_${Date.now()}_${randomSuffix()}`)
      .send({ province_id: "ji" })
      .expect(201);
    expect(started.body.data.action.action_type).toBe("explore");
    const startedRecord = await prisma.exploreActionRecord.findUniqueOrThrow({
      where: { recordId: started.body.data.action.action_id },
    });
    expect(startedRecord.exploreBoostPercent).toBe(exploreBonus);
    const consumedExploreEffect = (await getProductionEffects(prisma, playerId)).find(
      (effect) => effect.effectId === exploreEffect?.effectId,
    );
    expect(consumedExploreEffect).toMatchObject({ remainingUses: 0 });
    expect(consumedExploreEffect?.consumedAt).toBeTruthy();

    await prisma.exploreActionRecord.update({
      where: { recordId: started.body.data.action.action_id },
      data: {
        lastSettledAt: new Date(Date.now() - 24 * 60 * 60_000),
        lastActiveAt: new Date(),
      },
    });
    const settled = await request(app.getHttpServer())
      .get("/api/game/actions/current")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const expectedCultivation = Math.floor(
      getExploreCultivationReward(2, "win") * (1 + exploreBonus / 100),
    );
    const battle = await prisma.battleLog.findFirstOrThrow({
      where: { playerId, battleType: "explore" },
      orderBy: { createdAt: "desc" },
    });
    const reward = battle.rewardSnapshot as { cultivation?: string; spirit_stone?: string };
    expect(reward.cultivation).toBe(String(expectedCultivation));
    expect(reward.spirit_stone).toBe(String(Math.floor(35 * (1 + exploreBonus / 100))));
    expect(settled.body.data.action.settled_battle_count).toBeGreaterThan(0);
  });

  it("材料链配置与断供预警不包含付费或唯一战力产物", async () => {
    expect(materialSourceConfigs.length).toBeGreaterThanOrEqual(8);
    const warnings = buildProductionBalanceWarnings();
    expect(warnings.some((warning) => warning.item_id === "raw_iron")).toBe(true);

    const config = await request(app.getHttpServer()).get("/api/config/material_chain").expect(200);
    expect(config.body.data.config_version).toMatch(/^material_chain_/);
    expect(config.body.data.payload.warnings.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(config.body.data.payload);
    expect(serialized).not.toContain("paid_jade_reward");
    expect(serialized).not.toContain("ancient_treasure_body");
    expect(config.body.data.payload.forbidden_outputs).toContain("paid_jade");
  });
});

async function createP3ProductionPlayer(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p3_production_${nonce}`, nickname: "P3丹器客" })
    .expect(201);
  const token = loginResponse.body.data.token as string;

  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p3_production_create_${nonce}`)
    .send({ name: `丹器${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: 0n },
  });

  return { token, playerId };
}

async function grantProductionMaterials(
  prisma: PrismaClient,
  playerId: string,
  items: Record<string, number>,
) {
  await prisma.playerWallet.update({
    where: { playerId },
    data: { spiritStone: 5000n },
  });
  await prisma.playerItem.createMany({
    data: Object.entries(items)
      .filter(([, count]) => count > 0)
      .map(([itemId, count]) => ({
        itemInstanceId: `item_p3_${itemId}_${Date.now()}_${randomSuffix()}`,
        playerId,
        itemId,
        count: BigInt(count),
        bindType: "bound",
        sourceType: "p3_production_test",
      })),
  });
}

async function getItemCount(
  prisma: PrismaClient,
  playerId: string,
  itemId: string,
): Promise<number> {
  const items = await prisma.playerItem.findMany({ where: { playerId, itemId } });
  return items.reduce((total, item) => total + Number(item.count), 0);
}

async function craftAlchemy(
  app: INestApplication,
  token: string,
  prefix: string,
  materials: CraftMaterial[],
  successRate: number,
) {
  return request(app.getHttpServer())
    .post("/api/production/alchemy/craft")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", findCraftSuccessKey(prefix, "alchemy", materials, successRate))
    .send({ materials })
    .expect(201);
}

async function useCraftedPill(
  app: INestApplication,
  token: string,
  crafted: {
    body: { data: { bag: { items: Array<{ item_id: string; item_instance_id: string }> } } };
  },
  itemId: string,
  prefix: string,
) {
  const pill = crafted.body.data.bag.items.find((item) => item.item_id === itemId);
  expect(pill).toBeTruthy();
  return request(app.getHttpServer())
    .post("/api/production/pills/use")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_${prefix}_${Date.now()}_${randomSuffix()}`)
    .send({ item_instance_id: pill?.item_instance_id })
    .expect(201);
}

async function getProductionEffects(
  prisma: PrismaClient,
  playerId: string,
): Promise<ProductionEffectRow[]> {
  const delegate = prisma as unknown as {
    playerProductionEffect: {
      findMany(input: { where: { playerId: string }; orderBy: { createdAt: "asc" } }): Promise<
        ProductionEffectRow[]
      >;
    };
  };
  return delegate.playerProductionEffect.findMany({
    where: { playerId },
    orderBy: { createdAt: "asc" },
  });
}

function findCraftSuccessKey(
  prefix: string,
  kind: CraftKind,
  materials: CraftMaterial[],
  successRate: number,
): string {
  const compositionHash = getMaterialCompositionHash(kind, materials);
  for (let index = 0; index < 1000; index += 1) {
    const key = `idem_${prefix}_${Date.now()}_${randomSuffix()}_${index}`;
    if (roll10000(`${key}:${compositionHash}:success`) < successRate) {
      return key;
    }
  }
  throw new Error("未找到可成功结算的幂等键");
}

function findForgeSuccessKeyWithDifferentMainValue(
  prefix: string,
  materials: CraftMaterial[],
  previousKey: string,
): string {
  const compositionHash = getMaterialCompositionHash("forge", materials);
  const previousMainValue = roll10000(`${previousKey}:${compositionHash}:main:value`) % 13;
  for (let index = 0; index < 1000; index += 1) {
    const key = `idem_${prefix}_${Date.now()}_${randomSuffix()}_${index}`;
    const success = roll10000(`${key}:${compositionHash}:success`) < 9000;
    const mainValue = roll10000(`${key}:${compositionHash}:main:value`) % 13;
    if (success && mainValue !== previousMainValue) {
      return key;
    }
  }
  throw new Error("未找到词条数值不同的成功幂等键");
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
