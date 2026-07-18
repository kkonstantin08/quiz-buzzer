import express from 'express';
import request from 'supertest';
import { createLoginLimiter, createRegisterLimiter } from '../auth';
import { loadConfig } from '../config';

function createRateLimitedApp(
  trustProxy: string | undefined,
  limiter: ReturnType<typeof createLoginLimiter>,
) {
  const app = express();
  app.set('trust proxy', loadConfig({ TRUST_PROXY: trustProxy }).trustProxy);
  app.get('/ip', (req, res) => res.json({ ip: req.ip }));
  app.post('/auth', limiter, (_req, res) => res.status(400).json({ error: 'invalid' }));
  return app;
}

async function exhaust(app: express.Express, forwardedFor: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await request(app).post('/auth').set('X-Forwarded-For', forwardedFor).expect(400);
  }
}

describe('reverse-proxy IP handling', () => {
  it('ignores spoofed X-Forwarded-For without TRUST_PROXY', async () => {
    const app = createRateLimitedApp(undefined, createLoginLimiter());

    await exhaust(app, '198.51.100.10');
    await request(app).post('/auth').set('X-Forwarded-For', '198.51.100.11').expect(429);

    const ipResponse = await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.10').expect(200);
    expect(ipResponse.body.ip).not.toBe('198.51.100.10');
  });

  it('uses the forwarded IP when the connected proxy is explicitly trusted', async () => {
    const app = createRateLimitedApp('loopback', createLoginLimiter());

    await exhaust(app, '198.51.100.10');
    await request(app).post('/auth').set('X-Forwarded-For', '198.51.100.11').expect(400);

    const ipResponse = await request(app).get('/ip').set('X-Forwarded-For', '198.51.100.10').expect(200);
    expect(ipResponse.body.ip).toBe('198.51.100.10');
  });

  it('fails closed for an invalid TRUST_PROXY value', async () => {
    const app = createRateLimitedApp('true', createLoginLimiter());

    await exhaust(app, '198.51.100.10');
    await request(app).post('/auth').set('X-Forwarded-For', '198.51.100.11').expect(429);
  });

  it('fails closed for a TRUST_PROXY CIDR that would trust every proxy', async () => {
    const app = createRateLimitedApp('0.0.0.0/0', createLoginLimiter());

    await exhaust(app, '198.51.100.10');
    await request(app).post('/auth').set('X-Forwarded-For', '198.51.100.11').expect(429);
  });

  it('keeps registration limits independent for trusted client IPs', async () => {
    const app = createRateLimitedApp('loopback', createRegisterLimiter());

    await exhaust(app, '203.0.113.10');
    await request(app).post('/auth').set('X-Forwarded-For', '203.0.113.11').expect(400);
  });
});
