import { RoomData, RoomState } from 'shared';
import crypto from 'crypto';

export const rooms = new Map<string, RoomData>();
export const socketToRoom = new Map<string, string>();

// Track in-use room codes to guarantee uniqueness
export const usedRoomCodes = new Set<string>();

export function createRoom(
  hostUserId: string,
  hostSocketId: string,
  customLogoUrl?: string | null,
  customBgUrl?: string | null,
  bgTheme?: string
): RoomData {
  // Generate a unique 6-char hex room code, retrying on collision
  let roomCode: string;
  let attempts = 0;
  do {
    roomCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    attempts++;
    if (attempts > 100) {
      throw new Error('Unable to generate unique room code after 100 attempts');
    }
  } while (usedRoomCodes.has(roomCode));

  usedRoomCodes.add(roomCode);
  const roomId = `room_${Date.now()}_${roomCode}`;

  const newRoom: RoomData = {
    roomId,
    roomCode,
    hostUserId,
    hostSocketId,
    participants: [],
    roundState: RoomState.WAITING,
    firstBuzzerId: null,
    createdAt: Date.now(),
    customLogoUrl: customLogoUrl || null,
    customBgUrl: customBgUrl || null,
    bgTheme: bgTheme || 'light',
    isHostConnected: true,
    historySaved: false,
  };

  rooms.set(roomId, newRoom);
  return newRoom;
}

export function getRoomByCode(roomCode: string): RoomData | undefined {
  for (const room of rooms.values()) {
    if (room.roomCode === roomCode) {
      return room;
    }
  }
  return undefined;
}

/**
 * Idempotent room deletion. Returns false if room was already deleted.
 * Clears all mappings; buzz buffers and lifecycle timers must be passed in for cleanup.
 */
export function deleteRoom(
  roomId: string,
  reason: string,
  io?: import('socket.io').Server,
  buzzBuffers?: Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
  extraTimers?: Map<string, NodeJS.Timeout>[],
  participantDisconnectTimers?: Map<string, NodeJS.Timeout>
): boolean {
  const room = rooms.get(roomId);
  if (!room) return false; // Already deleted — idempotent

  // Notify connected users about the reason
  if (io) {
    io.to(roomId).emit('ROOM_CLOSED', { reason });
  }

  // Clear buzz buffer timer for this room
  if (buzzBuffers) {
    const buf = buzzBuffers.get(roomId);
    if (buf) {
      clearTimeout(buf.timer);
      buzzBuffers.delete(roomId);
    }
  }

  // Clear any extra timer maps (e.g. hostDisconnectTimers, postFinishTimers, maxLifetimeTimers)
  if (extraTimers) {
    for (const timerMap of extraTimers) {
      const t = timerMap.get(roomId);
      if (t) {
        clearTimeout(t);
        timerMap.delete(roomId);
      }
    }
  }

  // Clear participant disconnect timers
  if (participantDisconnectTimers) {
    for (const p of room.participants) {
      const timerKey = `${roomId}_${p.id}`;
      const t = participantDisconnectTimers.get(timerKey);
      if (t) {
        clearTimeout(t);
        participantDisconnectTimers.delete(timerKey);
      }
    }
  }

  // Remove room code from uniqueness set
  usedRoomCodes.delete(room.roomCode);

  // Remove from main rooms map
  rooms.delete(roomId);

  // Clean up all socket-to-room mappings for sockets in this room
  for (const [sId, rId] of socketToRoom.entries()) {
    if (rId === roomId) {
      socketToRoom.delete(sId);
      if (io) {
        const s = io.sockets.sockets.get(sId);
        if (s) s.leave(roomId);
      }
    }
  }

  return true;
}
