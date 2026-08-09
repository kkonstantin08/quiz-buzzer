import type { PrismaClient } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

export function sessionRetentionCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() - 3);
  const lastDay = new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate();
  cutoff.setDate(Math.min(now.getDate(), lastDay));
  return cutoff;
}

export function cleanupInactiveSessions(db: Pick<PrismaClient, 'session'>, now = new Date()) {
  const cutoff = sessionRetentionCutoff(now);
  return db.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: cutoff } },
        { revokedAt: { lte: cutoff } },
      ],
    },
  });
}

export async function runSessionCleanup(db: Pick<PrismaClient, 'session'>, now = new Date()) {
  try {
    await cleanupInactiveSessions(db, now);
  } catch {
    console.error('Failed to clean inactive sessions');
  }
}

export function startSessionCleanup(db: Pick<PrismaClient, 'session'>) {
  void runSessionCleanup(db);
  return setInterval(() => void runSessionCleanup(db), DAY_MS);
}
