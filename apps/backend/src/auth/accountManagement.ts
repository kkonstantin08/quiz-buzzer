import { Router } from 'express';
import { prisma } from '../prisma';
import { appEvents } from '../events';
import { AuthRequest, requireAuth } from './middleware';
import { describeUserAgent, hostCookieOptions } from './session';

export const accountManagementRouter = Router();

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
