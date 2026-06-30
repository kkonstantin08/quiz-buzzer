import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config';
import { authRouter } from './auth';
import { setupSocketIO } from './realtime';
import { ClientToServerEvents, ServerToClientEvents } from 'shared';

const app = express();
const server = http.createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json());

app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

setupSocketIO(io);

server.listen(config.port, () => {
  console.log(`Backend server listening on port ${config.port}`);
});
