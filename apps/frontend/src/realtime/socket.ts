import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from 'shared';

const isDev = import.meta.env.DEV;
const BASE_URL = isDev ? `http://${window.location.hostname}:3001` : '/';
const cleanBaseUrl = BASE_URL.endsWith('/') ? BASE_URL.slice(0, -1) : BASE_URL;
const SERVER_URL = cleanBaseUrl.endsWith('/api') ? cleanBaseUrl.slice(0, -4) : cleanBaseUrl;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(SERVER_URL, {
  autoConnect: false,
  withCredentials: true, // send httpOnly cookie during handshake
});
