import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export const billingRouter = Router();

import { requireAuth, AuthRequest } from '../auth/middleware';

billingRouter.post('/checkout', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    // Stub for YooKassa or other payment gateway
    // In the future, this will call YooKassa API to get a payment URL
    return res.json({ paymentUrl: 'https://yookassa.ru/stub' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

billingRouter.post('/activate-free', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const userId = req.userId!;

    // Check if user already used their free trial
    const user = await prisma.hostUser.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.freeTrialUsed) {
      return res.status(403).json({ error: 'Бесплатный пробный период уже был использован' });
    }
    
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
    
    // Atomically mark trial as used AND activate subscription
    await prisma.$transaction([
      prisma.hostUser.update({
        where: { id: userId },
        data: { freeTrialUsed: true },
      }),
      prisma.subscription.upsert({
        where: { hostUserId: userId },
        update: {
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd,
        },
        create: {
          hostUserId: userId,
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd,
        },
      }),
    ]);

    return res.json({ success: true, message: 'Free activation successful' });
  } catch (error) {
    console.error('Activate free error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
