import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms } from '../../rooms';
import { postFinishTimers, maxLifetimeTimers } from '../room-lifecycle';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { RoomState } from 'shared';

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
      revokedAt: null
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
      // Mock prisma create to fail
      const mockCreate = jest.fn().mockRejectedValueOnce(new Error('DB failure'));
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

      // 1. Mock DB failure
      (prisma.gameHistory.create as jest.Mock).mockRejectedValueOnce(new Error('DB Timeout'));

      hostSocket.emit('ROOM_FINISH', (res1: any) => {
        // Assert failure
        expect(res1.success).toBe(false);
        expect(res1.error).toBe('Не удалось сохранить результаты игры');

        // Assert state is reverted to WAITING (default)
        expect(room.roundState).toBe(RoomState.WAITING);
        expect(room.gameResult).toBeUndefined();

        // 2. Mock DB success on retry
        (prisma.gameHistory.create as jest.Mock).mockResolvedValueOnce({});

        hostSocket.emit('ROOM_FINISH', (res2: any) => {
          expect(res2.success).toBe(true);
          expect(room.roundState).toBe(RoomState.FINISHED);
          done();
        });
      });
    });
  });
});
