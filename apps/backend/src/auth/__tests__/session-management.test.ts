import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '../../config';
import { appEvents } from '../../events';
import { LegalDocumentType, legalBackendConfig } from '../../legal/config';
import { prisma } from '../../prisma';
import { authRouter } from '../index';
import { beginAccountDeletion, endAccountDeletion } from '../accountDeletionState';
import { validateHostSession } from '../session';

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

const untrustedProxyApp = express();
untrustedProxyApp.set('trust proxy', false);
untrustedProxyApp.use(express.json());
untrustedProxyApp.use(cookieParser());
untrustedProxyApp.use('/auth', authRouter);

const prefix = `session-management-${Date.now()}`;
const email = `${prefix}@example.com`;
const registeredEmail = `${prefix}-registered@example.com`;
const password = 'password123';
const originalRegistrationEnabled = process.env.REGISTRATION_ENABLED;

function sessionIdFrom(response: request.Response) {
  const setCookie = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const token = cookies.find((cookie) => cookie.startsWith('hostToken='))?.match(/hostToken=([^;]+)/)?.[1];
  const decoded = token ? jwt.decode(decodeURIComponent(token)) : null;
  if (!decoded || typeof decoded === 'string' || typeof decoded.sessionId !== 'string') {
    throw new Error('Expected session cookie');
  }
  return { cookie: cookies.join('; '), sessionId: decoded.sessionId };
}

function cookieFor(userId: string, sessionId: string) {
  return `hostToken=${jwt.sign({ userId, sessionId }, config.jwtSecret)}`;
}

async function createSessionUser(label: string) {
  return prisma.hostUser.create({
    data: { email: `${prefix}-${label}@example.com`, passwordHash: 'not-used-in-this-test' },
  });
}

beforeAll(async () => {
  process.env.REGISTRATION_ENABLED = 'true';
  await prisma.hostUser.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10) },
  });
});

afterAll(async () => {
  await prisma.hostUser.deleteMany({ where: { email: { startsWith: prefix } } });
  if (originalRegistrationEnabled === undefined) delete process.env.REGISTRATION_ENABLED;
  else process.env.REGISTRATION_ENABLED = originalRegistrationEnabled;
  await prisma.$disconnect();
});

describe('session management storage', () => {
  it('stores optional session metadata while keeping legacy sessions valid', async () => {
    const user = await prisma.hostUser.findUniqueOrThrow({ where: { email } });

    const legacy = await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    const lastSeenAt = new Date();
    const current = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        ipAddress: '198.51.100.10',
        userAgent: 'Mozilla/5.0 Test Browser',
        lastSeenAt,
      },
    });

    await expect(prisma.session.findUnique({ where: { id: legacy.id } })).resolves.toMatchObject({
      ipAddress: null,
      userAgent: null,
      lastSeenAt: null,
    });
    await expect(prisma.session.findUnique({ where: { id: current.id } })).resolves.toMatchObject({
      ipAddress: '198.51.100.10',
      userAgent: 'Mozilla/5.0 Test Browser',
      lastSeenAt,
    });
  });

  it('stores trusted IP and User-Agent metadata on login and registration', async () => {
    const login = await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '198.51.100.20')
      .set('User-Agent', 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1')
      .send({ email, password })
      .expect(200);
    const loginSession = sessionIdFrom(login);

    await expect(prisma.session.findUnique({ where: { id: loginSession.sessionId } })).resolves.toMatchObject({
      ipAddress: '198.51.100.20',
      userAgent: expect.stringContaining('iPhone'),
      lastSeenAt: expect.any(Date),
    });

    const registration = await request(app)
      .post('/auth/register')
      .set('X-Forwarded-For', '203.0.113.30')
      .set('User-Agent', 'Mozilla/5.0 Firefox/141.0')
      .send({
        email: registeredEmail,
        password,
        termsAccepted: true,
        displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
        personalDataConsentAccepted: true,
        displayedPersonalDataConsentVersion: legalBackendConfig.versions[LegalDocumentType.PERSONAL_DATA_CONSENT],
      })
      .expect(200);
    const registrationSession = sessionIdFrom(registration);

    await expect(prisma.session.findUnique({ where: { id: registrationSession.sessionId } })).resolves.toMatchObject({
      ipAddress: '203.0.113.30',
      userAgent: 'Mozilla/5.0 Firefox/141.0',
      lastSeenAt: expect.any(Date),
    });
  });

  it('ignores a spoofed forwarded IP when trust proxy is disabled', async () => {
    const login = await request(untrustedProxyApp)
      .post('/auth/login')
      .set('X-Forwarded-For', '198.51.100.99')
      .send({ email, password })
      .expect(200);
    const session = sessionIdFrom(login);

    const stored = await prisma.session.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(stored.ipAddress).not.toBe('198.51.100.99');
  });

  it('updates lastSeenAt after five minutes but throttles recent activity', async () => {
    const login = await request(app).post('/auth/login').send({ email, password }).expect(200);
    const session = sessionIdFrom(login);
    const stale = new Date(Date.now() - 6 * 60 * 1000);
    await prisma.session.update({ where: { id: session.sessionId }, data: { lastSeenAt: stale } });

    await request(app).get('/auth/me').set('Cookie', session.cookie).expect(200);
    const touched = await prisma.session.findUniqueOrThrow({ where: { id: session.sessionId } });
    expect(touched.lastSeenAt!.getTime()).toBeGreaterThan(stale.getTime());

    const recent = new Date();
    await prisma.session.update({ where: { id: session.sessionId }, data: { lastSeenAt: recent } });
    await request(app).get('/auth/me').set('Cookie', session.cookie).expect(200);
    await expect(prisma.session.findUnique({ where: { id: session.sessionId } })).resolves.toMatchObject({
      lastSeenAt: recent,
    });
  });

  it('accepts a legacy session without metadata and initializes its activity', async () => {
    const user = await prisma.hostUser.findUniqueOrThrow({ where: { email } });
    const legacy = await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    const token = jwt.sign({ userId: user.id, sessionId: legacy.id }, config.jwtSecret);

    await request(app).get('/auth/me').set('Cookie', `hostToken=${token}`).expect(200);
    await expect(prisma.session.findUnique({ where: { id: legacy.id } })).resolves.toMatchObject({
      ipAddress: null,
      userAgent: null,
      lastSeenAt: expect.any(Date),
    });
  });

  it('rejects a session when account deletion starts during the database lookup', async () => {
    const user = await createSessionUser('deletion-lookup-race');
    const session = await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date() },
    });
    let releaseLookup!: () => void;
    let markLookupStarted!: () => void;
    const lookupStarted = new Promise<void>((resolve) => { markLookupStarted = resolve; });
    const lookupRelease = new Promise<void>((resolve) => { releaseLookup = resolve; });
    let interceptLookup = true;
    prisma.$use(async (params, next) => {
      if (interceptLookup && params.model === 'Session' && params.action === 'findUnique' && params.args.where.id === session.id) {
        interceptLookup = false;
        markLookupStarted();
        await lookupRelease;
      }
      return next(params);
    });

    const validation = validateHostSession({ userId: user.id, sessionId: session.id });
    await lookupStarted;
    expect(beginAccountDeletion(user.id)).toBe(true);
    releaseLookup();

    try {
      await expect(validation).resolves.toEqual({ valid: false, code: 'AUTH_SESSION_INVALID' });
    } finally {
      endAccountDeletion(user.id);
    }
  });
});

describe('session management API', () => {
  it('lists only the current user active sessions and marks the current one', async () => {
    const user = await createSessionUser('list');
    const foreignUser = await createSessionUser('list-foreign');
    const now = Date.now();
    const current = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(now + 60_000),
        ipAddress: '198.51.100.41',
        userAgent: 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1',
        lastSeenAt: new Date(now),
      },
    });
    const other = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(now + 60_000),
        ipAddress: '198.51.100.42',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36',
        lastSeenAt: new Date(now - 1_000),
      },
    });
    const legacy = await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(now + 60_000) },
    });
    await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(now - 1), userAgent: 'expired-secret-agent' },
    });
    await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(now + 60_000), revokedAt: new Date(), userAgent: 'revoked-secret-agent' },
    });
    const foreign = await prisma.session.create({
      data: { userId: foreignUser.id, expiresAt: new Date(now + 60_000), userAgent: 'foreign-secret-agent' },
    });

    const response = await request(app)
      .get('/auth/sessions')
      .set('Cookie', cookieFor(user.id, current.id))
      .expect(200);

    expect(response.body.sessions).toHaveLength(3);
    for (const session of response.body.sessions) {
      expect(Object.keys(session).sort()).toEqual([
        'browser', 'createdAt', 'device', 'id', 'ipAddress', 'isCurrent', 'lastSeenAt',
      ]);
    }
    expect(response.body.sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: current.id,
        device: 'iPhone',
        browser: 'Safari',
        ipAddress: '198.51.100.41',
        createdAt: current.createdAt.toISOString(),
        lastSeenAt: new Date(now).toISOString(),
        isCurrent: true,
      }),
      expect.objectContaining({
        id: other.id,
        device: 'Windows',
        browser: 'Chrome',
        ipAddress: '198.51.100.42',
        isCurrent: false,
      }),
      expect.objectContaining({
        id: legacy.id,
        device: 'Неизвестное устройство',
        browser: 'Неизвестный браузер',
        ipAddress: null,
        lastSeenAt: null,
        isCurrent: false,
      }),
    ]));
    expect(JSON.stringify(response.body)).not.toContain('userAgent');
    expect(JSON.stringify(response.body)).not.toContain('expiresAt');
    expect(JSON.stringify(response.body)).not.toContain(foreign.id);
    expect(JSON.stringify(response.body)).not.toContain('secret-agent');
  });

  it('revokes another own session but rejects current and foreign sessions', async () => {
    const user = await createSessionUser('revoke');
    const foreignUser = await createSessionUser('revoke-foreign');
    const expiresAt = new Date(Date.now() + 60_000);
    const current = await prisma.session.create({ data: { userId: user.id, expiresAt, lastSeenAt: new Date() } });
    const other = await prisma.session.create({ data: { userId: user.id, expiresAt } });
    const foreign = await prisma.session.create({ data: { userId: foreignUser.id, expiresAt } });
    const cookie = cookieFor(user.id, current.id);
    const revokedEvent = new Promise<string[]>((resolve) => appEvents.once('host_sessions_revoked', resolve));

    await request(app).delete(`/auth/sessions/${current.id}`).set('Cookie', cookie).expect(400);
    await request(app).delete(`/auth/sessions/${foreign.id}`).set('Cookie', cookie).expect(404);
    await request(app).delete('/auth/sessions/missing-session').set('Cookie', cookie).expect(404);
    await request(app).delete(`/auth/sessions/${other.id}`).set('Cookie', cookie).expect(200, { success: true });

    await expect(revokedEvent).resolves.toEqual([other.id]);
    await expect(prisma.session.findUnique({ where: { id: current.id } })).resolves.toMatchObject({ revokedAt: null });
    await expect(prisma.session.findUnique({ where: { id: other.id } })).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    await expect(prisma.session.findUnique({ where: { id: foreign.id } })).resolves.toMatchObject({ revokedAt: null });
  });

  it('logs out every active session including the current one and clears the cookie', async () => {
    const user = await createSessionUser('logout-all');
    const foreignUser = await createSessionUser('logout-all-foreign');
    const expiresAt = new Date(Date.now() + 60_000);
    const current = await prisma.session.create({ data: { userId: user.id, expiresAt, lastSeenAt: new Date() } });
    const other = await prisma.session.create({ data: { userId: user.id, expiresAt } });
    const foreign = await prisma.session.create({ data: { userId: foreignUser.id, expiresAt } });
    const logoutEvent = new Promise<{ userId: string; sessionIds: string[] }>((resolve) => {
      appEvents.once('host_logout_all', (userId, sessionIds) => resolve({ userId, sessionIds }));
    });

    const response = await request(app)
      .post('/auth/logout-all')
      .set('Cookie', cookieFor(user.id, current.id))
      .expect(200, { success: true });

    const clearedCookie = response.headers['set-cookie']?.[0] ?? '';
    expect(clearedCookie).toContain('hostToken=');
    expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970');
    expect(clearedCookie).toContain('HttpOnly');
    const emitted = await logoutEvent;
    expect(emitted.userId).toBe(user.id);
    expect(emitted.sessionIds).toEqual(expect.arrayContaining([current.id, other.id]));
    await expect(prisma.session.count({
      where: { id: { in: [current.id, other.id] }, revokedAt: null },
    })).resolves.toBe(0);
    await expect(prisma.session.findUnique({ where: { id: foreign.id } })).resolves.toMatchObject({ revokedAt: null });
  });
});
