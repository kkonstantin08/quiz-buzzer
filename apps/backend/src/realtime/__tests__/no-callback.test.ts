import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms } from '../../rooms';
import { postFinishTimers, maxLifetimeTimers } from '../room-lifecycle';
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (p1Socket && p1Socket.connected) p1Socket.disconnect();
    jest.clearAllMocks();
    
    await new Promise(resolve => setTimeout(resolve, 50));
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

    p1Socket.emit('ROOM_CREATE'); 
    p1Socket.emit('ROOM_JOIN', { roomCode: 'BADCODE', displayName: 'Player 1' });
    hostSocket.emit('ROOM_JOIN', { roomCode: code, displayName: 'Player 1' });

    // Wait for p1 to actually join so they receive state updates
    await new Promise((resolve) => p1Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'Player 1' }, resolve));
    
    // Clear initial join update
    roomUpdates.length = 0;

    // Invalid: participant trying to start round
    p1Socket.emit('ROUND_START'); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(0); // No update should happen

    // Valid: host starting round without callback
    hostSocket.emit('ROUND_START'); 
    await sleep(200);
    expect(roomUpdates).toHaveLength(1);
    expect(roomUpdates[0]).toBe('ACTIVE');
    roomUpdates.length = 0;

    // Invalid: host trying to buzz
    hostSocket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(0);

    // Valid: participant buzzes
    p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }); 
    await sleep(350); // wait for 250ms grace period buffer to resolve
    expect(roomUpdates.length).toBeGreaterThanOrEqual(1);
    expect(roomUpdates[roomUpdates.length - 1]).toBe('REVEALED');
    roomUpdates.length = 0;

    // Invalid: participant trying to reset
    p1Socket.emit('ROUND_RESET'); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(0);

    // Valid: host resetting
    hostSocket.emit('ROUND_RESET'); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(1);
    expect(roomUpdates[0]).toBe('WAITING');
    roomUpdates.length = 0;

    // Invalid: participant trying to clear scores
    p1Socket.emit('HOST_CLEAR_SCORES'); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(0);

    // Valid: host clearing scores
    hostSocket.emit('HOST_CLEAR_SCORES'); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(1);
    roomUpdates.length = 0;

    // Invalid: participant trying to finish room
    p1Socket.emit('ROOM_FINISH'); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(0);

    // Valid: host finishing room
    hostSocket.emit('ROOM_FINISH'); 
    await sleep(50);
    expect(roomUpdates).toHaveLength(1);
    expect(roomUpdates[0]).toBe('FINISHED');

    p1Socket.emit('PARTICIPANT_REJOIN', { roomCode: code, participantId: 'fake', reconnectToken: 'fake' });
    
    const roomArr = Array.from(rooms.values());
    if (roomArr.length > 0) {
      p1Socket.emit('HOST_REJOIN_ROOM', { roomId: roomArr[0].roomId }); 
    }
    hostSocket.emit('ROOM_LEAVE');

    await sleep(200); 
  });
});
