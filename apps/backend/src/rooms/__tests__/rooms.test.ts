import { createRoom, getRoomByCode, rooms } from '../index';
import { RoomState } from 'shared';
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('Room Management Logic', () => {
  beforeEach(() => {
    // Clear all rooms before each test
    rooms.clear();
  });

  it('should create a room with correct initial state', () => {
    const hostUserId = 'host123';
    const hostSocketId = 'socket123';
    const room = createRoom(hostUserId, hostSocketId);
    
    expect(room).toBeDefined();
    expect(room.roomId).toMatch(/^room_\d+_[A-Z0-9]{6}$/);
    expect(room.roomCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(room.hostUserId).toBe(hostUserId);
    expect(room.hostSocketId).toBe(hostSocketId);
    expect(room.participants).toEqual([]);
    expect(room.roundState).toBe(RoomState.WAITING);
    expect(room.firstBuzzerId).toBeNull();

    // Ensure it was added to the Map
    expect(rooms.get(room.roomId)).toBe(room);
  });

  it('should retrieve a room by its code', () => {
    const hostId = 'host_456';
    const socketId = 'socket_456';
    const createdRoom = createRoom(hostId, socketId);
    
    const retrievedRoom = getRoomByCode(createdRoom.roomCode);
    expect(retrievedRoom).toBeDefined();
    expect(retrievedRoom?.roomId).toBe(createdRoom.roomId);
  });

  it('should return undefined for a non-existent room code', () => {
    const retrievedRoom = getRoomByCode('INVALID');
    expect(retrievedRoom).toBeUndefined();
  });
});
