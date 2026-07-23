import { prisma } from '../../prisma';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from '../index';
import { legalBackendConfig, LegalDocumentType } from '../../legal/config';

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

describe('Registration with Legal Acceptance', () => {
  const testEmail = 'legaltest@example.com';
  const testPassword = 'password123';
  const originalRegistrationEnabled = process.env.REGISTRATION_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;

  async function cleanupTestUser() {
    const user = await prisma.hostUser.findUnique({ where: { email: testEmail } });
    if (!user) return;
    await prisma.legalAcceptance.deleteMany({ where: { hostUserId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.hostUser.delete({ where: { id: user.id } });
  }

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.REGISTRATION_ENABLED = 'true';
    await cleanupTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser();
    if (originalRegistrationEnabled === undefined) delete process.env.REGISTRATION_ENABLED;
    else process.env.REGISTRATION_ENABLED = originalRegistrationEnabled;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    await prisma.$disconnect();
  });

  it('allows development registration without a feature flag', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.REGISTRATION_ENABLED;

    try {
      const res = await request(app)
        .post('/auth/register')
        .set('X-Forwarded-For', '198.51.100.99')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Необходимо принять Пользовательское соглашение');
    } finally {
      process.env.NODE_ENV = 'test';
      process.env.REGISTRATION_ENABLED = 'true';
    }
  });

  it('keeps production registration disabled until it is explicitly enabled', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.REGISTRATION_ENABLED;

    try {
      const res = await request(app)
        .post('/auth/register')
        .set('X-Forwarded-For', '198.51.100.100')
        .send({ email: testEmail, password: testPassword });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('REGISTRATION_DISABLED');
    } finally {
      process.env.NODE_ENV = 'test';
      process.env.REGISTRATION_ENABLED = 'true';
    }
  });

  it('rejects registration without termsAccepted = true', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Необходимо принять Пользовательское соглашение');
  });

  it('rejects registration with termsAccepted = false', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword, termsAccepted: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Необходимо принять Пользовательское соглашение');
  });

  it('rejects registration without separate personal data consent', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        termsAccepted: true,
        displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Необходимо дать согласие на обработку персональных данных');
  });

  it('rejects a stale personal data consent version', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({
        email: testEmail,
        password: testPassword,
        termsAccepted: true,
        displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
        personalDataConsentAccepted: true,
        displayedPersonalDataConsentVersion: '0.9',
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCUMENT_VERSION_MISMATCH');
    expect(res.body.documentType).toBe('PERSONAL_DATA_CONSENT');
  });

  it('accepts registration and creates separate LegalAcceptance records', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('User-Agent', 'registration-legal-test')
      .send({ 
        email: testEmail, 
        password: testPassword, 
        termsAccepted: true,
        displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
        personalDataConsentAccepted: true,
        displayedPersonalDataConsentVersion: '1.0',
      });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);

    const user = await prisma.hostUser.findUnique({ where: { email: testEmail } });
    expect(user).toBeDefined();

    const acceptances = await prisma.legalAcceptance.findMany({ where: { hostUserId: user!.id } });
    expect(acceptances).toHaveLength(2);
    expect(acceptances).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentType: LegalDocumentType.TERMS,
        documentVersion: legalBackendConfig.versions[LegalDocumentType.TERMS],
        acceptanceSource: 'REGISTRATION',
      }),
      expect.objectContaining({
        documentType: 'PERSONAL_DATA_CONSENT',
        documentVersion: '1.0',
        acceptanceSource: 'REGISTRATION',
        userAgent: 'registration-legal-test',
      }),
    ]));
    expect(acceptances.every(acceptance => acceptance.ipAddress)).toBe(true);
  });
});
