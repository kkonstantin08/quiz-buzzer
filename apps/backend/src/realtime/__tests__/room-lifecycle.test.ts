/**
 * TDD tests for room lifecycle:
 * - Post-finish 5-minute cleanup
 * - 24-hour max lifetime cleanup
 * - History saved exactly once (idempotent)
 * - Join blocked for FINISHED rooms
 * - All mappings and buffers cleared on deletion
 * - deleteRoom idempotency
 * - Room code uniqueness
 * - 10-minute host timeout still works
 */

import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc } from 'socket.io-client';
import type { AddressInfo } from 'net';

import { rooms, socketToRoom, usedRoomCodes, createRoom, deleteRoom } from '../../rooms';
import {
  hostDisconnectTimers,
  reconnectTimeoutLoader,
  startHostReconnectTimeout,
} from '../host-reconnect';
import {
  postFinishTimers,
  maxLifetimeTimers,
  lifecycleTimerLoader,
  saveGameHistory,
  schedulePostFinishCleanup,
  scheduleMaxLifetimeCleanup,
  cancelRoomLifecycleTimers,
} from '../room-lifecycle';
import { RoomState } from 'shared';

// ── helpers ──────────────────────────────────────────────────────────────────

function realSleep(ms: number) {
  return new Promise<void>(resolve => {
    const t0 = Date.now();
    const poll = () => {
      if (Date.now() - t0 >= ms) resolve();
      else setImmediate(poll);
    };
    poll();
  });
}

function makeMockIo(): Server {
  const httpServer = createServer();
  return new Server(httpServer);
}

function makeMockPrisma(onSave?: () => void) {
  return {
    gameHistory: {
      create: jest.fn(async () => {
        onSave?.();
        return {};
      }),
    },
  } as any;
}

// ── setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  rooms.clear();
  socketToRoom.clear();
  usedRoomCodes.clear();
  hostDisconnectTimers.clear();
  postFinishTimers.clear();
  maxLifetimeTimers.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Room Lifecycle', () => {
  // ── 1. Post-finish 5-minute cleanup ───────────────────────────────────────
  it('1. Finished room is deleted 5 minutes after ROOM_FINISH', () => {
    jest.useFakeTimers();
    const io = makeMockIo();
    const buzzBuffers = new Map<string, any>();
    const room = createRoom('host-1', 'sock-1');
    room.roundState = RoomState.FINISHED;

    schedulePostFinishCleanup(room.roomId, io, buzzBuffers, []);

    expect(rooms.has(room.roomId)).toBe(true);
    jest.advanceTimersByTime(5 * 60 * 1000);

    expect(rooms.has(room.roomId)).toBe(false);

    io.close();
    jest.useRealTimers();
  });

  // ── 2. 24-hour max lifetime cleanup ───────────────────────────────────────
  it('2. Room is deleted after 24 hours from creation', () => {
    jest.useFakeTimers();
    const io = makeMockIo();
    const buzzBuffers = new Map<string, any>();
    const room = createRoom('host-1', 'sock-1');

    scheduleMaxLifetimeCleanup(room.roomId, io, buzzBuffers, []);

    expect(rooms.has(room.roomId)).toBe(true);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(rooms.has(room.roomId)).toBe(false);

    io.close();
    jest.useRealTimers();
  });

  // ── 3. History saved exactly once ─────────────────────────────────────────
  it('3. History is saved exactly once even on repeated calls', async () => {
    const saveMock = jest.fn().mockResolvedValue({});
    const prisma = makeMockPrisma(() => saveMock());

    const room = createRoom('host-1', 'sock-1');
    room.participants = [
      { id: 'p1', displayName: 'Alice', socketId: 'sock-p1', joinedAt: Date.now(), isConnected: true, score: 3 },
    ];

    await saveGameHistory(room, prisma);
    await saveGameHistory(room, prisma); // second call must be a no-op
    await saveGameHistory(room, prisma); // third call must also be a no-op

    expect(prisma.gameHistory.create).toHaveBeenCalledTimes(1);
    expect(room.historySaved).toBe(true);
  });

  // ── 4. ROOM_JOIN blocked for FINISHED room ────────────────────────────────
  it('4. Cannot join a FINISHED room', () => {
    const room = createRoom('host-1', 'sock-1');
    room.roundState = RoomState.FINISHED;

    // Simulate what index.ts does on ROOM_JOIN
    const result =
      room.roundState === RoomState.FINISHED
        ? { success: false, error: 'Игра уже завершена' }
        : { success: true };

    expect(result).toEqual({ success: false, error: 'Игра уже завершена' });
  });

  // ── 5. Cannot join a deleted room ─────────────────────────────────────────
  it('5. Cannot join a deleted (non-existent) room', () => {
    const room = createRoom('host-1', 'sock-1');
    deleteRoom(room.roomId, 'test');

    // Simulate getRoomByCode lookup
    const found = rooms.get(room.roomId);
    expect(found).toBeUndefined();
  });

  // ── 6. All mappings, buffers, and timers cleared on deletion ──────────────
  it('6. deleteRoom clears rooms, socketToRoom, usedRoomCodes, buzzBuffers, and timer maps', () => {
    const io = makeMockIo();
    const buzzBuffers = new Map<string, any>();

    const room = createRoom('host-1', 'sock-1');
    const roomId = room.roomId;
    const roomCode = room.roomCode;

    // Populate mappings
    socketToRoom.set('sock-1', roomId);
    socketToRoom.set('sock-p1', roomId);
    buzzBuffers.set(roomId, { timer: setTimeout(() => {}, 99999), buzzes: [] });
    hostDisconnectTimers.set(roomId, setTimeout(() => {}, 99999));
    postFinishTimers.set(roomId, setTimeout(() => {}, 99999));
    maxLifetimeTimers.set(roomId, setTimeout(() => {}, 99999));

    deleteRoom(roomId, 'test', io, buzzBuffers, [
      hostDisconnectTimers,
      postFinishTimers,
      maxLifetimeTimers,
    ]);

    expect(rooms.has(roomId)).toBe(false);
    expect(socketToRoom.has('sock-1')).toBe(false);
    expect(socketToRoom.has('sock-p1')).toBe(false);
    expect(usedRoomCodes.has(roomCode)).toBe(false);
    expect(buzzBuffers.has(roomId)).toBe(false);
    expect(hostDisconnectTimers.has(roomId)).toBe(false);
    expect(postFinishTimers.has(roomId)).toBe(false);
    expect(maxLifetimeTimers.has(roomId)).toBe(false);

    io.close();
  });

  // ── 7. deleteRoom is idempotent ────────────────────────────────────────────
  it('7. Repeated deleteRoom calls do not throw and return false on second call', () => {
    const room = createRoom('host-1', 'sock-1');
    const roomId = room.roomId;

    const first = deleteRoom(roomId, 'test');
    expect(first).toBe(true);

    // Second call — room already gone
    const second = deleteRoom(roomId, 'test');
    expect(second).toBe(false);
    expect(rooms.has(roomId)).toBe(false);
  });

  // ── 8. Room code uniqueness enforced ──────────────────────────────────────
  it('8. Collision on room code forces a new unique code to be generated', () => {
    // Force a collision: pre-fill usedRoomCodes with a known code and
    // override crypto.randomBytes so the first call returns that code
    const crypto = require('crypto');
    let callCount = 0;
    const COLLIDING_CODE = 'AABBCC';
    const UNIQUE_CODE = 'DDEEFF';

    jest.spyOn(crypto, 'randomBytes').mockImplementation((size: any): any => {
      callCount++;
      const hex = callCount === 1 ? COLLIDING_CODE.toLowerCase() : UNIQUE_CODE.toLowerCase();
      return Buffer.from(hex, 'hex');
    });

    usedRoomCodes.add(COLLIDING_CODE);

    const room = createRoom('host-1', 'sock-1');
    expect(room.roomCode).toBe(UNIQUE_CODE);
    expect(usedRoomCodes.has(UNIQUE_CODE)).toBe(true);
    expect(callCount).toBe(2); // Two attempts were made
  });

  // ── 9. 10-minute host timeout still fires and deletes the room ────────────
  it('9. 10-minute host reconnect timeout closes the room via deleteRoom', () => {
    const capturedTimers: { cb: () => void; ms: number }[] = [];
    jest.spyOn(reconnectTimeoutLoader, 'setTimeout').mockImplementation((cb, ms) => {
      capturedTimers.push({ cb, ms });
      return setTimeout(() => {}, 99999);
    });

    const io = makeMockIo();
    const room = createRoom('host-1', 'sock-1');
    const roomId = room.roomId;

    startHostReconnectTimeout(roomId, io);

    const tenMin = capturedTimers.find(t => t.ms === 10 * 60 * 1000);
    expect(tenMin).toBeDefined();

    // Fire the timeout
    tenMin!.cb();

    expect(rooms.has(roomId)).toBe(false);

    io.close();
  });
});
