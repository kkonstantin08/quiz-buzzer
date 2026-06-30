import { RoomData, RoomState, Participant } from 'shared';

export const rooms = new Map<string, RoomData>();
export const socketToRoom = new Map<string, string>();

export function createRoom(hostUserId: string): RoomData {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const roomId = `room_${Date.now()}_${roomCode}`;
  
  const newRoom: RoomData = {
    roomId,
    roomCode,
    hostUserId,
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
