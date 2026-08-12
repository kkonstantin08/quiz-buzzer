import { Router } from 'express';
import { prisma } from '../prisma';

const historyRouter = Router();

import { requireAuth, AuthRequest } from '../auth/middleware';

function parsePositiveInteger(value: unknown, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

historyRouter.get('/', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const requestedLimit = parsePositiveInteger(req.query.limit, 10);
    if (page === null || requestedLimit === null) {
      return res.status(400).json({ error: 'Invalid pagination' });
    }

    const pageSize = Math.min(requestedLimit, 50);
    const skip = (page - 1) * pageSize;
    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({ error: 'Invalid pagination' });
    }

    const where = { hostUserId: req.userId! };
    const [history, count] = await Promise.all([
      prisma.gameHistory.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.gameHistory.count({ where }),
    ]);

    return res.json({ history, count, page, pageSize, totalPages: Math.ceil(count / pageSize) });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

historyRouter.delete('/', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    await prisma.gameHistory.deleteMany({
      where: { hostUserId: req.userId! }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { historyRouter };
