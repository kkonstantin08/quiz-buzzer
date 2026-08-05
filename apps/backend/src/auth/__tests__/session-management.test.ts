import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { config } from '../../config';
import { LegalDocumentType, legalBackendConfig } from '../../legal/config';
import { prisma } from '../../prisma';
import { authRouter } from '../index';

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

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

beforeAll(async () => {
  process.env.REGISTRATION_ENABLED = 'true';
  await prisma.hostUser.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10) },
  });
});

afterAll(async () => {
  await prisma.hostUser.deleteMany({ where: { email: { in: [email, registeredEmail] } } });
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
});
