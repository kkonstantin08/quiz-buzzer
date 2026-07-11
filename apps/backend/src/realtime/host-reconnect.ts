import { Socket, Server } from 'socket.io';
import { RoomData, RoomState } from 'shared';
import { rooms, socketToRoom } from '../rooms';
import { CustomSocketData } from './index';

// Maps roomId to the NodeJS Timeout
export const hostDisconnectTimers = new Map<string, NodeJS.Timeout>();

export function reattachHostToRoom(
  socket: Socket<any, any, any, CustomSocketData>,
  room: RoomData,
  io: Server
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
  socket.data.userId = room.hostUserId;
  socketToRoom.set(socket.id, room.roomId);
  socket.join(room.roomId);

  // Notify everyone in the room that the host has reconnected
  io.to(room.roomId).emit('HOST_RECONNECTED');
}

export function revokePreviousHostControl(room: RoomData, io: Server) {
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

export function startHostReconnectTimeout(roomId: string, io: Server) {
  // Cancel any existing timer to avoid duplicate schedules
  cancelHostReconnectTimeout(roomId);

  const room = rooms.get(roomId);
  if (room) {
    room.isHostConnected = false;
  }

  // Notify participants that host is disconnected
  io.to(roomId).emit('HOST_DISCONNECTED');

  const timeoutMs = 10 * 60 * 1000; // 10 minutes

  const timer = reconnectTimeoutLoader.setTimeout(() => {
    closeRoomAfterHostTimeout(roomId, io);
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

export function closeRoomAfterHostTimeout(roomId: string, io: Server) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Set the room state to finished
  room.roundState = RoomState.FINISHED;

  // Notify participants
  io.to(roomId).emit('ROOM_CLOSED', 'ведущий не вернулся');

  // Clean up references and mappings
  rooms.delete(roomId);
  
  // Clean up all socket mapping for sockets in this room
  for (const [sId, rId] of socketToRoom.entries()) {
    if (rId === roomId) {
      socketToRoom.delete(sId);
      const s = io.sockets.sockets.get(sId);
      if (s) {
        s.leave(roomId);
      }
    }
  }

  cancelHostReconnectTimeout(roomId);
}
