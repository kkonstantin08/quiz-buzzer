import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export const settingsRouter = Router();

// Middleware to verify token and extract user
const requireAuth = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

settingsRouter.use(requireAuth);

settingsRouter.get('/', async (req: any, res: any) => {
  try {
    let settings = await prisma.hostSettings.findUnique({
      where: { hostUserId: req.userId },
    });

    if (!settings) {
      settings = await prisma.hostSettings.create({
        data: {
          hostUserId: req.userId,
        },
      });
    }

    return res.json(settings);
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

settingsRouter.patch('/', async (req: any, res: any) => {
  try {
    const { soundEnabled, soundTheme, customLogoUrl } = req.body;

    const dataToUpdate: any = {};
    if (typeof soundEnabled === 'boolean') dataToUpdate.soundEnabled = soundEnabled;
    if (typeof soundTheme === 'string') dataToUpdate.soundTheme = soundTheme;
    if (typeof customLogoUrl !== 'undefined') dataToUpdate.customLogoUrl = customLogoUrl; // allow null

    let settings = await prisma.hostSettings.findUnique({
      where: { hostUserId: req.userId },
    });

    if (!settings) {
      settings = await prisma.hostSettings.create({
        data: {
          hostUserId: req.userId,
          ...dataToUpdate,
        },
      });
    } else {
      settings = await prisma.hostSettings.update({
        where: { hostUserId: req.userId },
        data: dataToUpdate,
      });
    }

    return res.json(settings);
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
