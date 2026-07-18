import { Router } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../auth/middleware';
import { InvalidUploadError, receiveUpload, saveUploadedFile, deleteUploadedFile } from '../utils/upload';

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
    const { soundEnabled, soundTheme, bgTheme } = req.body;

    const dataToUpdate: any = {};
    if (typeof soundEnabled === 'boolean') dataToUpdate.soundEnabled = soundEnabled;
    if (typeof soundTheme === 'string') dataToUpdate.soundTheme = soundTheme;
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

async function updateImage(
  req: AuthRequest,
  res: any,
  field: 'customLogoUrl' | 'customBgUrl',
) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const uploaded = await saveUploadedFile(req.file, async (url) => {
      const current = await prisma.hostSettings.findUnique({ where: { hostUserId: req.userId! } });
      const settings = current
        ? await prisma.hostSettings.update({ where: { hostUserId: req.userId! }, data: { [field]: url } })
        : await prisma.hostSettings.create({ data: { hostUserId: req.userId!, [field]: url } });
      return { previousUrl: current?.[field], result: settings };
    });

    return res.json({ [field]: uploaded.result[field] });
  } catch (error) {
    if (error instanceof InvalidUploadError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function clearImage(req: AuthRequest, res: any, field: 'customLogoUrl' | 'customBgUrl') {
  try {
    const current = await prisma.hostSettings.findUnique({ where: { hostUserId: req.userId! } });
    const settings = current
      ? await prisma.hostSettings.update({ where: { hostUserId: req.userId! }, data: { [field]: null } })
      : await prisma.hostSettings.create({ data: { hostUserId: req.userId! } });
    try {
      await deleteUploadedFile(current?.[field]);
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
    return res.json({ [field]: settings[field] });
  } catch (error) {
    console.error('Image delete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

settingsRouter.post('/upload-logo', receiveUpload('logo'), (req: AuthRequest, res: any) => updateImage(req, res, 'customLogoUrl'));
settingsRouter.post('/upload-bg', receiveUpload('background'), (req: AuthRequest, res: any) => updateImage(req, res, 'customBgUrl'));
settingsRouter.delete('/logo', (req: AuthRequest, res: any) => clearImage(req, res, 'customLogoUrl'));
settingsRouter.delete('/background', (req: AuthRequest, res: any) => clearImage(req, res, 'customBgUrl'));
