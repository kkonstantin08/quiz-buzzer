import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { jest } from '@jest/globals';
import { app, io, server } from '../../server';
import { config } from '../../config';
import { appEvents } from '../../events';
import { prisma } from '../../prisma';
import { deleteRoom, rooms } from '../../rooms';
import { closeRoomAfterHostTimeout, hostDisconnectTimers } from '../../realtime/host-reconnect';
import { maxLifetimeTimers, postFinishTimers } from '../../realtime/room-lifecycle';
import { participantDisconnectTimers } from '../../realtime';
import { endAccountDeletion } from '../accountDeletionState';

const prefix = `account-management-realtime-${Date.now()}`;
const password = 'password123';
const confirmation = {
  currentPassword: password,
  confirmationPhrase: 'УДАЛИТЬ АККАУНТ',
  irreversibleConfirmed: true,
};
const clients: ClientSocket[] = [];
const userIds = new Set<string>();
let port: number;

async function createAccount(label: string) {
  const user = await prisma.hostUser.create({
    data: { email: `${prefix}-${label}@example.com`, passwordHash: await bcrypt.hash(password, 10) },
  });
  userIds.add(user.id);
  await prisma.subscription.create({
    data: {
      hostUserId: user.id,
      status: 'active',
      currentPeriodStart: new Date(Date.now() - 60_000),
      currentPeriodEnd: new Date(Date.now() + 60_000),
    },
  });
  const session = await prisma.session.create({
    data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date() },
  });
  const cookie = `hostToken=${jwt.sign({ userId: user.id, sessionId: session.id }, config.jwtSecret)}`;
  return { user, session, cookie };
}

function connectHost(cookie: string) {
  const client = createClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
    extraHeaders: { Cookie: cookie },
  });
  clients.push(client);
  return new Promise<ClientSocket>((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
    client.connect();
  });
}

function createHostRoom(client: ClientSocket) {
  return new Promise<{ success: boolean; room?: { roomId: string }; error?: string }>((resolve) => {
    client.emit('ROOM_CREATE', resolve);
  });
}

function hostAction(client: ClientSocket, event: 'ROUND_START' | 'ROOM_FINISH') {
  return new Promise<{ success: boolean; error?: string }>((resolve) => client.emit(event, resolve));
}

async function waitForDisconnect(client: ClientSocket) {
  if (!client.connected) return;
  await new Promise<void>((resolve) => client.once('disconnect', () => resolve()));
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected test server port');
  port = address.port;
});

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect();
  for (const roomId of [...rooms.keys()]) {
    deleteRoom(
      roomId,
      'test cleanup',
      io,
      undefined,
      [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers],
      participantDisconnectTimers,
    );
  }
  for (const userId of userIds) endAccountDeletion(userId);
  await prisma.hostUser.deleteMany({ where: { id: { in: [...userIds] } } });
  userIds.clear();
  jest.restoreAllMocks();
});

afterAll(async () => {
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await prisma.$disconnect();
});

describe('authoritative destructive operations with realtime', () => {
  it('rejects the next host mutation after logout-all even when physical socket cleanup throws', async () => {
    const account = await createAccount('logout-all-cleanup-error');
    const client = await connectHost(account.cookie);
    const created = await createHostRoom(client);
    expect(created).toMatchObject({ success: true, room: { roomId: expect.any(String) } });
    const cleanupError = () => {
      throw Object.assign(new Error('socket cleanup failed'), { code: 'EIO' });
    };
    appEvents.prependOnceListener('host_logout_all', cleanupError);

    try {
      const response = await request(app)
        .post('/api/auth/logout-all')
        .set('Cookie', account.cookie)
        .expect(200, { success: true });

      expect(response.headers['set-cookie']?.[0] ?? '').toContain('Expires=Thu, 01 Jan 1970');
      await expect(prisma.session.findUnique({ where: { id: account.session.id } })).resolves.toMatchObject({
        revokedAt: expect.any(Date),
      });
      expect(client.connected).toBe(true);
      await expect(hostAction(client, 'ROUND_START')).resolves.toMatchObject({ success: false });
      await request(app).get('/api/auth/me').set('Cookie', account.cookie).expect(401);
    } finally {
      appEvents.off('host_logout_all', cleanupError);
      const disconnected = waitForDisconnect(client);
      appEvents.emit('host_logout_all', account.user.id, [account.session.id]);
      await disconnected;
    }
  });

  it('deletes an active-room account without history and leaves another host untouched', async () => {
    const target = await createAccount('delete-active-room');
    const other = await createAccount('delete-active-room-other');
    const targetClient = await connectHost(target.cookie);
    const otherClient = await connectHost(other.cookie);
    const targetRoom = await createHostRoom(targetClient);
    const otherRoom = await createHostRoom(otherClient);
    rooms.get(targetRoom.room!.roomId)!.participants.push({
      id: 'target-participant', displayName: 'Игрок', socketId: 'target-participant-socket',
      joinedAt: 1, isConnected: true, score: 1,
    });
    const disconnected = waitForDisconnect(targetClient);

    const response = await request(app)
      .delete('/api/auth/account')
      .set('Cookie', target.cookie)
      .set('X-Forwarded-For', '198.51.100.211')
      .send(confirmation)
      .expect(200, { success: true });
    await disconnected;

    expect(response.headers['set-cookie']?.[0] ?? '').toContain('Expires=Thu, 01 Jan 1970');
    await expect(prisma.hostUser.findUnique({ where: { id: target.user.id } })).resolves.toBeNull();
    await expect(prisma.gameHistory.count({ where: { hostUserId: target.user.id } })).resolves.toBe(0);
    expect(rooms.has(targetRoom.room!.roomId)).toBe(false);
    expect(rooms.has(otherRoom.room!.roomId)).toBe(true);
    expect(otherClient.connected).toBe(true);
  });

  it('keeps deletion successful and authorization closed when realtime cleanup throws after commit', async () => {
    const target = await createAccount('delete-cleanup-error');
    const client = await connectHost(target.cookie);
    const created = await createHostRoom(client);
    const cleanupError = () => {
      throw Object.assign(new Error('socket cleanup failed'), { code: 'EIO' });
    };
    appEvents.prependOnceListener('host_account_deleted', cleanupError);

    try {
      const response = await request(app)
        .delete('/api/auth/account')
        .set('Cookie', target.cookie)
        .set('X-Forwarded-For', '198.51.100.212')
        .send(confirmation)
        .expect(200, { success: true });

      expect(response.headers['set-cookie']?.[0] ?? '').toContain('Expires=Thu, 01 Jan 1970');
      await expect(prisma.hostUser.findUnique({ where: { id: target.user.id } })).resolves.toBeNull();
      expect(client.connected).toBe(true);
      expect(rooms.has(created.room!.roomId)).toBe(true);
      await expect(hostAction(client, 'ROUND_START')).resolves.toMatchObject({ success: false });
      await request(app).get('/api/auth/me').set('Cookie', target.cookie).expect(401);
    } finally {
      appEvents.off('host_account_deleted', cleanupError);
      const disconnected = waitForDisconnect(client);
      appEvents.emit('host_account_deleted', target.user.id);
      await disconnected;
    }
  });

  it('blocks ROOM_FINISH and history while timeout races with an in-progress account deletion', async () => {
    const target = await createAccount('delete-lifecycle-race');
    const other = await createAccount('delete-lifecycle-race-other');
    const targetClient = await connectHost(target.cookie);
    const otherClient = await connectHost(other.cookie);
    const targetRoom = await createHostRoom(targetClient);
    const otherRoom = await createHostRoom(otherClient);
    rooms.get(targetRoom.room!.roomId)!.participants.push({
      id: 'target-participant', displayName: 'Игрок', socketId: 'target-participant-socket',
      joinedAt: 1, isConnected: true, score: 1,
    });

    let userLookupCount = 0;
    let releaseTransaction!: () => void;
    let markTransactionReached!: () => void;
    const transactionReached = new Promise<void>((resolve) => { markTransactionReached = resolve; });
    const transactionRelease = new Promise<void>((resolve) => { releaseTransaction = resolve; });
    let intercept = true;
    prisma.$use(async (params, next) => {
      if (intercept && params.model === 'HostUser' && params.action === 'findUnique' && params.args.where.id === target.user.id) {
        userLookupCount += 1;
        if (userLookupCount === 2) {
          intercept = false;
          markTransactionReached();
          await transactionRelease;
        }
      }
      return next(params);
    });

    const deletion = request(app)
      .delete('/api/auth/account')
      .set('Cookie', target.cookie)
      .set('X-Forwarded-For', '198.51.100.213')
      .send(confirmation)
      .then((response) => response);
    await transactionReached;

    await expect(hostAction(targetClient, 'ROOM_FINISH')).resolves.toMatchObject({ success: false });
    await closeRoomAfterHostTimeout(targetRoom.room!.roomId, io, new Map(), undefined, participantDisconnectTimers);
    expect(rooms.has(targetRoom.room!.roomId)).toBe(false);
    await expect(prisma.gameHistory.count({ where: { hostUserId: target.user.id } })).resolves.toBe(0);

    releaseTransaction();
    const response = await deletion;
    expect(response.status).toBe(200);
    await expect(prisma.hostUser.findUnique({ where: { id: target.user.id } })).resolves.toBeNull();
    await expect(prisma.gameHistory.count({ where: { hostUserId: target.user.id } })).resolves.toBe(0);
    expect(rooms.has(otherRoom.room!.roomId)).toBe(true);
    expect(otherClient.connected).toBe(true);
  });
});
