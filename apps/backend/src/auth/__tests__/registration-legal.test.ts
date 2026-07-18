import { prisma } from '../../prisma';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from '../index';
import { legalBackendConfig, LegalDocumentType } from '../../legal/config';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

describe('Registration with Legal Acceptance', () => {
  const testEmail = 'legaltest@example.com';
  const testPassword = 'password123';

  async function cleanupTestUser() {
    const user = await prisma.hostUser.findUnique({ where: { email: testEmail } });
    if (!user) return;
    await prisma.legalAcceptance.deleteMany({ where: { hostUserId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.hostUser.delete({ where: { id: user.id } });
  }

  beforeEach(async () => {
    await cleanupTestUser();
  });

  afterAll(async () => {
    await cleanupTestUser();
    await prisma.$disconnect();
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

  it('accepts registration and creates LegalAcceptance record', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ 
        email: testEmail, 
        password: testPassword, 
        termsAccepted: true,
        displayedTermsVersion: legalBackendConfig.versions[LegalDocumentType.TERMS]
      });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(testEmail);

    const user = await prisma.hostUser.findUnique({ where: { email: testEmail } });
    expect(user).toBeDefined();

    const acceptances = await prisma.legalAcceptance.findMany({ where: { hostUserId: user!.id } });
    expect(acceptances.length).toBe(1);
    expect(acceptances[0].documentType).toBe(LegalDocumentType.TERMS);
    expect(acceptances[0].documentVersion).toBe(legalBackendConfig.versions[LegalDocumentType.TERMS]);
    expect(acceptances[0].ipAddress).toBeDefined();
  });
});
