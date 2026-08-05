import { Request } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';

const LAST_SEEN_INTERVAL_MS = 5 * 60 * 1000;

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

export function sessionMetadata(req: Request) {
  const ipAddress = req.ip || req.socket.remoteAddress;
  const userAgent = req.get('user-agent');
  return {
    ipAddress: ipAddress ? ipAddress.slice(0, 64) : null,
    userAgent: userAgent ? userAgent.slice(0, 512) : null,
    lastSeenAt: new Date(),
  };
}

export const hostCookieOptions = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax' as const,
  path: '/',
});

export function describeUserAgent(value: string | null) {
  if (!value) return { device: 'Неизвестное устройство', browser: 'Неизвестный браузер' };

  const device = value.includes('iPad') ? 'iPad'
    : value.includes('iPhone') ? 'iPhone'
      : value.includes('Android') ? 'Android'
        : value.includes('Windows') ? 'Windows'
          : value.includes('Macintosh') ? 'macOS'
            : value.includes('Linux') ? 'Linux'
              : 'Неизвестное устройство';
  const browser = /Edg(?:A|iOS)?\//.test(value) ? 'Edge'
    : /OPR\//.test(value) ? 'Opera'
      : /YaBrowser\//.test(value) ? 'Яндекс Браузер'
        : /(?:Chrome|CriOS)\//.test(value) ? 'Chrome'
          : /(?:Firefox|FxiOS)\//.test(value) ? 'Firefox'
            : /Safari\//.test(value) ? 'Safari'
              : 'Неизвестный браузер';
  return { device, browser };
}

export async function validateHostSession(identity: HostSessionIdentity): Promise<HostSessionValidation> {
  const session = await prisma.session.findUnique({ where: { id: identity.sessionId } });
  if (!session) return { valid: false, code: 'AUTH_SESSION_MISSING' };
  if (session.userId !== identity.userId) return { valid: false, code: 'AUTH_SESSION_INVALID' };
  const now = new Date();
  if (session.expiresAt <= now) return { valid: false, code: 'AUTH_SESSION_EXPIRED' };
  if (session.revokedAt !== null) return { valid: false, code: 'AUTH_SESSION_REVOKED' };

  const cutoff = new Date(now.getTime() - LAST_SEEN_INTERVAL_MS);
  if (!session.lastSeenAt || session.lastSeenAt <= cutoff) {
    await prisma.session.updateMany({
      where: {
        id: identity.sessionId,
        userId: identity.userId,
        revokedAt: null,
        expiresAt: { gt: now },
        OR: [{ lastSeenAt: null }, { lastSeenAt: { lte: cutoff } }],
      },
      data: { lastSeenAt: now },
    });
  }

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
