import { createServer } from 'node:http';
import { describe, expect, afterAll, afterEach, beforeAll, beforeEach, it, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { config } from '../../config';
import { prisma } from '../../prisma';
import { rooms } from '../../rooms';
import { participantDisconnectTimers, setupSocketIO } from '../index';

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    gameHistory: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

const userId = 'host-user';
const sessionId = 'host-session';
const sessionFindUnique = jest.mocked(prisma.session.findUnique);
const hostUserFindUnique = jest.mocked(prisma.hostUser.findUnique);

function session(overrides: Partial<{ userId: string; expiresAt: Date; revokedAt: Date | null }> = {}) {
  return {
    id: sessionId,
    userId,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

function hostUser() {
  return {
    id: userId,
    subscription: {
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + 60_000),
    },
    settings: null,
  };
}

describe('Socket.IO host session authentication', () => {
  const httpServer = createServer();
  const io = new Server(httpServer);
  const clients: ClientSocket[] = [];
  let port: number;

  beforeAll((done) => {
    setupSocketIO(io);
    httpServer.listen(0, () => {
      const address = httpServer.address();
      if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
      port = address.port;
      done();
    });
  });

  beforeEach(() => {
    sessionFindUnique.mockResolvedValue(session() as never);
    hostUserFindUnique.mockResolvedValue(hostUser() as never);
  });

  afterEach(() => {
    for (const client of clients.splice(0)) client.disconnect();
    rooms.clear();
    jest.clearAllMocks();
  });

  afterAll((done) => {
    for (const timer of participantDisconnectTimers.values()) clearTimeout(timer);
    participantDisconnectTimers.clear();
    io.close();
    httpServer.close(done);
  });

  function createClient(token?: string) {
    const client = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
      extraHeaders: token ? { Cookie: `hostToken=${encodeURIComponent(token)}` } : undefined,
    });
    clients.push(client);
    return client;
  }

  function waitForConnection(client: ClientSocket): Promise<'connected' | 'rejected'> {
    return new Promise((resolve) => {
      client.once('connect', () => resolve('connected'));
      client.once('connect_error', () => resolve('rejected'));
      client.connect();
    });
  }

  function waitForAuthErrorCode(client: ClientSocket): Promise<string | undefined> {
    return new Promise((resolve) => {
      client.once('connect_error', (error) => {
        const data: unknown = Reflect.get(error, 'data');
        resolve(
          typeof data === 'object' && data !== null && 'code' in data && typeof data.code === 'string'
            ? data.code
            : undefined,
        );
      });
      client.connect();
    });
  }

  function createRoom(client: ClientSocket) {
    return new Promise<{ success: boolean; room?: { roomId: string }; error?: string }>((resolve) => {
      client.emit('ROOM_CREATE', resolve);
    });
  }

  it('authorizes a host only when its cookie JWT and Session match', async () => {
    const token = jwt.sign({ userId, sessionId }, config.jwtSecret);
    const client = createClient(token);

    await expect(waitForConnection(client)).resolves.toBe('connected');
    await expect(createRoom(client)).resolves.toMatchObject({ success: true });
  });

  it('does not authorize the legacy ROOM_CREATE token payload', async () => {
    const token = jwt.sign({ userId, sessionId }, config.jwtSecret);
    const client = createClient(token);

    await expect(waitForConnection(client)).resolves.toBe('connected');
    const result = await new Promise<{ success: boolean }>((resolve) => {
      client.emit('ROOM_CREATE', token, resolve);
    });

    expect(result.success).toBe(false);
    expect(rooms.size).toBe(0);
  });

  it.each([
    { label: 'a JWT without sessionId', createToken: () => jwt.sign({ userId }, config.jwtSecret) },
    { label: 'a missing Session', createToken: () => jwt.sign({ userId, sessionId }, config.jwtSecret), createSession: () => null },
    { label: 'a Session belonging to another user', createToken: () => jwt.sign({ userId, sessionId }, config.jwtSecret), createSession: () => session({ userId: 'other-user' }) },
    { label: 'an expired Session', createToken: () => jwt.sign({ userId, sessionId }, config.jwtSecret), createSession: () => session({ expiresAt: new Date(Date.now() - 1) }) },
    { label: 'a revoked Session', createToken: () => jwt.sign({ userId, sessionId }, config.jwtSecret), createSession: () => session({ revokedAt: new Date() }) },
    { label: 'an invalid JWT', createToken: () => 'not-a-jwt' },
  ])('rejects a host cookie containing $label', async ({ createToken, createSession }) => {
    if (createSession) sessionFindUnique.mockResolvedValue(createSession() as never);
    const client = createClient(createToken());

    await expect(waitForConnection(client)).resolves.toBe('rejected');
  });

  it('returns a stable auth error code for an invalid host cookie', async () => {
    const client = createClient('not-a-jwt');

    await expect(waitForAuthErrorCode(client)).resolves.toBe('AUTH_TOKEN_INVALID');
  });

  it('does not allow a connected host to act after its Session is revoked', async () => {
    const token = jwt.sign({ userId, sessionId }, config.jwtSecret);
    const client = createClient(token);

    await expect(waitForConnection(client)).resolves.toBe('connected');
    const room = await createRoom(client);
    expect(room.success).toBe(true);

    sessionFindUnique.mockResolvedValue(session({ revokedAt: new Date() }) as never);
    const actions = [
      (callback: (result: { success: boolean }) => void) => client.emit('HOST_REJOIN_ROOM', { roomId: room.room?.roomId }, callback),
      (callback: (result: { success: boolean }) => void) => client.emit('ROUND_START', callback),
      (callback: (result: { success: boolean }) => void) => client.emit('ROUND_RESET', callback),
      (callback: (result: { success: boolean }) => void) => client.emit('HOST_CLEAR_SCORES', callback),
      (callback: (result: { success: boolean }) => void) => client.emit('ROOM_FINISH', callback),
    ];

    for (const action of actions) {
      const result = await new Promise<{ success: boolean }>((resolve) => action(resolve));
      expect(result.success).toBe(false);
    }
  });

  it('disconnects sockets when host_logout event is emitted', async () => {
    const { appEvents } = await import('../../events');
    const token = jwt.sign({ userId, sessionId }, config.jwtSecret);
    const client = createClient(token);

    await expect(waitForConnection(client)).resolves.toBe('connected');

    // Create room to test room deletion
    const room = await createRoom(client);
    expect(room.success).toBe(true);
    expect(rooms.size).toBe(1);

    const disconnectPromise = new Promise((resolve) => client.once('disconnect', resolve));

    appEvents.emit('host_logout', sessionId);

    await disconnectPromise;
    expect(client.connected).toBe(false);

    // Give event loop a tick to ensure room deletion is processed
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(rooms.size).toBe(0);
  });
});
