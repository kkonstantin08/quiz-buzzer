import type { PrismaClient } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
let lastCleanupAt = 0;

export function gameHistoryCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 3);
  return cutoff;
}

export async function cleanupGameHistory(prisma: Pick<PrismaClient, 'gameHistory'>, now = new Date()) {
  return prisma.gameHistory.deleteMany({ where: { createdAt: { lt: gameHistoryCutoff(now) } } });
}

export async function runGameHistoryCleanup(prisma: Pick<PrismaClient, 'gameHistory'>, now = new Date()) {
  if (now.getTime() - lastCleanupAt < DAY_MS) return false;
  lastCleanupAt = now.getTime();
  try {
    await cleanupGameHistory(prisma, now);
  } catch (error) {
    console.error('Failed to clean expired game history:', error);
  }
  return true;
}
