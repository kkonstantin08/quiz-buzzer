import { io, Socket } from 'socket.io-client';
import { ClientToServerEvents, ServerToClientEvents } from 'shared';

const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
});
