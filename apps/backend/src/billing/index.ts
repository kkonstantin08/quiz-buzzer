import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export const billingRouter = Router();

import { requireAuth, AuthRequest } from '../auth/middleware';

import { checkBillingReadiness } from './readiness';

billingRouter.post('/checkout', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    return res.status(503).json({
      code: 'PAYMENTS_DISABLED',
      message: 'Оплата временно недоступна'
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

billingRouter.get('/status', async (req: any, res: any) => {
  try {
    const readiness = checkBillingReadiness();
    return res.json({
      paymentsEnabled: config.paymentsEnabled,
      providerConfigured: readiness.ready,
      checkoutAvailable: config.paymentsEnabled && readiness.ready
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

billingRouter.post('/activate-free', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const userId = req.userId!;

    // Check if user already used their free trial (fast fail)
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
    
    // Atomically mark trial as used AND activate subscription in an interactive transaction
    await prisma.$transaction(async (tx) => {
      // updateMany is atomic and will return count: 0 if freeTrialUsed is already true
      const updateResult = await tx.hostUser.updateMany({
        where: { id: userId, freeTrialUsed: false },
        data: { freeTrialUsed: true }
      });

      if (updateResult.count === 0) {
        throw new Error('ALREADY_USED');
      }

      await tx.subscription.upsert({
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
      });
    });

    return res.json({ success: true, message: 'Free activation successful' });
  } catch (error: any) {
    if (error.message === 'ALREADY_USED') {
      return res.status(403).json({ error: 'Бесплатный пробный период уже был использован' });
    }
    console.error('Activate free error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
