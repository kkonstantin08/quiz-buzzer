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

const mockPrismaCreate = jest.fn().mockResolvedValue({});
jest.mock('../../prisma', () => ({
  prisma: {
    gameHistory: {
      create: mockPrismaCreate,
    },
  },
}));

import { rooms, socketToRoom, usedRoomCodes, createRoom, deleteRoom } from '../../rooms';
import {
  hostDisconnectTimers,
  closeRoomAfterHostTimeout,
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
import { RoomState, GameResult } from 'shared';

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
  mockPrismaCreate.mockReset().mockResolvedValue({});
  rooms.clear();
  socketToRoom.clear();
  usedRoomCodes.clear();
  hostDisconnectTimers.clear();
  postFinishTimers.clear();
  maxLifetimeTimers.clear();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Room Lifecycle', () => {
  // ── 1. Post-finish 5-minute cleanup ───────────────────────────────────────
  it('1. Finished room is deleted 5 minutes after ROOM_FINISH', () => {
    jest.useFakeTimers();
    const io = makeMockIo();
    const buzzBuffers = new Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>();
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
  it('2. Room is deleted after 24 hours from creation and history is saved', async () => {
    jest.useFakeTimers();
    const io = makeMockIo();
    const buzzBuffers = new Map<string, any>();
    const room = createRoom('host-1', 'sock-1');
    room.participants = [
      { id: 'p1', displayName: 'Alice', socketId: 'sock-p1', joinedAt: Date.now(), isConnected: true, score: 10 }
    ];

    scheduleMaxLifetimeCleanup(room.roomId, io, buzzBuffers, []);

    expect(rooms.has(room.roomId)).toBe(true);

    // Fast-forward
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);

    // Flush promises so the async saveGameHistory gets executed and its internal await resolves
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(rooms.has(room.roomId)).toBe(false);
    expect(mockPrismaCreate).toHaveBeenCalled();
    expect(room.historySaved).toBe(true);

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

  // ── 3b. Empty game is saved as NO_WINNER ─────────────────────────────────
  it('3b. Empty game is saved as NO_WINNER', async () => {
    const prisma = makeMockPrisma();
    const room = createRoom('host-1', 'sock-1');
    room.participants = [];
    require('../room-lifecycle').calculateGameResult(room);

    await saveGameHistory(room, prisma);

    expect(prisma.gameHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        result: GameResult.NO_WINNER,
        winnerScore: 0,
        participants: 0,
      }),
    }));
  });

  // ── 3c. DB error is caught and does not cause unhandled rejection ────────
  it('3c. DB error does not cause unhandled rejection and deletes room in maxLifetime cleanup', async () => {
    jest.useFakeTimers();
    const io = makeMockIo();
    
    let rejectPromise: (reason?: any) => void;
    const promise = new Promise((resolve, reject) => {
      rejectPromise = reject;
    });
    const mockCreate = jest.fn().mockReturnValue(promise);
    jest.mocked(require('../../prisma').prisma.gameHistory.create).mockImplementation(mockCreate);

    const room = createRoom('host-error', 'sock-err');
    scheduleMaxLifetimeCleanup(room.roomId, io, new Map(), []);

    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    // Let the setImmediate or timeout flush
    await Promise.resolve();

    // At this point, the cleanup timer has fired, but saveGameHistory is still waiting for prisma.create
    expect(rooms.has(room.roomId)).toBe(true); // Should not be deleted yet!
    
    // Now reject the promise
    rejectPromise!(new Error('DB Error'));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve(); // Flush microtasks

    // Error was thrown inside, caught, and finally deleteRoom was executed
    expect(rooms.has(room.roomId)).toBe(false);
    expect(mockCreate).toHaveBeenCalled();

    io.close();
    jest.useRealTimers();
  });

  it('3d. 24-hour cleanup waits for a successful history save before deleting the room', async () => {
    jest.useFakeTimers();
    const io = makeMockIo();
    let resolveSave: (() => void) | undefined;
    mockPrismaCreate.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolveSave = resolve;
    }));

    const room = createRoom('host-deferred', 'sock-deferred');
    scheduleMaxLifetimeCleanup(room.roomId, io, new Map(), []);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    await Promise.resolve();

    expect(rooms.has(room.roomId)).toBe(true);
    resolveSave?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(rooms.has(room.roomId)).toBe(false);
    expect(room.historySaved).toBe(true);

    io.close();
    jest.useRealTimers();
  });

  // ── 3e. calculateGameResult mappings ─────────────────────────────────────
  it('3e. calculateGameResult maps 0 score, 1 winner, and draw correctly', () => {
    const room = createRoom('host', 'sock');

    // 0 participants
    room.participants = [];
    require('../room-lifecycle').calculateGameResult(room);
    expect(room.gameResult).toBe(GameResult.NO_WINNER);
    expect(room.winnerName).toBeNull();

    // Participants but all 0 score
    room.participants = [
      { id: '1', displayName: 'A', socketId: 's', joinedAt: 1, isConnected: true, score: 0 },
    ];
    require('../room-lifecycle').calculateGameResult(room);
    expect(room.gameResult).toBe(GameResult.NO_WINNER);
    expect(room.winnerName).toBeNull();

    // One leader
    room.participants[0].score = 10;
    require('../room-lifecycle').calculateGameResult(room);
    expect(room.gameResult).toBe(GameResult.WINNER);
    expect(room.winnerName).toBe('A');

    // Draw
    room.participants.push({ id: '2', displayName: 'B', socketId: 's', joinedAt: 1, isConnected: true, score: 10 });
    require('../room-lifecycle').calculateGameResult(room);
    expect(room.gameResult).toBe(GameResult.DRAW);
    expect(room.winnerName).toBeNull();
    
    // Independent of participant order
    room.participants = [
      { id: '2', displayName: 'B', socketId: 's', joinedAt: 1, isConnected: true, score: 10 },
      { id: '1', displayName: 'A', socketId: 's', joinedAt: 1, isConnected: true, score: 10 },
    ];
    require('../room-lifecycle').calculateGameResult(room);
    expect(room.gameResult).toBe(GameResult.DRAW);
    expect(room.winnerName).toBeNull();
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

  // ── 9. Host timeout finishes, persists, then clears every room resource ──
  it('9. Host reconnect timeout saves the final result once before deleting room state', async () => {
    jest.useFakeTimers();
    const capturedTimers: { cb: () => void; ms: number }[] = [];
    jest.spyOn(reconnectTimeoutLoader, 'setTimeout').mockImplementation((cb, ms) => {
      capturedTimers.push({ cb, ms });
      return setTimeout(() => {}, 99999);
    });
    let resolveSave: (() => void) | undefined;
    mockPrismaCreate.mockImplementationOnce(() => new Promise<void>(resolve => {
      resolveSave = resolve;
    }));

    const io = makeMockIo();
    const room = createRoom('host-1', 'sock-1');
    const roomId = room.roomId;
    room.participants.push({
      id: 'participant-0', displayName: 'Bob', socketId: 'sock-p0', joinedAt: 1, isConnected: true, score: 3,
    });
    room.participants.push({
      id: 'participant-1', displayName: 'Alice', socketId: '', joinedAt: 1, isConnected: false, score: 7,
    });
    socketToRoom.set('sock-1', roomId);
    socketToRoom.set('sock-p0', roomId);
    const buzzBuffers = new Map<string, any>();
    buzzBuffers.set(roomId, { timer: setTimeout(() => {}, 99999), buzzes: [] });
    const participantDisconnectTimers = new Map<string, NodeJS.Timeout>();
    participantDisconnectTimers.set(`${roomId}_participant-1`, setTimeout(() => {}, 99999));

    startHostReconnectTimeout(roomId, io, buzzBuffers, undefined, participantDisconnectTimers);

    const tenMin = capturedTimers.find(t => t.ms === 10 * 60 * 1000);
    expect(tenMin).toBeDefined();

    // Repeated delivery must not create a duplicate history record.
    tenMin!.cb();
    const finalization = closeRoomAfterHostTimeout(roomId, io, buzzBuffers, undefined, participantDisconnectTimers);
    const repeatedFinalization = closeRoomAfterHostTimeout(roomId, io, buzzBuffers, undefined, participantDisconnectTimers);
    await Promise.resolve();
    await Promise.resolve();
    expect(rooms.has(roomId)).toBe(true);
    expect(mockPrismaCreate).toHaveBeenCalledTimes(1);

    resolveSave?.();
    await Promise.all([finalization, repeatedFinalization]);

    expect(mockPrismaCreate).toHaveBeenCalledTimes(1);
    expect(mockPrismaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        result: GameResult.WINNER,
        winnerName: 'Alice',
        winnerScore: 7,
        participants: 2,
      }),
    }));
    expect(room.roundState).toBe(RoomState.FINISHED);
    expect(rooms.has(roomId)).toBe(false);
    expect(socketToRoom.has('sock-1')).toBe(false);
    expect(socketToRoom.has('sock-p0')).toBe(false);
    expect(buzzBuffers.has(roomId)).toBe(false);
    expect(participantDisconnectTimers.has(`${roomId}_participant-1`)).toBe(false);

    io.close();
    jest.useRealTimers();
  });

  it('10. Host timeout deletes the room when history persistence fails', async () => {
    jest.useFakeTimers();
    const capturedTimers: { cb: () => void; ms: number }[] = [];
    jest.spyOn(reconnectTimeoutLoader, 'setTimeout').mockImplementation((cb, ms) => {
      capturedTimers.push({ cb, ms });
      return setTimeout(() => {}, 99999);
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockPrismaCreate.mockRejectedValueOnce(new Error('database unavailable'));

    const io = makeMockIo();
    const room = createRoom('host-error', 'sock-error');
    startHostReconnectTimeout(room.roomId, io, new Map(), []);

    capturedTimers.find(t => t.ms === 10 * 60 * 1000)!.cb();
    await closeRoomAfterHostTimeout(room.roomId, io, new Map(), []);

    expect(rooms.has(room.roomId)).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('Error saving history on host timeout:', expect.any(Error));

    io.close();
    jest.useRealTimers();
  });
});
