import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { uploadMiddleware, validateFileSignature, deleteUploadedFile } from '../utils/upload';
import multer from 'multer';
import fs from 'fs';

export const settingsRouter = Router();

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
    if (typeof customLogoUrl !== 'undefined') dataToUpdate.customLogoUrl = customLogoUrl;
    if (typeof customBgUrl !== 'undefined') dataToUpdate.customBgUrl = customBgUrl;
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
      // Check if we need to delete old files
      if (typeof customLogoUrl !== 'undefined' && customLogoUrl !== settings.customLogoUrl) {
        deleteUploadedFile(settings.customLogoUrl);
      }
      if (typeof customBgUrl !== 'undefined' && customBgUrl !== settings.customBgUrl) {
        deleteUploadedFile(settings.customBgUrl);
      }

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
  uploadMiddleware.single('logo')(req, res, (err: any) => {
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

    const isValid = await validateFileSignature(req.file.path);
    if (!isValid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid file signature. Only JPEG, PNG, WebP are allowed.' });
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
  uploadMiddleware.single('background')(req, res, (err: any) => {
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

    const isValid = await validateFileSignature(req.file.path);
    if (!isValid) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Invalid file signature. Only JPEG, PNG, WebP are allowed.' });
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
