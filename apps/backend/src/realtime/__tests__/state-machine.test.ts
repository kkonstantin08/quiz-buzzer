import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms, socketToRoom } from '../../rooms';
import { postFinishTimers, maxLifetimeTimers } from '../room-lifecycle';
import { closeRoomAfterHostTimeout, hostDisconnectTimers } from '../host-reconnect';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { GameResult, RoomState, type PublicRoomData } from 'shared';
import { beginAccountDeletion, endAccountDeletion } from '../../auth/accountDeletionState';

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(),
    },
    gameHistory: {
      create: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 } as never),
    }
  },
}));

describe('State Machine Transitions', () => {
  let hostSocket: ClientSocket;
  let port: number;
  let createdRoomCode: string;
  let mockToken: string;

  beforeAll((done) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') {
        port = addr.port;
      }
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  afterEach(() => {
    endAccountDeletion('mock_host_id');
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    for (const timer of postFinishTimers.values()) clearTimeout(timer);
    for (const timer of maxLifetimeTimers.values()) clearTimeout(timer);
    postFinishTimers.clear();
    maxLifetimeTimers.clear();
    rooms.clear();
  });

  const createClient = (token?: string) => {
    return Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
      extraHeaders: token ? { Cookie: `hostToken=${encodeURIComponent(token)}` } : undefined,
    });
  };

  const setupRoom = (done: (error?: any) => void) => {
    (prisma.hostUser.findUnique as jest.Mock).mockResolvedValue({
      id: 'mock_host_id',
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 100000000),
      },
    } as unknown as never);

    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 'mock_session_id',
      userId: 'mock_host_id',
      expiresAt: new Date(Date.now() + 100000000),
      revokedAt: null,
      lastSeenAt: new Date(),
    } as unknown as never);

    mockToken = jwt.sign({ userId: 'mock_host_id', sessionId: 'mock_session_id' }, config.jwtSecret);

    hostSocket = createClient(mockToken);
    hostSocket.connect();

    hostSocket.on('connect', () => {
      hostSocket.emit('ROOM_CREATE', (res: any) => {
        if (!res.success) {
          console.error('ROOM_CREATE failed:', res.error);
        }
        expect(res.success).toBe(true);
        createdRoomCode = res.room.roomCode;
        done();
      });
    });
  };

  it('rejects ROOM_FINISH while account deletion is in progress', async () => {
    await new Promise<void>((resolve, reject) => setupRoom(error => error ? reject(error) : resolve()));
    const room = Array.from(rooms.values()).find(r => r.roomCode === createdRoomCode);
    if (!room) throw new Error('Room not found');
    room.participants.push({
      id: 'participant', displayName: 'Игрок', socketId: 'participant-socket', joinedAt: 1, isConnected: true, score: 1,
    });
    expect(beginAccountDeletion('mock_host_id')).toBe(true);

    const result = await new Promise<{ success: boolean }>((resolve) => hostSocket.emit('ROOM_FINISH', resolve));

    expect(result.success).toBe(false);
    expect(prisma.gameHistory.create).not.toHaveBeenCalled();
  });

  it('should prevent ROUND_START if not in WAITING state', (done) => {
    setupRoom(() => {
      // 1. Valid transition
      hostSocket.emit('ROUND_START', (res1: any) => {
        if (!res1.success) console.error('ROUND_START failed:', res1.error);
        expect(res1.success).toBe(true);

        // 2. Invalid transition (already ACTIVE)
        hostSocket.emit('ROUND_START', (res2: any) => {
          expect(res2.success).toBe(false);
          expect(res2.error).toBe('Раунд можно начать только из режима ожидания');
          done();
        });
      });
    });
  });

  it('should prevent ROUND_RESET if not in REVEALED state', (done) => {
    setupRoom(() => {
      // Invalid transition from WAITING
      hostSocket.emit('ROUND_RESET', {}, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toBe('Сброс возможен только после ответа');
        done();
      });
    });
  });

  it('should validate winnerId during ROUND_RESET and apply score', (done) => {
    setupRoom(() => {
      // Manually set internal state for this test
      const room = Array.from(rooms.values()).find(r => r.roomCode === createdRoomCode);
      if (!room) return done(new Error('Room not found'));

      // Simulate participant
      room.participants.push({
        id: 'p1', displayName: 'Player 1', socketId: 's1', joinedAt: 1, isConnected: true, score: 0, reconnectTokenHash: 'h'
      });
      room.roundState = RoomState.REVEALED;
      room.firstBuzzerId = 'p1';

      // 1. Invalid winner
      hostSocket.emit('ROUND_RESET', { winnerId: 'wrong_id' }, (res1: any) => {
        expect(res1.success).toBe(false);
        expect(res1.error).toBe('Неверный победитель');

        // 2. Valid winner
        hostSocket.emit('ROUND_RESET', { winnerId: 'p1' }, (res2: any) => {
          expect(res2.success).toBe(true);
          expect(room.roundState).toBe(RoomState.WAITING);
          expect(room.participants[0].score).toBe(1);
          done();
        });
      });
    });
  });

  it('should prevent HOST_CLEAR_SCORES if room is FINISHED', (done) => {
    setupRoom(() => {
      hostSocket.emit('ROOM_FINISH', (res1: any) => {
        expect(res1.success).toBe(true);

        hostSocket.emit('HOST_CLEAR_SCORES', {}, (res2: any) => {
          expect(res2.success).toBe(false);
          expect(res2.error).toBe('Игра уже завершена');
          done();
        });
      });
    });
  });

  it('should prevent ROOM_FINISH if room is already FINISHED', (done) => {
    setupRoom(() => {
      hostSocket.emit('ROOM_FINISH', (res1: any) => {
        expect(res1.success).toBe(true);

        hostSocket.emit('ROOM_FINISH', (res2: any) => {
          expect(res2.success).toBe(false);
          expect(res2.error).toBe('Игра уже завершена');
          done();
        });
      });
    });
  });

  it('should not mark room as FINISHED and should return error if saveGameHistory fails', (done) => {
    setupRoom(() => {
      const room = Array.from(rooms.values()).find((r: any) => r.roomCode === createdRoomCode);
      if (room) room.participants = [{ id: 'p1', displayName: 'P1', socketId: 'sock-p1', score: 10, isConnected: true, joinedAt: Date.now() }];
      // Mock prisma create to fail
      const mockCreate = jest.fn().mockRejectedValueOnce(new Error('DB failure') as never);
      jest.mocked(require('../../prisma').prisma.gameHistory.create).mockImplementation(mockCreate);

      hostSocket.emit('ROOM_FINISH', (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toBe('Не удалось сохранить результаты игры');

        // Verify the room is still ACTIVE
        hostSocket.emit('ROUND_START', (res2: any) => {
          expect(res2.success).toBe(true);
          done();
        });
      });
    });
  });

  it('should handle ROOM_FINISH DB errors by reverting state and allowing retry', (done) => {
    setupRoom(() => {
      const room = Array.from(rooms.values()).find(r => r.roomCode === createdRoomCode);
      if (!room) return done(new Error('Room not found'));
      room.participants = [{ id: 'p1', displayName: 'P1', socketId: 'sock-p1', score: 10, isConnected: true, joinedAt: Date.now() }];

      // 1. Mock DB failure
      (prisma.gameHistory.create as jest.Mock).mockRejectedValueOnce(new Error('DB Timeout') as never);

      hostSocket.emit('ROOM_FINISH', (res1: any) => {
        // Assert failure
        expect(res1.success).toBe(false);
        expect(res1.error).toBe('Не удалось сохранить результаты игры');

        // Assert state is reverted to WAITING (default)
        expect(room.roundState).toBe(RoomState.WAITING);
        expect(room.gameResult).toBeUndefined();

        // 2. Mock DB success on retry
        (prisma.gameHistory.create as jest.Mock).mockResolvedValueOnce({} as never);

        hostSocket.emit('ROOM_FINISH', (res2: any) => {
          expect(res2.success).toBe(true);
          expect(room.roundState).toBe(RoomState.FINISHED);
          done();
        });
      });
    });
  });

  it('retries ROOM_FINISH after one failed history write without broadcasting or duplicating history', async () => {
    await new Promise<void>((resolve, reject) => setupRoom(error => error ? reject(error) : resolve()));
    const room = Array.from(rooms.values()).find(r => r.roomCode === createdRoomCode);
    if (!room) throw new Error('Room not found');
    room.participants = [{ id: 'p1', displayName: 'P1', socketId: 'sock-p1', score: 10, isConnected: true, joinedAt: Date.now() }];

    (prisma.gameHistory.create as jest.Mock).mockReset();
    const snapshots: RoomState[] = [];
    hostSocket.on('ROOM_STATE_UPDATED', snapshot => snapshots.push(snapshot.roundState));
    const unhandledRejection = jest.fn();
    process.on('unhandledRejection', unhandledRejection);
    let successfulHistoryWrites = 0;
    let rejectFirstWrite: ((error: Error) => void) | undefined;
    let markFirstWriteStarted: (() => void) | undefined;
    const firstWriteStarted = new Promise<void>(resolve => {
      markFirstWriteStarted = resolve;
    });
    (prisma.gameHistory.create as jest.Mock)
      .mockImplementationOnce(() => {
        markFirstWriteStarted?.();
        return new Promise((_, reject) => {
          rejectFirstWrite = reject;
        }) as never;
      })
      .mockImplementationOnce(async () => {
        successfulHistoryWrites += 1;
        return {} as never;
      });

    try {
      const firstResult = new Promise<{ success: boolean; error?: string }>(resolve => {
        hostSocket.emit('ROOM_FINISH', resolve);
      });
      await firstWriteStarted;
      const historySavedWhilePending = room.historySaved;
      rejectFirstWrite?.(new Error('DB unavailable'));
      const first = await firstResult;
      await new Promise<void>(resolve => setImmediate(resolve));

      expect(historySavedWhilePending).toBe(false);
      expect(first).toEqual({ success: false, error: 'Не удалось сохранить результаты игры' });
      expect(snapshots).not.toContain(RoomState.FINISHED);
      expect(room.historySaved).toBe(false);

      const finishedSnapshot = new Promise<void>(resolve => {
        hostSocket.once('ROOM_STATE_UPDATED', snapshot => {
          if (snapshot.roundState === RoomState.FINISHED) resolve();
        });
      });
      const second = await new Promise<{ success: boolean }>(resolve => {
        hostSocket.emit('ROOM_FINISH', resolve);
      });
      await finishedSnapshot;
      await new Promise<void>(resolve => setImmediate(resolve));

      expect(second).toEqual({ success: true });
      expect(successfulHistoryWrites).toBe(1);
      expect(prisma.gameHistory.create).toHaveBeenCalledTimes(2);
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
    }
  });

  it('shares one pending history write between ROOM_FINISH and host timeout before cleanup', async () => {
    await new Promise<void>((resolve, reject) => setupRoom(error => error ? reject(error) : resolve()));
    const room = Array.from(rooms.values()).find(r => r.roomCode === createdRoomCode);
    if (!room) throw new Error('Room not found');

    room.participants.push(
      { id: 'p1', displayName: 'Alice', socketId: 'p1-socket', joinedAt: 1, isConnected: true, score: 7 },
      { id: 'p2', displayName: 'Bob', socketId: 'p2-socket', joinedAt: 2, isConnected: false, score: 3 },
    );
    socketToRoom.set('p1-socket', room.roomId);
    const buzzBuffers = new Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>();
    buzzBuffers.set(room.roomId, { timer: setTimeout(() => undefined, 60_000), buzzes: [] });
    const participantTimers = new Map<string, NodeJS.Timeout>();
    participantTimers.set(`${room.roomId}_p2`, setTimeout(() => undefined, 60_000));
    hostDisconnectTimers.set(room.roomId, setTimeout(() => undefined, 60_000));

    let resolveWrite: (() => void) | undefined;
    let markWriteStarted: (() => void) | undefined;
    const writeStarted = new Promise<void>(resolve => {
      markWriteStarted = resolve;
    });
    (prisma.gameHistory.create as jest.Mock).mockReset().mockImplementationOnce(() => {
      markWriteStarted?.();
      return new Promise<void>(resolve => {
        resolveWrite = resolve;
      }) as never;
    });

    const finishedSnapshot = new Promise<PublicRoomData>(resolve => {
      hostSocket.on('ROOM_STATE_UPDATED', snapshot => {
        if (snapshot.roundState === RoomState.FINISHED) resolve(snapshot);
      });
    });
    const finishResult = new Promise<{ success: boolean }>(resolve => hostSocket.emit('ROOM_FINISH', resolve));
    await writeStarted;
    const timeoutResult = closeRoomAfterHostTimeout(room.roomId, io, buzzBuffers, undefined, participantTimers);
    let timeoutFinished = false;
    void timeoutResult.then(() => {
      timeoutFinished = true;
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    const roomExistedWhilePending = rooms.has(room.roomId);
    const historySavedWhilePending = room.historySaved;
    const timeoutFinishedWhilePending = timeoutFinished;

    resolveWrite?.();
    const [finish, snapshot] = await Promise.all([finishResult, finishedSnapshot, timeoutResult]);

    expect(roomExistedWhilePending).toBe(true);
    expect(historySavedWhilePending).toBe(false);
    expect(timeoutFinishedWhilePending).toBe(false);
    expect(timeoutFinished).toBe(true);
    expect(finish).toEqual({ success: true });
    expect(snapshot).toMatchObject({
      roundState: RoomState.FINISHED,
      gameResult: GameResult.WINNER,
      winnerName: 'Alice',
    });
    expect(prisma.gameHistory.create).toHaveBeenCalledTimes(1);
    expect(prisma.gameHistory.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        result: 'WINNER',
        winnerName: 'Alice',
        winnerScore: 7,
        participants: 2,
      }),
    }));
    expect(room.historySaved).toBe(true);
    expect(rooms.has(room.roomId)).toBe(false);
    expect(socketToRoom.has(hostSocket.id!)).toBe(false);
    expect(socketToRoom.has('p1-socket')).toBe(false);
    expect(buzzBuffers.has(room.roomId)).toBe(false);
    expect(participantTimers.has(`${room.roomId}_p2`)).toBe(false);
    expect(hostDisconnectTimers.has(room.roomId)).toBe(false);
    expect(postFinishTimers.has(room.roomId)).toBe(false);
    expect(maxLifetimeTimers.has(room.roomId)).toBe(false);
  });

  it('shares a rejected ROOM_FINISH write with timeout and still clears the room without an unhandled rejection', async () => {
    await new Promise<void>((resolve, reject) => setupRoom(error => error ? reject(error) : resolve()));
    const room = Array.from(rooms.values()).find(r => r.roomCode === createdRoomCode);
    if (!room) throw new Error('Room not found');
    room.participants = [{ id: 'p1', displayName: 'P1', socketId: 'sock-p1', score: 10, isConnected: true, joinedAt: Date.now() }];

    const buzzBuffers = new Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>();
    buzzBuffers.set(room.roomId, { timer: setTimeout(() => undefined, 60_000), buzzes: [] });
    hostDisconnectTimers.set(room.roomId, setTimeout(() => undefined, 60_000));
    let rejectWrite: ((error: Error) => void) | undefined;
    let markWriteStarted: (() => void) | undefined;
    const writeStarted = new Promise<void>(resolve => {
      markWriteStarted = resolve;
    });
    (prisma.gameHistory.create as jest.Mock).mockReset().mockImplementationOnce(() => {
      markWriteStarted?.();
      return new Promise((_, reject) => {
        rejectWrite = reject;
      }) as never;
    });
    const unhandledRejection = jest.fn();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.on('unhandledRejection', unhandledRejection);

    try {
      const finishResult = new Promise<{ success: boolean; error?: string }>(resolve => hostSocket.emit('ROOM_FINISH', resolve));
      await writeStarted;
      const timeoutResult = closeRoomAfterHostTimeout(room.roomId, io, buzzBuffers);
      await new Promise<void>(resolve => setImmediate(resolve));
      const roomExistedWhilePending = rooms.has(room.roomId);

      rejectWrite?.(new Error('DB unavailable'));
      const [finish] = await Promise.all([finishResult, timeoutResult]);
      await new Promise<void>(resolve => setImmediate(resolve));

      expect(roomExistedWhilePending).toBe(true);
      expect(finish).toEqual({ success: false, error: 'Не удалось сохранить результаты игры' });
      expect(prisma.gameHistory.create).toHaveBeenCalledTimes(1);
      expect(room.historySaved).toBe(false);
      expect(rooms.has(room.roomId)).toBe(false);
      expect(socketToRoom.has(hostSocket.id!)).toBe(false);
      expect(buzzBuffers.has(room.roomId)).toBe(false);
      expect(hostDisconnectTimers.has(room.roomId)).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith('Error saving history on host timeout:', expect.any(Error));
      expect(unhandledRejection).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandledRejection);
      errorSpy.mockRestore();
    }
  });
});
