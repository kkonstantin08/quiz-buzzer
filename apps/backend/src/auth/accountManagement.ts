import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { prisma } from '../prisma';
import { appEvents } from '../events';
import { AuthRequest, requireAuth } from './middleware';
import { describeUserAgent, hostCookieOptions } from './session';
import { beginAccountDeletion, endAccountDeletion } from './accountDeletionState';

export const accountManagementRouter = Router();

const accountDeletionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.locals.accountDeletionVerificationFailed !== true,
  keyGenerator: (req) => {
    const authRequest = req as AuthRequest;
    return `${authRequest.userId ?? 'anonymous'}:${authRequest.sessionId ?? 'no-session'}:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
  },
  message: { error: 'Слишком много попыток удаления аккаунта. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

class StaleAccountDeletionError extends Error {}

accountManagementRouter.use(requireAuth);

accountManagementRouter.get('/sessions', async (req: AuthRequest, res) => {
  try {
    const sessions = await prisma.session.findMany({
      where: {
        userId: req.userId!,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      sessions: sessions.map((session) => ({
        id: session.id,
        ...describeUserAgent(session.userAgent),
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        isCurrent: session.id === req.sessionId,
      })),
    });
  } catch {
    return res.status(500).json({ error: 'Unable to load sessions' });
  }
});

accountManagementRouter.delete('/sessions/:sessionId', async (req: AuthRequest, res) => {
  if (req.params.sessionId === req.sessionId) {
    return res.status(400).json({ error: 'Use logout for the current session' });
  }

  try {
    const revokedAt = new Date();
    const result = await prisma.session.updateMany({
      where: {
        id: req.params.sessionId,
        userId: req.userId!,
        revokedAt: null,
        expiresAt: { gt: revokedAt },
      },
      data: { revokedAt },
    });
    if (result.count !== 1) return res.status(404).json({ error: 'Session not found' });

    appEvents.emit('host_sessions_revoked', [req.params.sessionId]);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Unable to revoke session' });
  }
});

accountManagementRouter.post('/logout-all', async (req: AuthRequest, res) => {
  try {
    const sessionIds = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const current = await tx.session.findFirst({
        where: {
          id: req.sessionId!,
          userId: req.userId!,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (!current) return null;

      const sessions = await tx.session.findMany({
        where: { userId: req.userId!, revokedAt: null, expiresAt: { gt: now } },
        select: { id: true },
      });
      const ids = sessions.map((session) => session.id);
      await tx.session.updateMany({
        where: { id: { in: ids }, userId: req.userId!, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      return ids;
    });

    if (!sessionIds) return res.status(401).json({ error: 'Session no longer active' });

    res.clearCookie('hostToken', hostCookieOptions());
    appEvents.emit('host_logout_all', req.userId!, sessionIds);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Unable to log out all sessions' });
  }
});

accountManagementRouter.delete('/account', accountDeletionLimiter, async (req: AuthRequest, res) => {
  const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  if (
    typeof payload.currentPassword !== 'string'
    || payload.confirmationPhrase !== 'УДАЛИТЬ АККАУНТ'
    || payload.irreversibleConfirmed !== true
  ) {
    res.locals.accountDeletionVerificationFailed = true;
    return res.status(400).json({ error: 'Не удалось подтвердить удаление аккаунта' });
  }

  const user = await prisma.hostUser.findUnique({
    where: { id: req.userId! },
    select: { passwordHash: true },
  });
  if (!user || !await bcrypt.compare(payload.currentPassword, user.passwordHash)) {
    res.locals.accountDeletionVerificationFailed = true;
    return res.status(400).json({ error: 'Не удалось подтвердить удаление аккаунта' });
  }

  if (!beginAccountDeletion(req.userId!)) {
    res.locals.accountDeletionVerificationFailed = true;
    return res.status(409).json({ error: 'Удаление аккаунта уже выполняется' });
  }

  try {
    const archiveSubjectId = randomUUID();
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      const [currentUser, currentSession] = await Promise.all([
        tx.hostUser.findUnique({
          where: { id: req.userId! },
          select: { passwordHash: true, avatarUrl: true },
        }),
        tx.session.findFirst({
          where: {
            id: req.sessionId!,
            userId: req.userId!,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          select: { id: true },
        }),
      ]);
      if (!currentUser || currentUser.passwordHash !== user.passwordHash || !currentSession) {
        throw new StaleAccountDeletionError();
      }

      const [legal, subscription, payments, paymentMethods, settings] = await Promise.all([
        tx.legalAcceptance.findMany({ where: { hostUserId: req.userId! } }),
        tx.subscription.findUnique({ where: { hostUserId: req.userId! } }),
        tx.payment.findMany({ where: { hostUserId: req.userId! }, include: { refunds: true } }),
        tx.paymentMethod.findMany({ where: { hostUserId: req.userId! } }),
        tx.hostSettings.findUnique({ where: { hostUserId: req.userId! } }),
      ]);

      if (legal.length > 0) {
        await tx.archivedLegalAcceptance.createMany({
          data: legal.map((record) => ({
            archiveSubjectId,
            documentType: record.documentType,
            documentVersion: record.documentVersion,
            acceptanceSource: record.acceptanceSource,
            acceptedAt: record.acceptedAt,
          })),
        });
      }
      if (subscription) {
        await tx.archivedSubscription.create({
          data: {
            archiveSubjectId,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            autoRenew: subscription.autoRenew,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            canceledAt: subscription.canceledAt,
            nextChargeAt: subscription.nextChargeAt,
            lastPaymentId: subscription.lastPaymentId,
            providerPaymentMethodId: subscription.providerPaymentMethodId,
            createdAt: subscription.createdAt,
            updatedAt: subscription.updatedAt,
          },
        });
      }
      if (payments.length > 0) {
        await tx.archivedPayment.createMany({
          data: payments.map((payment) => ({
            archiveSubjectId,
            provider: payment.provider,
            providerPaymentId: payment.providerPaymentId,
            idempotencyKey: payment.idempotencyKey,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            status: payment.status,
            createdAt: payment.createdAt,
            paidAt: payment.paidAt,
            updatedAt: payment.updatedAt,
          })),
        });
      }
      const refunds = payments.flatMap((payment) => payment.refunds.map((refund) => ({ payment, refund })));
      if (refunds.length > 0) {
        await tx.archivedRefund.createMany({
          data: refunds.map(({ payment, refund }) => ({
            archiveSubjectId,
            providerPaymentId: payment.providerPaymentId,
            providerRefundId: refund.providerRefundId,
            amountMinor: refund.amountMinor,
            currency: refund.currency,
            status: refund.status,
            createdAt: refund.createdAt,
            updatedAt: refund.updatedAt,
          })),
        });
      }
      if (paymentMethods.length > 0) {
        await tx.archivedPaymentMethod.createMany({
          data: paymentMethods.map((method) => ({
            archiveSubjectId,
            provider: method.provider,
            providerPaymentMethodId: method.providerPaymentMethodId,
            recurringEnabled: method.recurringEnabled,
            consentedAt: method.consentedAt,
            disabledAt: method.disabledAt,
            createdAt: method.createdAt,
            updatedAt: method.updatedAt,
          })),
        });
      }

      const paymentIds = payments.map((payment) => payment.id);
      await tx.refund.deleteMany({ where: { paymentId: { in: paymentIds } } });
      await tx.payment.deleteMany({ where: { hostUserId: req.userId! } });
      await tx.paymentMethod.deleteMany({ where: { hostUserId: req.userId! } });
      await tx.legalAcceptance.deleteMany({ where: { hostUserId: req.userId! } });
      await tx.subscription.deleteMany({ where: { hostUserId: req.userId! } });
      await tx.gameHistory.deleteMany({ where: { hostUserId: req.userId! } });
      await tx.passwordResetToken.deleteMany({ where: { userId: req.userId! } });
      await tx.session.deleteMany({ where: { userId: req.userId! } });
      await tx.hostSettings.deleteMany({ where: { hostUserId: req.userId! } });
      const deleted = await tx.hostUser.deleteMany({
        where: { id: req.userId!, passwordHash: user.passwordHash },
      });
      if (deleted.count !== 1) throw new StaleAccountDeletionError();

      return [currentUser.avatarUrl, settings?.customLogoUrl, settings?.customBgUrl].filter(
        (url): url is string => typeof url === 'string',
      );
    });

    appEvents.emit('host_account_deleted', req.userId!);
    res.clearCookie('hostToken', hostCookieOptions());
    return res.json({ success: true });
  } catch (error) {
    if (error instanceof StaleAccountDeletionError) {
      res.locals.accountDeletionVerificationFailed = true;
      return res.status(409).json({ error: 'Состояние аккаунта изменилось. Повторите попытку.' });
    }
    return res.status(500).json({ error: 'Не удалось удалить аккаунт' });
  } finally {
    endAccountDeletion(req.userId!);
  }
});
