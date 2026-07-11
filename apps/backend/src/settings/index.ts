import { Router } from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { prisma } from '../prisma';
import { config } from '../config';

export const settingsRouter = Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const prefix = file.fieldname === 'background' ? 'bg-' : 'logo-';
    cb(null, prefix + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

import { requireAuth, AuthRequest } from '../auth/middleware';

settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req: AuthRequest, res: any) => {
  try {
    let settings = await prisma.hostSettings.findUnique({
      where: { hostUserId: req.userId! },
    });

    if (!settings) {
      settings = await prisma.hostSettings.create({
        data: {
          hostUserId: req.userId!,
        },
      });
    }

    return res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

settingsRouter.patch('/', async (req: AuthRequest, res: any) => {
  try {
    const { soundEnabled, soundTheme, customLogoUrl, customBgUrl, bgTheme } = req.body;

    const dataToUpdate: any = {};
    if (typeof soundEnabled === 'boolean') dataToUpdate.soundEnabled = soundEnabled;
    if (typeof soundTheme === 'string') dataToUpdate.soundTheme = soundTheme;
    if (typeof customLogoUrl !== 'undefined') dataToUpdate.customLogoUrl = customLogoUrl; // allow null
    if (typeof customBgUrl !== 'undefined') dataToUpdate.customBgUrl = customBgUrl; // allow null
    if (typeof bgTheme === 'string') dataToUpdate.bgTheme = bgTheme;

    let settings = await prisma.hostSettings.findUnique({
      where: { hostUserId: req.userId! },
    });

    if (!settings) {
      settings = await prisma.hostSettings.create({
        data: {
          hostUserId: req.userId!,
          ...dataToUpdate,
        },
      });
    } else {
      settings = await prisma.hostSettings.update({
        where: { hostUserId: req.userId! },
        data: dataToUpdate,
      });
    }

    return res.json(settings);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

settingsRouter.post('/upload-logo', (req: AuthRequest, res: any, next: any) => {
  upload.single('logo')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой. Максимальный размер 5 МБ.' });
      }
      return res.status(400).json({ error: `Ошибка загрузки: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: AuthRequest, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify file signature (magic bytes) — MIME from headers can be spoofed
    // file-type v22 is ESM-only: use dynamic import
    const { fileTypeFromFile } = await import('file-type');
    const fileType = await fileTypeFromFile(req.file.path);
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!fileType || !allowedMimes.includes(fileType.mime)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid file signature. Only JPEG, PNG, WebP and GIF are allowed.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    return res.json({ url: fileUrl });
  } catch (error: any) {
    console.error('Upload error:', error);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

settingsRouter.post('/upload-bg', (req: AuthRequest, res: any, next: any) => {
  upload.single('background')(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Файл слишком большой. Максимальный размер 5 МБ.' });
      }
      return res.status(400).json({ error: `Ошибка загрузки: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req: AuthRequest, res: any) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify file signature (magic bytes)
    const { fileTypeFromFile } = await import('file-type');
    const fileType = await fileTypeFromFile(req.file.path);
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!fileType || !allowedMimes.includes(fileType.mime)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid file signature. Only JPEG, PNG, WebP and GIF are allowed.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    return res.json({ url: fileUrl });
  } catch (error: any) {
    console.error('Upload error:', error);
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});
