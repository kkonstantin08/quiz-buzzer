import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { countUploadReferences, InvalidUploadError, receiveUpload, saveUploadedFile, deleteUploadedFile, withUploadLock } from '../utils/upload';
import { prisma } from '../prisma';
import { config } from '../config';
import { requireAuth, AuthRequest } from './middleware';
import { appEvents } from '../events';
import { LegalDocumentType, LegalAcceptanceSource, legalBackendConfig } from '../legal/config';
import { normalizeEmail, normalizeName } from './validation';
export const authRouter = Router();

const hostCookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax' as const,
  path: '/',
});

export const createLoginLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Слишком много попыток входа, пожалуйста, подождите 15 минут' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const createRegisterLimiter = () => rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per IP per hour
  message: { error: 'Слишком много регистраций с этого IP, пожалуйста, подождите час' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Current deployment has one backend process; use a shared rate-limit store before horizontal scaling.
export const createPasswordVerificationLimiter = () => rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  skip: (req) => typeof req.body?.currentPassword !== 'string',
  requestWasSuccessful: (_req, res) => res.locals.passwordVerificationFailed !== true,
  keyGenerator: (req) => {
    const authRequest = req as AuthRequest;
    return `${authRequest.userId ?? 'anonymous'}:${authRequest.sessionId ?? 'no-session'}:${ipKeyGenerator(req.ip ?? '0.0.0.0')}`;
  },
  message: { error: 'Too many password attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = createLoginLimiter();
const registerLimiter = createRegisterLimiter();
const passwordVerificationLimiter = createPasswordVerificationLimiter();

function isUniqueConstraintError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

type DatabaseClient = typeof prisma | Prisma.TransactionClient;
type ProfileUser = Prisma.HostUserGetPayload<{ include: { subscription: true; settings: true } }>;
type EmailChangeResult =
  | { kind: 'stale' }
  | { kind: 'conflict' }
  | { kind: 'updated'; user: ProfileUser; revokedSessionIds: string[] };

async function findUserIdsByCanonicalEmail(db: DatabaseClient, email: string) {
  return db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "HostUser" WHERE lower("email") = ${email} LIMIT 2
  `;
}

async function resolveLoginUserId(db: DatabaseClient, trimmedEmail: string, canonicalEmail: string) {
  const exactMatch = await db.hostUser.findUnique({ where: { email: trimmedEmail }, select: { id: true } });
  if (exactMatch) return exactMatch.id;

  const matches = await findUserIdsByCanonicalEmail(db, canonicalEmail);
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1) console.warn(JSON.stringify({ event: 'ambiguous_legacy_email', matchCount: matches.length }));
  return null;
}

async function hasOtherCanonicalEmailMatch(db: DatabaseClient, canonicalEmail: string, userId?: string) {
  const matches = await findUserIdsByCanonicalEmail(db, canonicalEmail);
  return matches.some((match) => match.id !== userId);
}

async function hasCurrentSensitiveState(
  tx: Prisma.TransactionClient,
  userId: string,
  sessionId: string,
  verifiedPasswordHash: string,
) {
  const [user, session] = await Promise.all([
    tx.hostUser.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
    tx.session.findUnique({ where: { id: sessionId }, select: { userId: true, revokedAt: true, expiresAt: true } }),
  ]);
  return user?.passwordHash === verifiedPasswordHash
    && session?.userId === userId
    && session.revokedAt === null
    && session.expiresAt > new Date();
}

authRouter.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.ok || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const trimmedEmail = email.trim();

    const userId = await resolveLoginUserId(prisma, trimmedEmail, normalizedEmail.value);

    if (!userId) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = await prisma.hostUser.findUnique({
      where: { id: userId },
      include: { subscription: true, settings: true },
    });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const login = await prisma.$transaction(async (tx) => {
      const currentUser = await tx.hostUser.findUnique({
        where: { id: user.id },
        include: { subscription: true, settings: true },
      });
      const currentUserId = await resolveLoginUserId(tx, trimmedEmail, normalizedEmail.value);
      if (!currentUser || currentUser.passwordHash !== user.passwordHash || currentUserId !== user.id) return null;

      const session = await tx.session.create({ data: { userId: user.id, expiresAt } });
      return { user: currentUser, session };
    });
    if (!login) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ userId: login.user.id, sessionId: login.session.id }, config.jwtSecret, { expiresIn: '7d' });
    
    // Set JWT in httpOnly cookie (inaccessible to JavaScript)
    res.cookie('hostToken', token, {
      ...hostCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });
    
    // Check subscription status
    const hasActiveSubscription = login.user.subscription &&
      login.user.subscription.status === 'active' &&
      login.user.subscription.currentPeriodEnd > new Date();

    return res.json({
      hasActiveSubscription: !!hasActiveSubscription,
      email: login.user.email,
      name: login.user.name,
      avatarUrl: login.user.avatarUrl,
      customLogoUrl: login.user.settings?.customLogoUrl || null,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.hostUser.findUnique({
      where: { id: req.userId! },
      include: { subscription: true, settings: true },
    });
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const hasActiveSubscription = user.subscription && 
      user.subscription.status === 'active' && 
      user.subscription.currentPeriodEnd > new Date();
      
    return res.json({
      hasActiveSubscription: !!hasActiveSubscription,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      customLogoUrl: user.settings?.customLogoUrl || null,
      subscription: user.subscription ? {
        status: user.subscription.status,
        currentPeriodEnd: user.subscription.currentPeriodEnd
      } : null
    });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  await prisma.session.update({
    where: { id: req.sessionId! },
    data: { revokedAt: new Date() }
  });
  appEvents.emit('host_logout', req.sessionId!);
  res.clearCookie('hostToken', hostCookieOptions());
  return res.json({ success: true });
});

authRouter.post('/clear-session', (_req, res) => {
  res.clearCookie('hostToken', hostCookieOptions());
  return res.json({ success: true });
});

authRouter.put('/me', requireAuth, passwordVerificationLimiter, async (req: AuthRequest, res) => {
  try {
    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const hasName = Object.hasOwn(payload, 'name');
    const hasEmail = Object.hasOwn(payload, 'email');
    const name = hasName ? normalizeName(payload.name) : undefined;
    const email = hasEmail ? normalizeEmail(payload.email) : undefined;

    if ((name && !name.ok) || (email && !email.ok)) {
      return res.status(400).json({ error: 'Invalid profile data' });
    }

    const currentUser = await prisma.hostUser.findUnique({ where: { id: req.userId! } });
    if (!currentUser) return res.status(401).json({ error: 'User not found' });

    const emailChanged = email?.ok && email.value !== currentUser.email;
    if (emailChanged) {
      if (typeof payload.currentPassword !== 'string') {
        return res.status(400).json({ error: 'Unable to update email' });
      }
      const isCurrentPassword = await bcrypt.compare(payload.currentPassword, currentUser.passwordHash);
      if (!isCurrentPassword) {
        res.locals.passwordVerificationFailed = true;
        return res.status(400).json({ error: 'Unable to update email' });
      }

      if (await hasOtherCanonicalEmailMatch(prisma, email.value, req.userId)) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    let updatedUser: ProfileUser | null = null;
    let revokedSessionIds: string[] = [];
    try {
      if (emailChanged) {
        const changed: EmailChangeResult = await prisma.$transaction(async (tx): Promise<EmailChangeResult> => {
          if (!await hasCurrentSensitiveState(tx, req.userId!, req.sessionId!, currentUser.passwordHash)) return { kind: 'stale' };
          if (await hasOtherCanonicalEmailMatch(tx, email!.value, req.userId)) return { kind: 'conflict' };
          const user = await tx.hostUser.update({
            where: { id: req.userId! },
            data: { name: name?.ok ? name.value : undefined, email: email.value },
            include: { subscription: true, settings: true },
          });
          const sessions = await tx.session.findMany({
            where: { userId: req.userId!, id: { not: req.sessionId! }, revokedAt: null },
            select: { id: true },
          });
          await tx.session.updateMany({
            where: { id: { in: sessions.map((session) => session.id) }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { kind: 'updated', user, revokedSessionIds: sessions.map((session) => session.id) };
        });
        if (changed.kind === 'stale') return res.status(400).json({ error: 'Unable to update email' });
        if (changed.kind === 'conflict') return res.status(400).json({ error: 'Email already in use' });
        updatedUser = changed.user;
        revokedSessionIds = changed.revokedSessionIds;
      } else {
        updatedUser = await prisma.hostUser.update({
          where: { id: req.userId! },
          data: { name: name?.ok ? name.value : undefined },
          include: { subscription: true, settings: true },
        });
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) return res.status(400).json({ error: 'Email already in use' });
      throw error;
    }

    if (!updatedUser) return res.status(400).json({ error: 'Unable to update email' });
    if (revokedSessionIds.length > 0) appEvents.emit('host_sessions_revoked', revokedSessionIds);

    const hasActiveSubscription = updatedUser.subscription && 
      updatedUser.subscription.status === 'active' && 
      updatedUser.subscription.currentPeriodEnd > new Date();

    return res.json({
      hasActiveSubscription: !!hasActiveSubscription,
      email: updatedUser.email,
      name: updatedUser.name,
      avatarUrl: updatedUser.avatarUrl,
      customLogoUrl: updatedUser.settings?.customLogoUrl || null,
      subscription: updatedUser.subscription ? {
        status: updatedUser.subscription.status,
        currentPeriodEnd: updatedUser.subscription.currentPeriodEnd
      } : null
    });
  } catch (error) {
    return res.status(500).json({ error: 'Update failed' });
  }
});

authRouter.post('/change-password', requireAuth, passwordVerificationLimiter, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'Invalid password change' });
    }

    const user = await prisma.hostUser.findUnique({ where: { id: req.userId! } });
    if (!user) return res.status(400).json({ error: 'Invalid password change' });

    const isCurrentPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPassword) {
      res.locals.passwordVerificationFailed = true;
      return res.status(400).json({ error: 'Invalid password change' });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ error: 'Invalid password change' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const revokedSessionIds = await prisma.$transaction(async (tx) => {
      if (!await hasCurrentSensitiveState(tx, req.userId!, req.sessionId!, user.passwordHash)) return null;
      await tx.hostUser.update({ where: { id: req.userId! }, data: { passwordHash } });
      const sessions = await tx.session.findMany({
        where: { userId: req.userId!, id: { not: req.sessionId! }, revokedAt: null },
        select: { id: true },
      });
      await tx.session.updateMany({
        where: { id: { in: sessions.map((session) => session.id) }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return sessions.map((session) => session.id);
    });

    if (!revokedSessionIds) return res.status(400).json({ error: 'Invalid password change' });

    if (revokedSessionIds.length > 0) appEvents.emit('host_sessions_revoked', revokedSessionIds);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Password change failed' });
  }
});

authRouter.post('/avatar', requireAuth, receiveUpload('avatar'), async (req: AuthRequest, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded or invalid file type' });
    }

    const uploaded = await withUploadLock(`${req.userId}:avatar`, () => saveUploadedFile(req.file!, async (avatarUrl) => {
      const persisted = await prisma.$transaction(async (tx) => {
        const user = await tx.hostUser.findUnique({ where: { id: req.userId! } });
        const updatedUser = await tx.hostUser.update({
          where: { id: req.userId! },
          data: { avatarUrl },
        });
        const references = await countUploadReferences(tx, user?.avatarUrl);
        return { user, updatedUser, references };
      });
      return {
        previousUrl: persisted.user?.avatarUrl,
        deletePrevious: persisted.references === 0,
        result: persisted.updatedUser,
      };
    }));

    return res.json({ avatarUrl: uploaded.result.avatarUrl });
  } catch (error) {
    if (error instanceof InvalidUploadError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Avatar upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

authRouter.delete('/avatar', requireAuth, async (req: AuthRequest, res) => {
  try {
    const updatedUser = await withUploadLock(`${req.userId}:avatar`, async () => {
      const persisted = await prisma.$transaction(async (tx) => {
        const user = await tx.hostUser.findUnique({ where: { id: req.userId! } });
        const updatedUser = await tx.hostUser.update({
          where: { id: req.userId! },
          data: { avatarUrl: null },
        });
        const references = await countUploadReferences(tx, user?.avatarUrl);
        return { user, updatedUser, references };
      });
      if (persisted.references === 0) {
        try {
          await deleteUploadedFile(persisted.user?.avatarUrl);
        } catch (error) {
          console.error('Failed to delete avatar:', error);
        }
      }
      return persisted.updatedUser;
    });
    return res.json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error('Avatar delete error:', error);
    return res.status(500).json({ error: 'Upload delete failed' });
  }
});

authRouter.post('/register', registerLimiter, async (req, res) => {
  if (process.env.REGISTRATION_ENABLED === 'false') {
    return res.status(503).json({
      code: 'REGISTRATION_DISABLED',
      message: 'Регистрация временно недоступна'
    });
  }

  try {
    const { email, password, termsAccepted, displayedTermsVersion } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail.ok || typeof password !== 'string' || password.length === 0) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!termsAccepted) {
      return res.status(400).json({ error: 'Необходимо принять Пользовательское соглашение' });
    }

    const serverTermsVersion = legalBackendConfig.versions[LegalDocumentType.TERMS];
    if (displayedTermsVersion !== serverTermsVersion) {
      return res.status(409).json({
        code: 'DOCUMENT_VERSION_MISMATCH',
        message: 'Версия документа изменилась. Обновите страницу и повторите действие.',
        currentVersion: serverTermsVersion
      });
    }

    if (!normalizedEmail.ok) {
      return res.status(400).json({ error: 'Неверный формат email' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 8 символов' });
    }

    if (await hasOtherCanonicalEmailMatch(prisma, normalizedEmail.value)) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Get client IP and User-Agent
    const ipAddress = req.ip || req.socket.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    // Use transaction for atomic creation
    const { user, session } = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.hostUser.create({
        data: {
          email: normalizedEmail.value,
          passwordHash,
        },
      });

      const createdSession = await tx.session.create({
        data: {
          userId: createdUser.id,
          expiresAt,
        }
      });

      // Explicitly use server version instead of client version
      const serverVersion = legalBackendConfig.versions[LegalDocumentType.TERMS];

      await tx.legalAcceptance.create({
        data: {
          hostUserId: createdUser.id,
          documentType: LegalDocumentType.TERMS,
          documentVersion: serverVersion,
          acceptanceSource: LegalAcceptanceSource.REGISTRATION,
          ipAddress,
          userAgent,
        }
      });

      return { user: createdUser, session: createdSession };
    });

    const token = jwt.sign({ userId: user.id, sessionId: session.id }, config.jwtSecret, { expiresIn: '7d' });

    // Set JWT in httpOnly cookie (inaccessible to JavaScript)
    res.cookie('hostToken', token, {
      ...hostCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });

    return res.json({
      hasActiveSubscription: false,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      customLogoUrl: null,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(400).json({ error: 'Пользователь с таким email уже существует' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
