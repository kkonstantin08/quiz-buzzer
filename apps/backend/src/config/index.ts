import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'change_me',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
};
