import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("缺少 DATABASE_URL，拒绝重建世界数据。");
}

const database = new URL(databaseUrl);
const databaseName = database.pathname.replace(/^\//, "");
const localHosts = new Set(["127.0.0.1", "localhost"]);

if (!localHosts.has(database.hostname) || databaseName !== "nextday_game") {
  throw new Error("仅允许重建本机 nextday_game 开发数据库。");
}

if (process.env.NODE_ENV !== "development") {
  throw new Error("仅允许在 NODE_ENV=development 下重建开发世界。");
}

const prisma = new PrismaClient();

async function resetWorldDevelopmentData() {
  const result = await prisma.$transaction(async (tx) => {
    const garrisons = await tx.territoryGarrison.deleteMany();
    const occupations = await tx.territoryOccupation.deleteMany();
    const marches = await tx.marchQueue.deleteMany();
    const gardenPlots = await tx.cityHerbGardenPlot.deleteMany();
    const buildings = await tx.cityBuilding.deleteMany();
    const ownerships = await tx.worldBlockOwnership.deleteMany();
    const cities = await tx.playerCity.deleteMany();

    return {
      buildings: buildings.count,
      cities: cities.count,
      gardenPlots: gardenPlots.count,
      garrisons: garrisons.count,
      marches: marches.count,
      occupations: occupations.count,
      ownerships: ownerships.count,
    };
  });

  console.log("开发世界已重建：", result);
}

resetWorldDevelopmentData()
  .catch((error: unknown) => {
    console.error("重建开发世界失败：", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
