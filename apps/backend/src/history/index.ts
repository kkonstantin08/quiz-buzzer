import { Router } from 'express';
import { prisma } from '../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const historyRouter = Router();

import { requireAuth, AuthRequest } from '../auth/middleware';

historyRouter.get('/', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const history = await prisma.gameHistory.findMany({
      where: { hostUserId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 10, // last 10 games
    });
    
    const count = await prisma.gameHistory.count({
      where: { hostUserId: req.userId! }
    });

    res.json({ history, count });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
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
