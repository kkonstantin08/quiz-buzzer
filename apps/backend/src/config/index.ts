import dotenv from 'dotenv';
import { isIP } from 'net';
import path from 'path';
dotenv.config();

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('FATAL ERROR: JWT_SECRET environment variable is required in production.');
}

// In development, allow localhost and any local network IP
const defaultCors = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  /^http:\/\/10\.\d+\.\d+\.\d+:\d+$/,
  /^http:\/\/192\.168\.\d+\.\d+:\d+$/,
  /^http:\/\/198\.18\.\d+\.\d+:\d+$/,
  /^http:\/\/172\.\d+\.\d+\.\d+:\d+$/
];

type TrustProxy = false | string[];

const trustedProxyNames = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isTrustedProxyAddress(value: string) {
  if (trustedProxyNames.has(value) || isIP(value) !== 0) {
    return true;
  }

  const separator = value.lastIndexOf('/');
  if (separator <= 0) {
    return false;
  }

  const address = value.slice(0, separator);
  const prefix = Number(value.slice(separator + 1));
  const family = isIP(address);
  return Number.isInteger(prefix) && prefix > 0 && prefix <= (family === 4 ? 32 : family === 6 ? 128 : -1);
}

function parseTrustProxy(value: string | undefined): TrustProxy {
  if (!value || value.trim().toLowerCase() === 'false') {
    return false;
  }

  const trustedProxies = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return trustedProxies.length > 0 && trustedProxies.every(isTrustedProxyAddress) ? trustedProxies : false;
}

function requiredString(env: NodeJS.ProcessEnv, name: string, fallback: string | undefined, production: boolean) {
  const value = env[name]?.trim() || fallback;
  if (production && !env[name]?.trim()) throw new Error(`FATAL ERROR: ${name} environment variable is required in production.`);
  return value;
}

function parsePublicUrl(value: string | undefined, production: boolean) {
  const publicUrl = requiredString({ APP_PUBLIC_URL: value }, 'APP_PUBLIC_URL', 'http://localhost:5173', production)!;
  try {
    const parsed = new URL(publicUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error('FATAL ERROR: APP_PUBLIC_URL must be an absolute HTTP(S) URL.');
  }
  return publicUrl.replace(/\/+$/, '');
}

function parseMailFrom(value: string | undefined, production: boolean) {
  const mailFrom = requiredString({ MAIL_FROM: value }, 'MAIL_FROM', 'КвизПульт <noreply@qbuz.ru>', production)!;
  if (!/^.+\s<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>$/.test(mailFrom)) {
    throw new Error('FATAL ERROR: MAIL_FROM must use the format Name <email@example.com>.');
  }
  return mailFrom;
}

function parsePasswordResetTtl(value: string | undefined) {
  const ttl = Number(value ?? 30);
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 1440) {
    throw new Error('FATAL ERROR: PASSWORD_RESET_TOKEN_TTL_MINUTES must be an integer between 1 and 1440.');
  }
  return ttl;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const cookieSecure = env.COOKIE_SECURE === undefined
    ? env.USE_HTTPS === 'true'
    : env.COOKIE_SECURE === 'true';

  return {
    port: env.PORT || 3001,
    jwtSecret: env.JWT_SECRET || 'change_me_only_in_dev',
    corsOrigin: production
      ? (env.CORS_ORIGIN || 'http://localhost:5173')
    : defaultCors,
    uploadDir: env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
    paymentsEnabled: env.PAYMENTS_ENABLED === 'true',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    cookieSecure,
    resendApiKey: requiredString(env, 'RESEND_API_KEY', undefined, production),
    mailFrom: parseMailFrom(env.MAIL_FROM, production),
    appPublicUrl: parsePublicUrl(env.APP_PUBLIC_URL, production),
    passwordResetTokenTtlMinutes: parsePasswordResetTtl(env.PASSWORD_RESET_TOKEN_TTL_MINUTES),
  };
}

export const config = loadConfig();
