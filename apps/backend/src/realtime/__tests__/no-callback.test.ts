import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms } from '../../rooms';
import { postFinishTimers, maxLifetimeTimers } from '../room-lifecycle';
import { hostDisconnectTimers } from '../host-reconnect';
import { participantDisconnectTimers } from '../index';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
    },
    gameHistory: {
      create: jest.fn(),
    },
  },
}));

describe('Socket Actions without callbacks', () => {
  let hostSocket: ClientSocket;
  let p1Socket: ClientSocket;
  let port: number;
  let hostToken: string;

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

  afterEach(async () => {
    const disconnect = (socket: ClientSocket) => new Promise<void>(resolve => {
      if (!socket?.connected) return resolve();
      const serverSocket = io.sockets.sockets.get(socket.id!);
      if (serverSocket) serverSocket.once('disconnect', () => resolve());
      else resolve();
      socket.disconnect();
    });
    await Promise.all([disconnect(hostSocket), disconnect(p1Socket)]);
    jest.clearAllMocks();
    for (const timers of [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers, participantDisconnectTimers]) {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    }
    rooms.clear();
  });

  const createClient = (token?: string) => {
    return Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
      extraHeaders: token ? { Cookie: `hostToken=${encodeURIComponent(token)}` } : undefined,
    });
  };

  const setupRoom = async (): Promise<string> => {
    (prisma.hostUser.findUnique as any).mockResolvedValue({
      id: 'host123',
      subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 10000) },
    } as any);
    hostToken = jwt.sign({ userId: 'host123', sessionId: 'session-host123' }, config.jwtSecret);
    (prisma.session.findUnique as any).mockResolvedValue({
      id: 'session-host123',
      userId: 'host123',
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: null,
    });
    (prisma.gameHistory.create as any).mockResolvedValue({});

    hostSocket = createClient(hostToken);
    p1Socket = createClient();

    hostSocket.connect();
    
    return new Promise((resolve) => {
      hostSocket.on('connect', () => {
        hostSocket.emit('ROOM_CREATE', (res: any) => {
          resolve(res.room.roomCode);
        });
      });
    });
  };

  it('handles missing callbacks gracefully for all endpoints', async () => {
    const code = await setupRoom();

    p1Socket.connect();
    await new Promise<void>((resolve) => p1Socket.on('connect', resolve));

    const roomUpdates: any[] = [];
    p1Socket.on('ROOM_STATE_UPDATED', (state) => {
      roomUpdates.push(state.roundState);
    });
    const synchronize = (socket: ClientSocket) => new Promise<number>(resolve => {
      socket.emit('SYNC_TIME', Date.now(), resolve);
    });
    const waitForState = (state: string) => new Promise<{ roundState: string; unlockAt?: number | null }>(resolve => {
      p1Socket.once('ROOM_STATE_UPDATED', snapshot => {
        if (snapshot.roundState === state) resolve(snapshot);
      });
    });

    p1Socket.emit('ROOM_CREATE'); 
    p1Socket.emit('ROOM_JOIN', { roomCode: 'BADCODE', displayName: 'Player 1' });
    hostSocket.emit('ROOM_JOIN', { roomCode: code, displayName: 'Player 1' });
    await synchronize(p1Socket);
    await synchronize(hostSocket);

    // Wait for p1 to actually join so they receive state updates
    await new Promise((resolve) => p1Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'Player 1' }, resolve));
    
    // Clear initial join update
    roomUpdates.length = 0;

    // Invalid: participant trying to start round
    p1Socket.emit('ROUND_START'); 
    await synchronize(p1Socket);
    expect(roomUpdates).toHaveLength(0); // No update should happen

    // Valid: host starting round without callback
    const active = waitForState('ACTIVE');
    hostSocket.emit('ROUND_START'); 
    const activeSnapshot = await active;
    expect(roomUpdates).toHaveLength(1);
    expect(roomUpdates[0]).toBe('ACTIVE');
    roomUpdates.length = 0;

    // Invalid: host trying to buzz
    hostSocket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }); 
    await synchronize(hostSocket);
    expect(roomUpdates).toHaveLength(0);

    // Valid: participant buzzes
    await new Promise<void>(resolve => setTimeout(
      resolve,
      Math.max(0, (activeSnapshot.unlockAt ?? Date.now()) - Date.now()),
    ));
    const revealed = waitForState('REVEALED');
    p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }); 
    await revealed;
    expect(roomUpdates.length).toBeGreaterThanOrEqual(1);
    expect(roomUpdates[roomUpdates.length - 1]).toBe('REVEALED');
    roomUpdates.length = 0;

    // Invalid: participant trying to reset
    p1Socket.emit('ROUND_RESET'); 
    await synchronize(p1Socket);
    expect(roomUpdates).toHaveLength(0);

    // Valid: host resetting
    const waiting = waitForState('WAITING');
    hostSocket.emit('ROUND_RESET'); 
    await waiting;
    expect(roomUpdates).toHaveLength(1);
    expect(roomUpdates[0]).toBe('WAITING');
    roomUpdates.length = 0;

    // Invalid: participant trying to clear scores
    p1Socket.emit('HOST_CLEAR_SCORES'); 
    await synchronize(p1Socket);
    expect(roomUpdates).toHaveLength(0);

    // Valid: host clearing scores
    const scoresCleared = waitForState('WAITING');
    hostSocket.emit('HOST_CLEAR_SCORES'); 
    await scoresCleared;
    expect(roomUpdates).toHaveLength(1);
    roomUpdates.length = 0;

    // Invalid: participant trying to finish room
    p1Socket.emit('ROOM_FINISH'); 
    await synchronize(p1Socket);
    expect(roomUpdates).toHaveLength(0);

    // Valid: host finishing room
    const finished = waitForState('FINISHED');
    hostSocket.emit('ROOM_FINISH'); 
    await finished;
    expect(roomUpdates).toHaveLength(1);
    expect(roomUpdates[0]).toBe('FINISHED');
  });
});
