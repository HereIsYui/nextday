import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/platform/configure-app";

describe("P2-3 深度外观与宗门驻地装饰", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "p2-appearance-secret";
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

  it("appearance_plus 配置可读取，且不包含战力、贡献或掉落倍率字段", async () => {
    const { token } = await createP2AppearancePlayer(app, prisma);

    const response = await request(app.getHttpServer())
      .get("/api/config/appearance_plus")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(response.body.data.config_type).toBe("appearance_plus");
    expect(response.body.data.payload.boundary.stat_bonus_allowed).toBe(false);
    expect(response.body.data.payload.boundary.reward_mutation_allowed).toBe(false);
    expect(response.body.data.payload.boundary.contribution_multiplier_allowed).toBe(false);
    expect(response.body.data.payload.boundary.drop_rate_allowed).toBe(false);
    expect(JSON.stringify(response.body.data.payload.appearances)).not.toMatch(
      /attack|damage|drop_rate|contribution_multiplier/i,
    );
    expect(
      response.body.data.payload.appearances.every(
        (appearance: { stat_bonus: null }) => appearance.stat_bonus === null,
      ),
    ).toBe(true);
  });

  it("默认深度外观可进入编辑，装备使用幂等键且 stat_bonus 为空", async () => {
    const { token, playerId } = await createP2AppearancePlayer(app, prisma);

    const catalog = await request(app.getHttpServer())
      .get("/api/appearance-plus/catalog")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const defaultAppearance = catalog.body.data.appearances.find(
      (appearance: { appearance_id: string }) =>
        appearance.appearance_id === "name_card_layout_shanmen",
    );
    expect(defaultAppearance.owned).toBe(true);
    expect(defaultAppearance.permission.can_equip).toBe(true);
    expect(defaultAppearance.stat_bonus).toBeNull();

    const idempotencyKey = `idem_p2_appearance_equip_${Date.now()}_${randomSuffix()}`;
    const body = {
      appearance_id: "name_card_layout_shanmen",
      display_slot: "name_card",
    };
    const equipped = await request(app.getHttpServer())
      .post("/api/appearance-plus/equip")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);
    const repeated = await request(app.getHttpServer())
      .post("/api/appearance-plus/equip")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(body)
      .expect(201);

    expect(repeated.body.data.record_id).toBe(equipped.body.data.record_id);
    expect(equipped.body.data.appearance.equipped).toBe(true);
    expect(equipped.body.data.appearance.stat_bonus).toBeNull();

    const equippedCount = await prisma.appearanceOwnershipRecord.count({
      where: { playerId, displaySlot: "name_card", equipped: true },
    });
    expect(equippedCount).toBe(1);
  });

  it("未拥有外观不能装备，旧展示外观归档后才能进入深度编辑", async () => {
    const { token } = await createP2AppearancePlayer(app, prisma);

    await request(app.getHttpServer())
      .post("/api/appearance-plus/equip")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p2_appearance_locked_${Date.now()}_${randomSuffix()}`)
      .send({ appearance_id: "battle_report_yunlu", display_slot: "battle_report" })
      .expect(400);

    await request(app.getHttpServer())
      .post("/api/commerce/appearances/claim")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p2_appearance_claim_${Date.now()}_${randomSuffix()}`)
      .send({ appearance_id: "battle_report_yunlu" })
      .expect(201);

    const catalog = await request(app.getHttpServer())
      .get("/api/appearance-plus/catalog")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const battleFrame = catalog.body.data.appearances.find(
      (appearance: { appearance_id: string }) => appearance.appearance_id === "battle_report_yunlu",
    );
    expect(battleFrame.owned).toBe(true);
    expect(battleFrame.permission.can_equip).toBe(true);
  });

  it("宗门驻地装饰需要宗门身份，装备后不改变宗门产出字段", async () => {
    const { token, playerId } = await createP2AppearancePlayer(app, prisma);
    const beforeSect = await request(app.getHttpServer())
      .get("/api/appearance-plus/catalog")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const lockedSectDecoration = beforeSect.body.data.appearances.find(
      (appearance: { appearance_id: string }) =>
        appearance.appearance_id === "sect_hall_memorial_jiuta",
    );
    expect(lockedSectDecoration.permission.reason).toBe("未加入宗门");

    await grantSpiritStone(prisma, playerId, 1000);
    await request(app.getHttpServer())
      .post("/api/multiplayer/sects/create")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p2_appearance_sect_${Date.now()}_${randomSuffix()}`)
      .send({ name: `外观宗${randomSuffix()}`, alignment: "neutral" })
      .expect(201);

    const equipped = await request(app.getHttpServer())
      .post("/api/appearance-plus/equip")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", `idem_p2_appearance_sect_equip_${Date.now()}_${randomSuffix()}`)
      .send({ appearance_id: "sect_hall_memorial_jiuta", display_slot: "sect_hall" })
      .expect(201);

    expect(equipped.body.data.appearance.owner_type).toBe("sect");
    expect(equipped.body.data.appearance.stat_bonus).toBeNull();
    expect(JSON.stringify(equipped.body.data)).not.toMatch(
      /attack|damage|drop_rate|contribution_multiplier/i,
    );
  });
});

async function createP2AppearancePlayer(
  app: INestApplication,
  prisma: PrismaClient,
): Promise<{ token: string; playerId: string }> {
  const nonce = `${Date.now()}_${randomSuffix()}`;
  const loginResponse = await request(app.getHttpServer())
    .post("/api/auth/guest-login")
    .send({ device_id: `p2_appearance_${nonce}`, nickname: "外观道友" })
    .expect(201);
  const token = loginResponse.body.data.token as string;
  const createResponse = await request(app.getHttpServer())
    .post("/api/player/create")
    .set("Authorization", `Bearer ${token}`)
    .set("Idempotency-Key", `idem_p2_appearance_create_${nonce}`)
    .send({ name: `外观${nonce}`.slice(0, 16), route: "qi" })
    .expect(201);
  const playerId = createResponse.body.data.profile.player.player_id as string;
  await prisma.playerProgress.update({
    where: { playerId },
    data: { chapterId: 2, lastCultivationAt: new Date() },
  });

  return { token, playerId };
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
