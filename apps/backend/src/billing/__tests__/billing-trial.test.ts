import { prisma } from '../../prisma';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { billingRouter } from '../index';
import { requireAuth } from '../../auth/middleware';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

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

describe('Billing Free Trial API', () => {
  let testUserId: string;
  let authToken: string;

  beforeEach(async () => {
    const user = await prisma.hostUser.create({
      data: {
        email: `trial_${Date.now()}@example.com`,
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

  it('activates trial exactly once when concurrent requests are made', async () => {
    // Make two concurrent requests
    const req1 = request(app).post('/billing/activate-free').send();
    const req2 = request(app).post('/billing/activate-free').send();

    const [res1, res2] = await Promise.all([req1, req2]);

    // One should succeed, one should fail with 403 ALREADY_USED
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 403]);

    const user = await prisma.hostUser.findUnique({ where: { id: testUserId } });
    expect(user?.freeTrialUsed).toBe(true);

    const subscriptions = await prisma.subscription.findMany({ where: { hostUserId: testUserId } });
    expect(subscriptions.length).toBe(1);
    expect(subscriptions[0].status).toBe('active');
  });

  it('rolls back freeTrialUsed if subscription creation fails', async () => {
    // Spy on $transaction to mock the inner tx object
    const originalTransaction = prisma.$transaction.bind(prisma);
    const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(async (callback: any, options: any) => {
      return originalTransaction(async (tx: any) => {
        // mock the upsert on the tx object
        tx.subscription.upsert = jest.fn().mockRejectedValueOnce(new Error('Simulated DB Error'));
        return callback(tx);
      }, options);
    });

    const res = await request(app).post('/billing/activate-free').send();
    
    expect(res.status).toBe(500);

    const user = await prisma.hostUser.findUnique({ where: { id: testUserId } });
    // Should be rolled back to false
    expect(user?.freeTrialUsed).toBe(false);

    const subscriptions = await prisma.subscription.findMany({ where: { hostUserId: testUserId } });
    expect(subscriptions.length).toBe(0);

    spy.mockRestore();
  });
});
