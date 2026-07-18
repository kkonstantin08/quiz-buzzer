import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { authRouter } from './auth';
import { billingRouter } from './billing';
import { settingsRouter } from './settings';
import { historyRouter } from './history';
import { checkBillingReadiness } from './billing/readiness';
import { roomsRouter } from './rooms/api';
import { legalRouter } from './legal';
import { setupSocketIO } from './realtime';
import { ClientToServerEvents, ServerToClientEvents } from 'shared';

import { prisma } from './prisma';

const app = express();
app.set('trust proxy', config.trustProxy);
const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Security headers
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));

// Rate limiting for API routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/billing', billingRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/history', historyRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/legal', legalRouter);

import { ensureUploadDirExists } from './utils/upload';

app.use('/uploads', (req, res, next) => {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(req.path.slice(1))) {
    return res.sendStatus(404);
  }
  return next();
}, express.static(config.uploadDir, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
}));

app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', error: 'Database connection failed' });
  }
});

setupSocketIO(io);

if (process.env.NODE_ENV !== 'test') {
  if (config.paymentsEnabled) {
    const readiness = checkBillingReadiness(process.env);
    if (!readiness.ready) {
      console.error('CRITICAL: PAYMENTS_ENABLED=true, но инфраструктура не готова.');
      console.error('Причины:', readiness.reasons);
      process.exit(1);
    }
  }

  ensureUploadDirExists();
  server.listen(Number(config.port), '0.0.0.0', () => {
    console.log(`Backend server listening on port ${config.port}`);
  });
}

export { app, server, io };
