import request from 'supertest';
import { app } from '../../server';
import { prisma } from '../../prisma';
import { config } from '../../config';
import { checkBillingReadiness } from '../readiness';

// Mock authentication to test billing endpoints easily
jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: any, res: any, next: any) => {
    req.userId = 'test-user-id';
    next();
  }
}));

describe('Billing API', () => {
  let originalPaymentsEnabled: boolean;

  beforeAll(() => {
    originalPaymentsEnabled = config.paymentsEnabled;
  });

  afterAll(() => {
    // @ts-ignore - overriding readonly for testing
    config.paymentsEnabled = originalPaymentsEnabled;
  });

  it('GET /api/billing/status should return safe status', async () => {
    const res = await request(app).get('/api/billing/status');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('paymentsEnabled');
    expect(res.body).toHaveProperty('providerConfigured');
    expect(res.body).toHaveProperty('checkoutAvailable');
    
    // Ensure no secret values leak here
    expect(JSON.stringify(res.body)).not.toMatch(/secret|key|token/i);
  });

  it('POST /api/billing/checkout should return 503 PAYMENTS_DISABLED', async () => {
    const res = await request(app).post('/api/billing/checkout');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: 'PAYMENTS_DISABLED',
      message: 'Оплата временно недоступна'
    });
    
    // Check that stub URL is absent
    expect(res.body).not.toHaveProperty('paymentUrl');
    expect(JSON.stringify(res.body)).not.toContain('yookassa.ru');
  });

  it('readiness should not be true even if PAYMENTS_ENABLED=true', () => {
    // @ts-ignore
    config.paymentsEnabled = true;
    const readiness = checkBillingReadiness();
    expect(readiness.ready).toBe(false);
    expect(readiness.reasons.length).toBeGreaterThan(0);
    expect(JSON.stringify(readiness)).not.toMatch(/secret|key|token/i);
  });
});
