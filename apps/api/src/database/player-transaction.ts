import { Prisma } from "@prisma/client";

/** 在事务内按玩家串行化资源写操作，避免不同幂等键并发读到同一份旧状态。 */
export async function lockPlayerForTransaction(
  tx: Prisma.TransactionClient,
  playerId: string,
): Promise<void> {
  if (typeof tx.$executeRaw !== "function") {
    return;
  }

  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${playerId}, 0))`,
  );
}

/** 在事务内串行化全局或跨玩家共享资源，例如活动实例、九塔和世界 Boss。 */
export async function lockResourceForTransaction(
  tx: Prisma.TransactionClient,
  resourceKey: string,
): Promise<void> {
  if (typeof tx.$executeRaw !== "function") {
    return;
  }

  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${resourceKey}, 0))`,
  );
}

/** 由账号查找玩家并获取同一把事务锁，供统一幂等包装器使用。 */
export async function lockAccountForTransaction(
  tx: Prisma.TransactionClient,
  accountId: string,
): Promise<string | null> {
  const player = await tx.player.findUnique({ where: { accountId }, select: { playerId: true } });
  if (!player) {
    return null;
  }
  await lockPlayerForTransaction(tx, player.playerId);
  return player.playerId;
}
