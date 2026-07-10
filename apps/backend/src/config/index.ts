import dotenv from 'dotenv';
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

export const config = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'change_me_only_in_dev',
  corsOrigin: process.env.NODE_ENV === 'production' 
    ? (process.env.CORS_ORIGIN || 'http://localhost:5173') 
    : defaultCors,
};
