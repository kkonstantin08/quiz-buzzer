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
import { roomsRouter } from './rooms/api';
import { setupSocketIO } from './realtime';
import { ClientToServerEvents, ServerToClientEvents } from 'shared';

const app = express();
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

// Serve static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

setupSocketIO(io);

if (process.env.NODE_ENV !== 'test') {
  server.listen(Number(config.port), '0.0.0.0', () => {
    console.log(`Backend server listening on port ${config.port}`);
  });
}

export { app, server, io };
