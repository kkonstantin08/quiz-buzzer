import { Router } from 'express';
import { prisma } from '../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const historyRouter = Router();

// Middleware to authenticate host
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

historyRouter.get('/', authenticate, async (req: any, res: any) => {
  try {
    const history = await prisma.gameHistory.findMany({
      where: { hostUserId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10, // last 10 games
    });
    
    const count = await prisma.gameHistory.count({
      where: { hostUserId: req.userId }
    });

    res.json({ history, count });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export { historyRouter };
