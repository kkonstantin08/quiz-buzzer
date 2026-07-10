import { Router } from 'express';
import { getRoomByCode } from './index';

export const roomsRouter = Router();

roomsRouter.get('/info/:code', (req, res) => {
  const roomCode = req.params.code.toUpperCase();
  const room = getRoomByCode(roomCode);
  
  if (!room) {
    return res.status(404).json({ error: 'Комната не найдена' });
  }

  return res.json({
    customLogoUrl: room.customLogoUrl || null,
  });
});
