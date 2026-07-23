import { prisma } from '../../prisma';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { billingRouter } from '../index';
import { requireAuth } from '../../auth/middleware';

let mockUserId = 'test-id';
jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.userId = mockUserId;
    next();
  }
}));

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/billing', requireAuth, billingRouter);

describe('Billing free activation API', () => {
  let testUserId: string;

  beforeEach(async () => {
    const user = await prisma.hostUser.create({
      data: {
        email: `trial_${Date.now()}_${Math.random()}@example.com`,
        passwordHash: 'dummy',
        freeTrialUsed: false,
      },
    });
    testUserId = user.id;
    mockUserId = user.id;
  });

  afterEach(async () => {
    await prisma.subscription.deleteMany({ where: { hostUserId: testUserId } });
    await prisma.hostUser.delete({ where: { id: testUserId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('activates exactly one 30-day period when concurrent requests are made', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const [res1, res2] = await Promise.all([
      request(app).post('/billing/activate-free').send(),
      request(app).post('/billing/activate-free').send(),
    ]);
    process.env.NODE_ENV = previousNodeEnv;

    expect([res1.status, res2.status].sort()).toEqual([200, 403]);

    const user = await prisma.hostUser.findUnique({ where: { id: testUserId } });
    expect(user?.freeTrialUsed).toBe(true);

    const subscriptions = await prisma.subscription.findMany({ where: { hostUserId: testUserId } });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].status).toBe('active');
    expect(subscriptions[0].currentPeriodEnd.getTime() - subscriptions[0].currentPeriodStart.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('rolls back the activation marker if subscription creation fails', async () => {
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any, options: any) => {
      return originalTransaction(async (tx: any) => {
        tx.subscription.upsert = jest.fn().mockRejectedValueOnce(new Error('Simulated DB Error'));
        return callback(tx);
      }, options);
    });
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const res = await request(app).post('/billing/activate-free').send();

    expect(res.status).toBe(500);

    const user = await prisma.hostUser.findUnique({ where: { id: testUserId } });
    expect(user?.freeTrialUsed).toBe(false);
    expect(await prisma.subscription.findMany({ where: { hostUserId: testUserId } })).toHaveLength(0);

    spy.mockRestore();
    consoleError.mockRestore();
  });
});
