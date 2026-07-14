import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { uploadMiddleware, validateFileSignature, deleteUploadedFile } from '../utils/upload';
import { prisma } from '../prisma';
import { config } from '../config';
import { requireAuth, AuthRequest } from './middleware';
import { appEvents } from '../events';
import { LegalDocumentType, LegalAcceptanceSource, legalBackendConfig } from '../legal/config';
export const authRouter = Router();

const hostCookieOptions = {
  httpOnly: true,
  secure: process.env.USE_HTTPS === 'true',
  sameSite: 'lax' as const,
  path: '/',
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Слишком много попыток входа, пожалуйста, подождите 15 минут' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per IP per hour
  message: { error: 'Слишком много регистраций с этого IP, пожалуйста, подождите час' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.hostUser.findUnique({
      where: { email },
      include: { subscription: true, settings: true },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt,
      }
    });

    const token = jwt.sign({ userId: user.id, sessionId: session.id }, config.jwtSecret, { expiresIn: '7d' });
    
    // Set JWT in httpOnly cookie (inaccessible to JavaScript)
    res.cookie('hostToken', token, {
      ...hostCookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });
    
    // Check subscription status
    const hasActiveSubscription = user.subscription && 
      user.subscription.status === 'active' && 
      user.subscription.currentPeriodEnd > new Date();

    return res.json({
      hasActiveSubscription: !!hasActiveSubscription,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      customLogoUrl: user.settings?.customLogoUrl || null,
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
  res.clearCookie('hostToken', hostCookieOptions);
  return res.json({ success: true });
});

authRouter.post('/clear-session', (_req, res) => {
  res.clearCookie('hostToken', hostCookieOptions);
  return res.json({ success: true });
});

authRouter.put('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, email } = req.body;
    
    // Check if email is being changed and is already taken
    if (email) {
      const existingUser = await prisma.hostUser.findUnique({ where: { email } });
      if (existingUser && existingUser.id !== req.userId!) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    const updatedUser = await prisma.hostUser.update({
      where: { id: req.userId! },
      data: { 
        name: name !== undefined ? name : undefined,
        email: email !== undefined ? email : undefined 
      },
      include: { subscription: true, settings: true }
    });

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

authRouter.post('/avatar', requireAuth, (req: AuthRequest, res: any, next: any) => {
  uploadMiddleware.single('avatar')(req, res, (err: any) => {
    if (err) {
      return res.status(400).json({ error: 'Upload failed or invalid file' });
    }
    next();
  });
}, async (req: AuthRequest, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded or invalid file type' });
    }

    const filePath = req.file.path;
    const isValid = await validateFileSignature(filePath);
    
    if (!isValid) {
      import('fs').then(fs => fs.unlinkSync(filePath));
      return res.status(400).json({ error: 'Invalid file signature. File rejected.' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    const user = await prisma.hostUser.findUnique({ where: { id: req.userId! } });
    if (user?.avatarUrl) {
      deleteUploadedFile(user.avatarUrl);
    }

    const updatedUser = await prisma.hostUser.update({
      where: { id: req.userId! },
      data: { avatarUrl },
    });

    return res.json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

authRouter.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, termsAccepted, displayedTermsVersion } = req.body;
    
    if (!email || !password) {
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

    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Неверный формат email' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Пароль должен содержать минимум 8 символов' });
    }

    const existingUser = await prisma.hostUser.findUnique({ where: { email } });
    if (existingUser) {
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
          email,
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
      ...hostCookieOptions,
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
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
