import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from 'shared';

const BASE_URL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3001`)
  : (import.meta.env.VITE_APP_PUBLIC_URL || '/');
const cleanBaseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
const SERVER_URL = cleanBaseUrl.endsWith('/api') ? cleanBaseUrl.slice(0, -4) : cleanBaseUrl;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
  withCredentials: true, // send httpOnly cookie during handshake
});
