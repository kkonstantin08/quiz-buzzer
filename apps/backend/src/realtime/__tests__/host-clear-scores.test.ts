import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { io, server } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import { rooms } from '../../rooms';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { type PublicRoomData, type SocketActionResult } from 'shared';

jest.mock('../../prisma', () => ({
  prisma: { hostUser: { findUnique: jest.fn() } },
}));

type FindUniqueMock = {
  mockResolvedValue(value: unknown): void;
};

describe('HOST_CLEAR_SCORES', () => {
  let port: number;
  let hostSocket: ClientSocket;
  let participantSocket: ClientSocket;
  let replacementHostSocket: ClientSocket;
  let secondHostSocket: ClientSocket;

  beforeAll((done) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== 'string') port = address.port;
      done();
    });
  });

  afterEach(() => {
    for (const socket of [hostSocket, participantSocket, replacementHostSocket, secondHostSocket]) {
      if (socket?.connected) socket.disconnect();
    }
    rooms.clear();
    jest.clearAllMocks();
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  const createClient = (token?: string) => Client(`http://localhost:${port}`, {
    transports: ['websocket'],
    autoConnect: false,
    auth: token ? { token } : undefined,
  });

  const connect = (socket: ClientSocket) => new Promise<void>((resolve) => {
    socket.once('connect', () => resolve());
    socket.connect();
  });

  const createRoom = async (hostId: string) => {
    const findUnique = prisma.hostUser.findUnique as unknown as FindUniqueMock;
    findUnique.mockResolvedValue({
      id: hostId,
      subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 60_000) },
    });
    const token = jwt.sign({ userId: hostId }, config.jwtSecret);
    const socket = createClient();
    await connect(socket);
    const result = await new Promise<{ room: PublicRoomData }>((resolve) => {
      socket.emit('ROOM_CREATE', token, resolve);
    });
    return { socket, room: result.room, token };
  };

  const joinRoom = async (socket: ClientSocket, roomCode: string) => {
    await connect(socket);
    return new Promise<{ participant: { id: string } }>((resolve) => {
      socket.emit('ROOM_JOIN', { roomCode, displayName: 'Игрок' }, resolve);
    });
  };

  const clearScores = (socket: ClientSocket) => new Promise<SocketActionResult>((resolve) => {
    socket.emit('HOST_CLEAR_SCORES', resolve);
  });

  it('lets the current host clear scores and emits one public snapshot', async () => {
    const created = await createRoom('host-1');
    hostSocket = created.socket;
    participantSocket = createClient();
    await joinRoom(participantSocket, created.room.roomCode);

    const room = rooms.get(created.room.roomId)!;
    room.participants[0].score = 7;
    const snapshots: PublicRoomData[] = [];
    const snapshotPromise = new Promise<PublicRoomData>((resolve) => {
      participantSocket.on('ROOM_STATE_UPDATED', (snapshot) => {
        snapshots.push(snapshot);
        resolve(snapshot);
      });
    });

    const result = await clearScores(hostSocket);
    const snapshot = await snapshotPromise;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result).toEqual({ success: true });
    expect(room.participants[0].score).toBe(0);
    expect(room.firstBuzzerId).toBeNull();
    expect(snapshots).toHaveLength(1);
    expect(snapshot).toMatchObject({ roomId: room.roomId, participants: [{ score: 0 }] });
    expect(snapshot).not.toHaveProperty('hostSocketId');
    expect(snapshot.participants[0]).not.toHaveProperty('socketId');
  });

  it('rejects a participant without changing scores', async () => {
    const created = await createRoom('host-1');
    hostSocket = created.socket;
    participantSocket = createClient();
    await joinRoom(participantSocket, created.room.roomCode);

    const room = rooms.get(created.room.roomId)!;
    room.participants[0].score = 4;

    await expect(clearScores(participantSocket)).resolves.toMatchObject({ success: false });
    expect(room.participants[0].score).toBe(4);
  });

  it('rejects a revoked host socket', async () => {
    const created = await createRoom('host-1');
    hostSocket = created.socket;
    replacementHostSocket = createClient(created.token);
    await connect(replacementHostSocket);

    await new Promise<void>((resolve) => {
      replacementHostSocket.emit('HOST_REJOIN_ROOM', { roomId: created.room.roomId }, () => resolve());
    });

    await expect(clearScores(hostSocket)).resolves.toMatchObject({ success: false });
  });

  it('does not modify another room', async () => {
    const first = await createRoom('host-1');
    hostSocket = first.socket;
    const second = await createRoom('host-2');
    secondHostSocket = second.socket;

    const firstRoom = rooms.get(first.room.roomId)!;
    const secondRoom = rooms.get(second.room.roomId)!;
    firstRoom.participants.push({
      id: 'first-player', displayName: 'Первый', socketId: 'first', joinedAt: 1,
      isConnected: true, score: 9,
    });
    secondRoom.participants.push({
      id: 'second-player', displayName: 'Второй', socketId: 'second', joinedAt: 1,
      isConnected: true, score: 11,
    });

    await expect(clearScores(hostSocket)).resolves.toEqual({ success: true });
    expect(firstRoom.participants[0].score).toBe(0);
    expect(secondRoom.participants[0].score).toBe(11);
  });
});
