import { RoomData, RoomState, Participant } from 'shared';
import crypto from 'crypto';

export const rooms = new Map<string, RoomData>();
export const socketToRoom = new Map<string, string>();

export function createRoom(hostUserId: string, hostSocketId: string): RoomData {
  const roomCode = crypto.randomBytes(3).toString('hex').toUpperCase(); // 6 chars, cryptographically secure
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
