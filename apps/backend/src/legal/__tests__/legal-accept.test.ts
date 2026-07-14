import { prisma } from '../../prisma';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { legalRouter } from '../index';
import { requireAuth } from '../../auth/middleware';
import { legalBackendConfig, LegalDocumentType } from '../config';
import jwt from 'jsonwebtoken';
import { config } from '../../config';

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/legal', requireAuth, legalRouter);

describe('Legal Acceptance API', () => {
  let testUserId: string;
  let testSessionId: string;
  let authToken: string;

  beforeAll(async () => {
    const user = await prisma.hostUser.create({
      data: {
        email: 'legalaccept@example.com',
        passwordHash: 'dummy',
      },
    });
    testUserId = user.id;

    const session = await prisma.session.create({
      data: {
        userId: testUserId,
        expiresAt: new Date(Date.now() + 100000),
      },
    });
    testSessionId = session.id;

    authToken = jwt.sign({ userId: testUserId, sessionId: testSessionId }, config.jwtSecret);
  });

  afterAll(async () => {
    await prisma.legalAcceptance.deleteMany();
    await prisma.session.deleteMany();
    await prisma.hostUser.deleteMany({ where: { email: 'legalaccept@example.com' } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.legalAcceptance.deleteMany();
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/legal/accept').send({});
    expect(res.status).toBe(401);
  });

  it('rejects missing document type', async () => {
    const res = await request(app)
      .post('/legal/accept')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: 'unknown', version: '1.0' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Неизвестный тип документа');
  });

  it('records acceptance for offer', async () => {
    const res = await request(app)
      .post('/legal/accept')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: LegalDocumentType.OFFER, version: legalBackendConfig.versions[LegalDocumentType.OFFER] });
      
    expect(res.status).toBe(200);

    const acceptance = await prisma.legalAcceptance.findFirst({
      where: { hostUserId: testUserId, documentType: LegalDocumentType.OFFER }
    });
    expect(acceptance).toBeDefined();
    expect(acceptance?.documentVersion).toBe(legalBackendConfig.versions[LegalDocumentType.OFFER]);
  });

  it('records acceptance for terms', async () => {
    const res = await request(app)
      .post('/legal/accept')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: LegalDocumentType.TERMS, version: legalBackendConfig.versions[LegalDocumentType.TERMS] });
      
    expect(res.status).toBe(200);

    const acceptance = await prisma.legalAcceptance.findFirst({
      where: { hostUserId: testUserId, documentType: LegalDocumentType.TERMS }
    });
    expect(acceptance).toBeDefined();
    expect(acceptance?.documentVersion).toBe(legalBackendConfig.versions[LegalDocumentType.TERMS]);
  });
});
