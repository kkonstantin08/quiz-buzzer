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
    const res = await request(app).post('/legal/accept/updated-document').send({});
    expect(res.status).toBe(401);
  });

  it('rejects unknown document type', async () => {
    const res = await request(app)
      .post('/legal/accept/updated-document')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: 'unknown', documentVersion: '1.0' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Неизвестный тип документа');
  });

  it('rejects missing documentVersion', async () => {
    const res = await request(app)
      .post('/legal/accept/updated-document')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: LegalDocumentType.OFFER });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Не указана версия документа');
  });

  it('returns 409 DOCUMENT_VERSION_MISMATCH if versions do not match', async () => {
    const res = await request(app)
      .post('/legal/accept/updated-document')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: LegalDocumentType.OFFER, documentVersion: 'old-version-1.0' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DOCUMENT_VERSION_MISMATCH');
    expect(res.body.currentVersion).toBe(legalBackendConfig.versions[LegalDocumentType.OFFER]);
  });

  it('rejects unknown acceptance source in URL', async () => {
    const res = await request(app)
      .post('/legal/accept/hacked-source')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: LegalDocumentType.OFFER, documentVersion: legalBackendConfig.versions[LegalDocumentType.OFFER] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Неизвестный источник согласия');
  });

  it('rejects checkout source', async () => {
    const res = await request(app)
      .post('/legal/accept/checkout')
      .set('Cookie', `hostToken=${authToken}`)
      .send({ documentType: LegalDocumentType.OFFER, documentVersion: legalBackendConfig.versions[LegalDocumentType.OFFER] });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Принятие через checkout временно недоступно');
  });

  it('records acceptance idempotently', async () => {
    const validPayload = {
      documentType: LegalDocumentType.TERMS,
      documentVersion: legalBackendConfig.versions[LegalDocumentType.TERMS]
    };

    // First request
    const res1 = await request(app)
      .post('/legal/accept/updated-document')
      .set('Cookie', `hostToken=${authToken}`)
      .send(validPayload);
    expect(res1.status).toBe(200);

    // Check DB
    const count1 = await prisma.legalAcceptance.count({
      where: { hostUserId: testUserId, documentType: LegalDocumentType.TERMS }
    });
    expect(count1).toBe(1);

    // Second request (idempotent)
    const res2 = await request(app)
      .post('/legal/accept/updated-document')
      .set('Cookie', `hostToken=${authToken}`)
      .send(validPayload);
    expect(res2.status).toBe(200);

    // Check DB again, should still be 1
    const count2 = await prisma.legalAcceptance.count({
      where: { hostUserId: testUserId, documentType: LegalDocumentType.TERMS }
    });
    expect(count2).toBe(1);
  });

  it('handles concurrent acceptances gracefully', async () => {
    const validPayload = {
      documentType: LegalDocumentType.PRIVACY_ACKNOWLEDGEMENT,
      documentVersion: legalBackendConfig.versions[LegalDocumentType.PRIVACY_ACKNOWLEDGEMENT]
    };

    const req1 = request(app).post('/legal/accept/updated-document').set('Cookie', `hostToken=${authToken}`).send(validPayload);
    const req2 = request(app).post('/legal/accept/updated-document').set('Cookie', `hostToken=${authToken}`).send(validPayload);

    const [res1, res2] = await Promise.all([req1, req2]);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const count = await prisma.legalAcceptance.count({
      where: { hostUserId: testUserId, documentType: LegalDocumentType.PRIVACY_ACKNOWLEDGEMENT }
    });
    expect(count).toBe(1);
  });
});
