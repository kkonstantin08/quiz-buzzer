import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms } from '../../rooms';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
    },
  },
}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Socket Roles Enforcement', () => {
  let hostSocket: ClientSocket;
  let p1Socket: ClientSocket;
  let p2Socket: ClientSocket;
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

  afterEach(() => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (p1Socket && p1Socket.connected) p1Socket.disconnect();
    if (p2Socket && p2Socket.connected) p2Socket.disconnect();
    rooms.clear();
    jest.clearAllMocks();
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

    hostSocket = createClient(hostToken);
    p1Socket = createClient();
    p2Socket = createClient();

    hostSocket.connect();
    
    return new Promise((resolve) => {
      hostSocket.on('connect', () => {
        hostSocket.emit('ROOM_CREATE', (res: any) => {
          resolve(res.room.roomCode);
        });
      });
    });
  };

  const joinRoom = (socket: ClientSocket, roomCode: string, displayName: string): Promise<any> => {
    return new Promise((resolve) => {
      socket.connect();
      socket.on('connect', () => {
        socket.emit('ROOM_JOIN', { roomCode, displayName }, resolve);
      });
    });
  };

  const startRound = (socket: ClientSocket) => {
    return new Promise<void>((resolve) => {
      socket.emit('ROUND_START', () => {
        setTimeout(resolve, 160); // wait for 150ms unlockAt
      });
    });
  };

  it('allows ordinary participant to BUZZ_SUBMIT', async () => {
    const code = await setupRoom();
    const joinRes = await joinRoom(p1Socket, code, 'Player 1');
    expect(joinRes.success).toBe(true);

    await startRound(hostSocket);

    return new Promise<void>((resolve) => {
      p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }, (res: any) => {
        expect(res.success).toBe(true);
        resolve();
      });
    });
  });

  it('rejects BUZZ_SUBMIT from host socket', async () => {
    await setupRoom();
    await startRound(hostSocket);

    return new Promise<void>((resolve) => {
      hostSocket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/только участник/i);
        resolve();
      });
    });
  });

  it('rejects ROOM_JOIN from host socket', async () => {
    const code = await setupRoom();

    return new Promise<void>((resolve) => {
      hostSocket.emit('ROOM_JOIN', { roomCode: code, displayName: 'FakeHost' }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/ведущий не может/i);
        resolve();
      });
    });
  });

  it('rejects BUZZ_SUBMIT from socket that did not join', async () => {
    await setupRoom();
    await startRound(hostSocket);

    p1Socket.connect();
    await sleep(50); // Just give it a moment to connect without joining

    return new Promise<void>((resolve) => {
      p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/только участник/i);
        resolve();
      });
    });
  });

  it('rejects duplicate ROOM_JOIN from same participant socket', async () => {
    const code = await setupRoom();
    await joinRoom(p1Socket, code, 'Player 1');

    return new Promise<void>((resolve) => {
      p1Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'Hacker' }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/уже/i); // "уже в комнате"
        resolve();
      });
    });
  });

  it('rejects host commands from participant socket', async () => {
    const code = await setupRoom();
    await joinRoom(p1Socket, code, 'Player 1');

    const res1 = await new Promise<any>((resolve) => p1Socket.emit('ROUND_START', resolve));
    expect(res1.success).toBe(false);
    expect(res1.error).toMatch(/только ведущий/i);

    const res2 = await new Promise<any>((resolve) => p1Socket.emit('ROUND_RESET', resolve));
    expect(res2.success).toBe(false);
    expect(res2.error).toMatch(/только ведущий/i);

    const res3 = await new Promise<any>((resolve) => p1Socket.emit('ROOM_FINISH', resolve));
    expect(res3.success).toBe(false);
    expect(res3.error).toMatch(/только ведущий/i);
  });

  it('ensures rejected buzz does not affect firstBuzzerId', async () => {
    await setupRoom();
    await startRound(hostSocket);

    await new Promise<void>((resolve) => {
      hostSocket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() }, () => resolve());
    });

    await sleep(300);

    const room = Array.from(rooms.values())[0];
    expect(room.firstBuzzerId).toBeNull();
  });

});
