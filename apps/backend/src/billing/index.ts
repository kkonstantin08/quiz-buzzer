import { Router } from 'express';
import { config } from '../config';
import { prisma } from '../prisma';

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

billingRouter.post('/activate-free', requireAuth, async (req: AuthRequest, res: any) => {
  const currentPeriodStart = new Date();
  const currentPeriodEnd = new Date(currentPeriodStart);
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);

  try {
    await prisma.$transaction(async (tx) => {
      const activation = await tx.hostUser.updateMany({
        where: { id: req.userId, freeTrialUsed: false },
        data: { freeTrialUsed: true },
      });

      if (!activation.count) {
        throw new Error('FREE_ACTIVATION_ALREADY_USED');
      }

      await tx.subscription.upsert({
        where: { hostUserId: req.userId },
        create: {
          hostUserId: req.userId!,
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd,
          autoRenew: false,
        },
        update: {
          status: 'active',
          currentPeriodStart,
          currentPeriodEnd,
          autoRenew: false,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      });
    });

    return res.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'FREE_ACTIVATION_ALREADY_USED') {
      return res.status(403).json({ error: 'Бесплатная активация уже использована' });
    }

    console.error('Failed to activate free access:', error);
    return res.status(500).json({ error: 'Failed to activate' });
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
