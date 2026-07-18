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

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const cookieSecure = env.COOKIE_SECURE === undefined
    ? env.USE_HTTPS === 'true'
    : env.COOKIE_SECURE === 'true';

  return {
    port: env.PORT || 3001,
    jwtSecret: env.JWT_SECRET || 'change_me_only_in_dev',
    corsOrigin: env.NODE_ENV === 'production'
      ? (env.CORS_ORIGIN || 'http://localhost:5173')
    : defaultCors,
    uploadDir: env.UPLOAD_DIR || path.join(__dirname, '../../uploads'),
    paymentsEnabled: env.PAYMENTS_ENABLED === 'true',
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    cookieSecure,
  };
}

export const config = loadConfig();
