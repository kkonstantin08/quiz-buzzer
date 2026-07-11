import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export interface AuthRequest extends Request {
  userId?: string;
  sessionId?: string;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  let token = req.cookies?.hostToken;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token provided' });
    token = authHeader.split(' ')[1];
  }
  
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { userId: string; sessionId?: string };
    
    if (decoded.sessionId) {
      const session = await prisma.session.findUnique({ where: { id: decoded.sessionId } });
      if (!session) {
        return res.status(401).json({ error: 'Session not found' });
      }
      if (session.userId !== decoded.userId) {
        return res.status(401).json({ error: 'Session invalid' });
      }
      if (session.expiresAt < new Date()) {
        return res.status(401).json({ error: 'Session expired' });
      }
      if (session.revokedAt) {
        return res.status(401).json({ error: 'Session revoked' });
      }
    }
    
    req.userId = decoded.userId;
    req.sessionId = decoded.sessionId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
