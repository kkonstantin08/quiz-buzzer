import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

export type HostSessionAuthCode =
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_SESSION_MISSING'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_SESSION_INVALID';

type HostSessionIdentity = {
  userId: string;
  sessionId: string;
};

type HostSessionValidation =
  | { valid: true; identity: HostSessionIdentity }
  | { valid: false; code: HostSessionAuthCode };

function hasHostSessionClaims(decoded: string | jwt.JwtPayload): decoded is jwt.JwtPayload & HostSessionIdentity {
  return typeof decoded !== 'string'
    && typeof decoded.userId === 'string'
    && decoded.userId.length > 0
    && typeof decoded.sessionId === 'string'
    && decoded.sessionId.length > 0;
}

export async function validateHostSession(identity: HostSessionIdentity): Promise<HostSessionValidation> {
  const session = await prisma.session.findUnique({ where: { id: identity.sessionId } });
  if (!session) return { valid: false, code: 'AUTH_SESSION_MISSING' };
  if (session.userId !== identity.userId) return { valid: false, code: 'AUTH_SESSION_INVALID' };
  if (session.expiresAt <= new Date()) return { valid: false, code: 'AUTH_SESSION_EXPIRED' };
  if (session.revokedAt !== null) return { valid: false, code: 'AUTH_SESSION_REVOKED' };

  return { valid: true, identity };
}

export async function validateHostToken(token: string): Promise<HostSessionValidation> {
  let decoded: string | jwt.JwtPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret);
  } catch {
    return { valid: false, code: 'AUTH_TOKEN_INVALID' };
  }

  if (!hasHostSessionClaims(decoded)) return { valid: false, code: 'AUTH_SESSION_INVALID' };
  return validateHostSession({ userId: decoded.userId, sessionId: decoded.sessionId });
}
