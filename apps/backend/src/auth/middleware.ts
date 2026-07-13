import { Request, Response, NextFunction } from 'express';
import { HostSessionAuthCode, validateHostToken } from './session';

export interface AuthRequest extends Request {
  userId?: string;
  sessionId?: string;
}

function errorForAuthCode(code: HostSessionAuthCode) {
  if (code === 'AUTH_SESSION_MISSING') return 'Session not found';
  if (code === 'AUTH_SESSION_EXPIRED') return 'Session expired';
  if (code === 'AUTH_SESSION_REVOKED') return 'Session revoked';
  return 'Invalid token';
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies?.hostToken;
  if (typeof token !== 'string' || token.length === 0) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const validation = await validateHostToken(token);
  if (!validation.valid) return res.status(401).json({ error: errorForAuthCode(validation.code) });

  req.userId = validation.identity.userId;
  req.sessionId = validation.identity.sessionId;
  next();
};
