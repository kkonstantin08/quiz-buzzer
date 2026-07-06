import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export const billingRouter = Router();

// Middleware to authenticate user
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

billingRouter.post('/checkout', requireAuth, async (req: any, res: any) => {
  try {
    // Stub for YooKassa or other payment gateway
    // In the future, this will call YooKassa API to get a payment URL
    return res.json({ paymentUrl: 'https://yookassa.ru/stub' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

billingRouter.post('/activate-free', requireAuth, async (req: any, res: any) => {
  try {
    const userId = req.userId;
    
    const currentPeriodStart = new Date();
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setDate(currentPeriodEnd.getDate() + 30);
    
    // Upsert subscription
    await prisma.subscription.upsert({
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

    return res.json({ success: true, message: 'Free activation successful' });
  } catch (error) {
    console.error('Activate free error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
