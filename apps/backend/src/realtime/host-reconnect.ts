import { DefaultEventsMap, Socket, Server } from 'socket.io';
import { ClientToServerEvents, InternalRoomData, RoomState, ServerToClientEvents } from 'shared';
import { rooms, socketToRoom, deleteRoom } from '../rooms';
import { CustomSocketData } from './index';
import { postFinishTimers, maxLifetimeTimers, cancelRoomLifecycleTimers } from './room-lifecycle';

// Maps roomId to the NodeJS Timeout
export const hostDisconnectTimers = new Map<string, NodeJS.Timeout>();
type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, CustomSocketData>;
type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, CustomSocketData>;

export function reattachHostToRoom(
  socket: RealtimeSocket,
  room: InternalRoomData,
  io: RealtimeServer,
) {
  // Cancel disconnect timer if active
  cancelHostReconnectTimeout(room.roomId);

  // If a different socket is currently registered as the host, revoke its rights
  if (room.hostSocketId && room.hostSocketId !== socket.id) {
    revokePreviousHostControl(room, io);
  }

  // Bind the new socket to the room
  room.hostSocketId = socket.id;
  room.isHostConnected = true;
  socket.data.role = 'host';
  socketToRoom.set(socket.id, room.roomId);
  socket.join(room.roomId);
}

export function revokePreviousHostControl(room: InternalRoomData, io: RealtimeServer) {
  const previousSocketId = room.hostSocketId;
  if (!previousSocketId) return;

  // Emit event to the old socket so the frontend can lock control
  io.to(previousSocketId).emit('HOST_CONTROL_REVOKED');

  // Remove the mapping from socketToRoom
  socketToRoom.delete(previousSocketId);

  // Find the actual socket object and clear its role to prevent it from bypassing validation
  const previousSocket = io.sockets.sockets.get(previousSocketId);
  if (previousSocket) {
    previousSocket.data.role = undefined;
    previousSocket.leave(room.roomId);
  }
}

export const reconnectTimeoutLoader = {
  setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms)
};

export function startHostReconnectTimeout(
  roomId: string,
  io: Server,
  buzzBuffers?: Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
  extraTimers?: Map<string, NodeJS.Timeout>[]
) {
  // Cancel any existing timer to avoid duplicate schedules
  cancelHostReconnectTimeout(roomId);

  const room = rooms.get(roomId);
  if (room) {
    room.isHostConnected = false;
  }

  const timeoutMs = 10 * 60 * 1000; // 10 minutes

  const timer = reconnectTimeoutLoader.setTimeout(() => {
    closeRoomAfterHostTimeout(roomId, io, buzzBuffers, extraTimers);
  }, timeoutMs);

  hostDisconnectTimers.set(roomId, timer);
}

export function cancelHostReconnectTimeout(roomId: string) {
  const timer = hostDisconnectTimers.get(roomId);
  if (timer) {
    clearTimeout(timer);
    hostDisconnectTimers.delete(roomId);
  }
}

export function closeRoomAfterHostTimeout(
  roomId: string,
  io: Server,
  buzzBuffers?: Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
  extraTimers?: Map<string, NodeJS.Timeout>[]
) {
  cancelRoomLifecycleTimers(roomId);
  
  const allTimers = [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers];
  if (extraTimers) {
    allTimers.push(...extraTimers);
  }
  
  deleteRoom(
    roomId,
    'ведущий не вернулся',
    io,
    buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }> | undefined,
    allTimers
  );
}
