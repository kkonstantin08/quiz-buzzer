import bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { jest } from '@jest/globals';
import { config } from '../../config';
import { appEvents } from '../../events';
import { prisma } from '../../prisma';
import { authRouter } from '../index';

const app = express();
app.set('trust proxy', 'loopback');
app.use(express.json());
app.use(cookieParser());
app.use('/auth', authRouter);

const prefix = `account-deletion-${Date.now()}`;
const password = 'password123';
const confirmation = {
  currentPassword: password,
  confirmationPhrase: 'УДАЛИТЬ АККАУНТ',
  irreversibleConfirmed: true,
};
const userIds = new Set<string>();
let requestNumber = 20;

function cookieFor(userId: string, sessionId: string) {
  return `hostToken=${jwt.sign({ userId, sessionId }, config.jwtSecret)}`;
}

function deleteRequest(cookie: string) {
  requestNumber += 1;
  return request(app)
    .delete('/auth/account')
    .set('Cookie', cookie)
    .set('X-Forwarded-For', `198.51.100.${requestNumber}`);
}

async function createAccount(label: string) {
  const user = await prisma.hostUser.create({
    data: {
      email: `${prefix}-${label}@example.com`,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  userIds.add(user.id);
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date() },
  });
  return { user, session, cookie: cookieFor(user.id, session.id) };
}

async function createPopulatedAccount(label: string) {
  const account = await createAccount(label);
  const providerPaymentId = `${prefix}-${label}-provider-payment`;
  const providerPaymentMethodId = `${prefix}-${label}-provider-method`;
  const now = new Date();
  await prisma.hostUser.update({
    where: { id: account.user.id },
    data: {
      name: 'Персональное имя',
      avatarUrl: '/uploads/private-avatar.png',
      freeTrialUsed: true,
    },
  });
  await prisma.hostSettings.create({
    data: {
      hostUserId: account.user.id,
      customLogoUrl: '/uploads/private-logo.png',
      customBgUrl: '/uploads/private-background.png',
    },
  });
  await prisma.subscription.create({
    data: {
      hostUserId: account.user.id,
      status: 'active',
      currentPeriodStart: new Date(now.getTime() - 60_000),
      currentPeriodEnd: new Date(now.getTime() + 60_000),
      autoRenew: true,
      cancelAtPeriodEnd: false,
      nextChargeAt: new Date(now.getTime() + 30_000),
      lastPaymentId: providerPaymentId,
      providerPaymentMethodId,
    },
  });
  await prisma.legalAcceptance.create({
    data: {
      hostUserId: account.user.id,
      documentType: 'TERMS',
      documentVersion: '1.0',
      acceptanceSource: 'REGISTRATION',
      ipAddress: '203.0.113.88',
      userAgent: 'private-user-agent',
    },
  });
  const payment = await prisma.payment.create({
    data: {
      hostUserId: account.user.id,
      provider: 'test-provider',
      providerPaymentId,
      idempotencyKey: `${prefix}-${label}-idempotency`,
      amountMinor: 9900,
      currency: 'RUB',
      status: 'succeeded',
      description: 'private payment description',
      paidAt: now,
    },
  });
  const refund = await prisma.refund.create({
    data: {
      paymentId: payment.id,
      providerRefundId: `${prefix}-${label}-provider-refund`,
      amountMinor: 1000,
      currency: 'RUB',
      status: 'succeeded',
      reason: 'private refund reason',
    },
  });
  await prisma.paymentMethod.create({
    data: {
      hostUserId: account.user.id,
      provider: 'test-provider',
      providerPaymentMethodId,
      recurringEnabled: true,
      consentedAt: now,
    },
  });
  await prisma.gameHistory.create({
    data: {
      hostUserId: account.user.id,
      roomCode: 'ABC123',
      result: 'WINNER',
      winnerName: 'Private Player',
      winnerScore: 3,
      participants: 2,
    },
  });
  const reset = await prisma.passwordResetToken.create({
    data: {
      userId: account.user.id,
      tokenHash: `${prefix}-${label}-reset-token-hash`,
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  const otherSession = await prisma.session.create({
    data: { userId: account.user.id, expiresAt: new Date(now.getTime() + 60_000) },
  });
  return { ...account, payment, refund, reset, otherSession, providerPaymentId, providerPaymentMethodId };
}

function compareBarrier(count: number) {
  let arrived = 0;
  let ready!: () => void;
  let release!: () => void;
  const allArrived = new Promise<void>((resolve) => { ready = resolve; });
  const continueComparisons = new Promise<void>((resolve) => { release = resolve; });
  return {
    async wait() {
      arrived += 1;
      if (arrived === count) ready();
      await continueComparisons;
    },
    allArrived,
    release,
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.hostUser.deleteMany({ where: { id: { in: [...userIds] } } });
  userIds.clear();
  await prisma.archivedRefund.deleteMany();
  await prisma.archivedPayment.deleteMany();
  await prisma.archivedPaymentMethod.deleteMany();
  await prisma.archivedSubscription.deleteMany();
  await prisma.archivedLegalAcceptance.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('account deletion', () => {
  it('requires the current password, exact phrase, and irreversible confirmation', async () => {
    const account = await createAccount('validation');

    await deleteRequest(account.cookie).send({ ...confirmation, currentPassword: 'wrong-password' }).expect(400);
    await deleteRequest(account.cookie).send({ ...confirmation, confirmationPhrase: 'Удалить аккаунт' }).expect(400);
    await deleteRequest(account.cookie).send({ ...confirmation, irreversibleConfirmed: false }).expect(400);

    await expect(prisma.hostUser.findUnique({ where: { id: account.user.id } })).resolves.toBeTruthy();
  });

  it('rate limits repeated failed deletion verification', async () => {
    const account = await createAccount('rate-limit');
    const ip = '198.51.100.240';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .delete('/auth/account')
        .set('Cookie', account.cookie)
        .set('X-Forwarded-For', ip)
        .send({ ...confirmation, currentPassword: 'wrong-password' })
        .expect(400);
    }
    await request(app)
      .delete('/auth/account')
      .set('Cookie', account.cookie)
      .set('X-Forwarded-For', ip)
      .send({ ...confirmation, currentPassword: 'wrong-password' })
      .expect(429);
  });

  it('rejects revoked and expired current sessions before deletion', async () => {
    const revoked = await createAccount('revoked');
    await prisma.session.update({ where: { id: revoked.session.id }, data: { revokedAt: new Date() } });
    await deleteRequest(revoked.cookie).send(confirmation).expect(401);

    const expired = await createAccount('expired');
    await prisma.session.update({ where: { id: expired.session.id }, data: { expiresAt: new Date(Date.now() - 1) } });
    await deleteRequest(expired.cookie).send(confirmation).expect(401);
  });

  it('fails closed when the password hash changes after preliminary verification', async () => {
    const account = await createAccount('password-race');
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementationOnce(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      await prisma.hostUser.update({
        where: { id: account.user.id },
        data: { passwordHash: await bcrypt.hash('changed-password123', 10) },
      });
      return result;
    });

    await deleteRequest(account.cookie).send(confirmation).expect(409);
    await expect(prisma.hostUser.findUnique({ where: { id: account.user.id } })).resolves.toBeTruthy();
  });

  it('allows only one of two concurrent deletion requests', async () => {
    const account = await createAccount('concurrent');
    const barrier = compareBarrier(2);
    const compare = bcrypt.compare.bind(bcrypt);
    jest.spyOn(bcrypt, 'compare').mockImplementation(async (candidate, hash) => {
      const result = await compare(candidate, hash);
      if (candidate === password && result) await barrier.wait();
      return result;
    });

    const first = deleteRequest(account.cookie).send(confirmation).then((response) => response);
    const second = deleteRequest(account.cookie).send(confirmation).then((response) => response);
    await barrier.allArrived;
    barrier.release();
    const responses = await Promise.all([first, second]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    await expect(prisma.hostUser.findUnique({ where: { id: account.user.id } })).resolves.toBeNull();
  });

  it('archives the exact legal and billing whitelist and deletes all working data', async () => {
    const account = await createPopulatedAccount('archive');
    const deletedEvent = new Promise<string>((resolve) => appEvents.once('host_account_deleted', resolve));

    const response = await deleteRequest(account.cookie).send(confirmation).expect(200, { success: true });

    await expect(deletedEvent).resolves.toBe(account.user.id);
    const clearedCookie = response.headers['set-cookie']?.[0] ?? '';
    expect(clearedCookie).toContain('hostToken=');
    expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970');
    await expect(prisma.hostUser.findUnique({ where: { id: account.user.id } })).resolves.toBeNull();
    await expect(prisma.hostSettings.count({ where: { hostUserId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.subscription.count({ where: { hostUserId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.gameHistory.count({ where: { hostUserId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.session.count({ where: { userId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.passwordResetToken.count({ where: { userId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.legalAcceptance.count({ where: { hostUserId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.payment.count({ where: { hostUserId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.paymentMethod.count({ where: { hostUserId: account.user.id } })).resolves.toBe(0);
    await expect(prisma.refund.findUnique({ where: { id: account.refund.id } })).resolves.toBeNull();

    const legal = await prisma.archivedLegalAcceptance.findMany();
    const subscriptions = await prisma.archivedSubscription.findMany();
    const payments = await prisma.archivedPayment.findMany();
    const refunds = await prisma.archivedRefund.findMany();
    const methods = await prisma.archivedPaymentMethod.findMany();
    expect(legal).toHaveLength(1);
    expect(subscriptions).toHaveLength(1);
    expect(payments).toHaveLength(1);
    expect(refunds).toHaveLength(1);
    expect(methods).toHaveLength(1);
    expect(Object.keys(legal[0]).sort()).toEqual([
      'acceptanceSource', 'acceptedAt', 'archiveSubjectId', 'archivedAt', 'documentType', 'documentVersion', 'id',
    ]);
    expect(Object.keys(payments[0]).sort()).toEqual([
      'amountMinor', 'archiveSubjectId', 'archivedAt', 'createdAt', 'currency', 'id', 'idempotencyKey', 'paidAt',
      'provider', 'providerPaymentId', 'status', 'updatedAt',
    ]);
    expect(refunds[0]).toMatchObject({ providerPaymentId: account.providerPaymentId });
    const subjects = [legal[0], subscriptions[0], payments[0], refunds[0], methods[0]]
      .map((record) => record.archiveSubjectId);
    expect(new Set(subjects)).toEqual(new Set([legal[0].archiveSubjectId]));

    const archiveJson = JSON.stringify({ legal, subscriptions, payments, refunds, methods });
    for (const forbidden of [
      account.user.id,
      account.user.email,
      'Персональное имя',
      '203.0.113.88',
      'private-user-agent',
      '/uploads/private-avatar.png',
      '/uploads/private-logo.png',
      '/uploads/private-background.png',
      account.user.passwordHash,
      account.session.id,
      account.otherSession.id,
      account.reset.id,
      account.payment.id,
      account.refund.id,
      'private payment description',
      'private refund reason',
    ]) {
      expect(archiveJson).not.toContain(forbidden);
    }
  });

  it('rolls back every archive and deletion write when archiving fails', async () => {
    const account = await createPopulatedAccount('rollback');
    const now = new Date();
    await prisma.archivedPayment.create({
      data: {
        archiveSubjectId: 'existing-archive-subject',
        provider: 'test-provider',
        providerPaymentId: account.providerPaymentId,
        idempotencyKey: `${prefix}-existing-idempotency`,
        amountMinor: 1,
        currency: 'RUB',
        status: 'succeeded',
        createdAt: now,
        updatedAt: now,
      },
    });

    await deleteRequest(account.cookie).send(confirmation).expect(500);

    await expect(prisma.hostUser.findUnique({ where: { id: account.user.id } })).resolves.toBeTruthy();
    await expect(prisma.session.count({ where: { userId: account.user.id } })).resolves.toBe(2);
    await expect(prisma.payment.count({ where: { hostUserId: account.user.id } })).resolves.toBe(1);
    await expect(prisma.legalAcceptance.count({ where: { hostUserId: account.user.id } })).resolves.toBe(1);
    await expect(prisma.archivedLegalAcceptance.count()).resolves.toBe(0);
    await expect(prisma.archivedPayment.count()).resolves.toBe(1);
  });
});
