import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma';
import { config } from '../config';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: { error: 'Слишком много попыток входа, пожалуйста, подождите 15 минут' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 registrations per IP per hour
  message: { error: 'Слишком много регистраций с этого IP, пожалуйста, подождите час' },
  standardHeaders: true,
  legacyHeaders: false,
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

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });
    
    // Set JWT in httpOnly cookie (inaccessible to JavaScript)
    const isHttps = process.env.USE_HTTPS === 'true';
    res.cookie('hostToken', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
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

authRouter.get('/me', async (req: any, res) => {
  try {
    // Accept token from httpOnly cookie first, then Authorization header as fallback
    let token = req.cookies?.hostToken;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
      }
      token = authHeader.split(' ')[1];
    }
    
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    
    const user = await prisma.hostUser.findUnique({
      where: { id: decoded.userId },
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
    return res.status(401).json({ error: 'Invalid token' });
  }
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie('hostToken', { httpOnly: true, sameSite: 'strict' });
  return res.json({ success: true });
});

authRouter.put('/me', async (req: any, res) => {
  try {
    // Accept token from httpOnly cookie first, then Authorization header as fallback
    let token = req.cookies?.hostToken;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
      }
      token = authHeader.split(' ')[1];
    }
    
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    
    const { name, email } = req.body;
    
    // Check if email is being changed and is already taken
    if (email) {
      const existingUser = await prisma.hostUser.findUnique({ where: { email } });
      if (existingUser && existingUser.id !== decoded.userId) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    const updatedUser = await prisma.hostUser.update({
      where: { id: decoded.userId },
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
    return res.status(401).json({ error: 'Invalid token or update failed' });
  }
});

authRouter.post('/avatar', upload.single('avatar'), async (req: any, res) => {
  try {
    // Accept token from httpOnly cookie first, then Authorization header as fallback
    let token = req.cookies?.hostToken;
    if (!token) {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
      }
      token = authHeader.split(' ')[1];
    }
    
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded or invalid file type' });
    }

    const filePath = req.file.path;
    // file-type v22 is ESM-only: use dynamic import
    const { fileTypeFromFile } = await import('file-type');
    const fileType = await fileTypeFromFile(filePath);
    
    if (!fileType || !['image/jpeg', 'image/png', 'image/webp'].includes(fileType.mime)) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Invalid file signature. File rejected.' });
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    const updatedUser = await prisma.hostUser.update({
      where: { id: decoded.userId },
      data: { avatarUrl },
    });

    return res.json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    return res.status(401).json({ error: 'Upload failed' });
  }
});

authRouter.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
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
    const user = await prisma.hostUser.create({
      data: {
        email,
        passwordHash,
      },
    });

    const token = jwt.sign({ userId: user.id }, config.jwtSecret, { expiresIn: '7d' });

    // Set JWT in httpOnly cookie (inaccessible to JavaScript)
    const isHttps = process.env.USE_HTTPS === 'true';
    res.cookie('hostToken', token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
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
