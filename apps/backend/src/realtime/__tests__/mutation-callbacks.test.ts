import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { server, io } from '../../server';
import { prisma } from '../../prisma';
import { rooms, socketToRoom, usedRoomCodes } from '../../rooms';
import { hostDisconnectTimers } from '../host-reconnect';
import { postFinishTimers, maxLifetimeTimers } from '../room-lifecycle';
import { participantDisconnectTimers } from '../index';
import { config } from '../../config';
import { GameResult, RoomState, type PublicParticipant, type PublicRoomData } from 'shared';

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: { findUnique: jest.fn() },
    session: { findUnique: jest.fn(), updateMany: jest.fn() },
    gameHistory: { create: jest.fn() },
  },
}));

type CallbackResult = {
  success: boolean;
  error?: string;
  room?: PublicRoomData;
  participant?: PublicParticipant;
  reconnectToken?: string;
  status?: string;
};

describe('realtime mutation callbacks and public snapshots', () => {
  let port: number;
  const sockets: ClientSocket[] = [];

  beforeAll((done) => {
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address !== 'string') port = address.port;
      done();
    });
  });

  afterAll((done) => {
    io.close();
    server.close(done);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) {
      if (socket.connected) socket.disconnect();
    }
    for (const timers of [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers]) {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    }
    for (const timer of participantDisconnectTimers.values()) clearTimeout(timer);
    participantDisconnectTimers.clear();
    rooms.clear();
    socketToRoom.clear();
    usedRoomCodes.clear();
    jest.clearAllMocks();
  });

  const client = (userId?: string, sessionId = userId && `session-${userId}`) => {
    const socket = Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
      extraHeaders: userId
        ? { Cookie: `hostToken=${encodeURIComponent(jwt.sign({ userId, sessionId }, config.jwtSecret))}` }
        : undefined,
    });
    sockets.push(socket);
    return socket;
  };

  const configureAuth = () => {
    (prisma.hostUser.findUnique as jest.Mock).mockImplementation(async (args: unknown) => {
      const { id } = (args as { where: { id: string } }).where;
      return {
        id,
        subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 60_000) },
        settings: null,
      };
    });
    (prisma.session.findUnique as jest.Mock).mockImplementation(async (args: unknown) => {
      const { id } = (args as { where: { id: string } }).where;
      return {
        id,
        userId: id.replace(/^session-/, ''),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastSeenAt: new Date(),
      };
    });
    (prisma.gameHistory.create as jest.Mock).mockResolvedValue({} as never);
  };

  const connect = (socket: ClientSocket) => new Promise<void>((resolve) => {
    socket.once('connect', () => resolve());
    socket.connect();
  });

  const emitResult = (socket: ClientSocket, event: string, ...args: unknown[]) => new Promise<CallbackResult>((resolve) => {
    socket.emit(event as never, ...args, resolve as never);
  });

  const nextSnapshot = (socket: ClientSocket, predicate: (snapshot: PublicRoomData) => boolean = () => true) =>
    new Promise<PublicRoomData>((resolve) => {
      const handler = (snapshot: PublicRoomData) => {
        if (!predicate(snapshot)) return;
        socket.off('ROOM_STATE_UPDATED', handler);
        resolve(snapshot);
      };
      socket.on('ROOM_STATE_UPDATED', handler);
    });

  const setupRoom = async (userId = 'host-a') => {
    configureAuth();
    const host = client(userId);
    await connect(host);
    const result = await emitResult(host, 'ROOM_CREATE');
    expect(result.success).toBe(true);
    const room = [...rooms.values()].find((candidate) => candidate.roomId === result.room!.roomId)!;
    return { host, room, result };
  };

  const joinRoom = async (roomCode: string, displayName = 'Игрок') => {
    const participantSocket = client();
    await connect(participantSocket);
    const resultPromise = emitResult(participantSocket, 'ROOM_JOIN', { roomCode, displayName });
    return { socket: participantSocket, result: await resultPromise };
  };

  const startRound = async (host: ClientSocket, roomId: string) => {
    const state = nextSnapshot(host, (snapshot) => snapshot.roomId === roomId && snapshot.roundState === RoomState.ACTIVE);
    const result = await emitResult(host, 'ROUND_START');
    const snapshot = await state;
    return { result, snapshot };
  };

  const expectPublicRoom = (snapshot: object) => {
    const record = snapshot as Record<string, unknown>;
    expect(record).not.toHaveProperty('hostUserId');
    expect(record).not.toHaveProperty('hostSocketId');
    expect(record).not.toHaveProperty('roundId');
    expect(record).not.toHaveProperty('historySaved');
    const participants = record.participants as Array<Record<string, unknown>>;
    for (const participant of participants) {
      expect(participant).not.toHaveProperty('socketId');
      expect(participant).not.toHaveProperty('reconnectTokenHash');
    }
  };

  it('ROOM_CREATE returns the current public room without broadcasting persistent state', async () => {
    configureAuth();
    const host = client('host-create');
    await connect(host);
    const updates: PublicRoomData[] = [];
    host.on('ROOM_STATE_UPDATED', (snapshot) => updates.push(snapshot));

    const result = await emitResult(host, 'ROOM_CREATE');
    const room = [...rooms.values()][0];

    expect(result).toEqual({ success: true, room: expect.objectContaining({ roomId: room.roomId }) });
    expect(result.room).toEqual(expect.objectContaining({ roomCode: room.roomCode, participants: [] }));
    expectPublicRoom(result.room!);
    expect(result.room).toEqual(expect.not.objectContaining({ hostSocketId: expect.anything() }));
    expect(updates).toHaveLength(0);
  });

  it('rejects ROOM_CREATE from a participant and from a connected host with a revoked session', async () => {
    const { host } = await setupRoom('host-create-auth');
    const participant = client();
    await connect(participant);
    const participantResult = await emitResult(participant, 'ROOM_CREATE');
    expect(participantResult.success).toBe(false);

    (prisma.session.findUnique as jest.Mock).mockResolvedValue({
      id: 'session-host-create-auth',
      userId: 'host-create-auth',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: new Date(),
      lastSeenAt: new Date(),
    } as never);
    const revokedResult = await emitResult(host, 'ROOM_CREATE');
    expect(revokedResult).toEqual({ success: false, error: 'Только ведущий может выполнить это действие' });
    expect(rooms.size).toBe(1);
  });

  it('ROOM_JOIN and PARTICIPANT_REJOIN return the same public shape as their authoritative snapshots', async () => {
    const { host, room } = await setupRoom();
    const hostUpdates: PublicRoomData[] = [];
    host.on('ROOM_STATE_UPDATED', (snapshot) => hostUpdates.push(snapshot));

    const joinSnapshotPromise = nextSnapshot(host, (snapshot) => snapshot.participants.length === 1);
    const joined = await joinRoom(room.roomCode, 'Alice');
    const joinSnapshot = await joinSnapshotPromise;

    expect(joined.result.success).toBe(true);
    expect(joined.result.room).toEqual(joinSnapshot);
    expect(joined.result.participant).toEqual(joinSnapshot.participants[0]);
    expectPublicRoom(joined.result.room!);
    expectPublicRoom(joinSnapshot);
    expect(hostUpdates).toHaveLength(1);

    const oldParticipantId = joined.result.participant!.id;
    const reconnectToken = joined.result.reconnectToken!;
    const disconnectSnapshot = nextSnapshot(host, (snapshot) => snapshot.participants[0]?.isConnected === false);
    joined.socket.disconnect();
    await disconnectSnapshot;

    const replacement = client();
    await connect(replacement);
    const rejoinSnapshot = nextSnapshot(host, (snapshot) => snapshot.participants[0]?.isConnected === true);
    const rejoinResult = await emitResult(replacement, 'PARTICIPANT_REJOIN', {
      roomCode: room.roomCode,
      participantId: oldParticipantId,
      reconnectToken,
    });
    const authoritative = await rejoinSnapshot;

    expect(rejoinResult).toEqual({ success: true, participant: authoritative.participants[0], room: authoritative });
    expectPublicRoom(rejoinResult.room!);
    expectPublicRoom(authoritative);
  });

  it('HOST_REJOIN_ROOM returns one authoritative public snapshot and restores control', async () => {
    const { host, room } = await setupRoom();
    const { socket: participant } = await joinRoom(room.roomCode);

    const disconnected = nextSnapshot(participant, (snapshot) => snapshot.isHostConnected === false);
    host.disconnect();
    await disconnected;

    const replacement = client('host-a');
    await connect(replacement);
    const updates: PublicRoomData[] = [];
    const onUpdate = (snapshot: PublicRoomData) => updates.push(snapshot);
    participant.on('ROOM_STATE_UPDATED', onUpdate);
    const restored = nextSnapshot(participant, (snapshot) => snapshot.isHostConnected === true);
    const result = await emitResult(replacement, 'HOST_REJOIN_ROOM', { roomId: room.roomId });
    const snapshot = await restored;
    participant.off('ROOM_STATE_UPDATED', onUpdate);

    expect(result).toEqual({ success: true, room: snapshot });
    expect(updates).toHaveLength(1);
    expectPublicRoom(result.room!);
    expectPublicRoom(snapshot);
  });

  it('ROUND_START, ROUND_RESET, HOST_CLEAR_SCORES and ROOM_FINISH each callback only after their state mutation', async () => {
    const { host, room } = await setupRoom();
    const { socket: participant } = await joinRoom(room.roomCode);
    room.participants[0].score = 4;

    const start = await startRound(host, room.roomId);
    expect(start.result).toEqual({ success: true });
    expect(start.snapshot.roundState).toBe(RoomState.ACTIVE);
    expect(room.roundState).toBe(RoomState.ACTIVE);

    await new Promise((resolve) => setTimeout(resolve, Math.max(0, (start.snapshot.unlockAt ?? Date.now()) - Date.now() + 20)));
    const revealedSnapshot = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.REVEALED);
    const buzzResult = await emitResult(participant, 'BUZZ_SUBMIT', { clientPressedAt: Date.now() });
    const revealed = { buzzResult, snapshot: await revealedSnapshot };
    expect(revealed.buzzResult).toEqual({ success: true, status: 'accepted' });
    expect(revealed.snapshot.firstBuzzerId).toBe(room.participants[0].id);

    const resetSnapshot = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.WAITING);
    const resetResult = await emitResult(host, 'ROUND_RESET', { winnerId: room.participants[0].id });
    const reset = await resetSnapshot;
    expect(resetResult).toEqual({ success: true });
    expect(reset.roundState).toBe(RoomState.WAITING);
    expect(room.participants[0].score).toBe(5);

    const clearSnapshot = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.WAITING && snapshot.participants[0].score === 0);
    const clearResult = await emitResult(host, 'HOST_CLEAR_SCORES');
    const cleared = await clearSnapshot;
    expect(clearResult).toEqual({ success: true });
    expect(cleared.participants[0].score).toBe(0);

    room.participants[0].score = 5;
    const finishSnapshot = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.FINISHED);
    const finishResult = await emitResult(host, 'ROOM_FINISH');
    const finished = await finishSnapshot;
    expect(finishResult).toEqual({ success: true });
    expect(finished).toMatchObject({
      roundState: RoomState.FINISHED,
      gameResult: GameResult.WINNER,
      winnerName: 'Игрок',
    });
    expectPublicRoom(finished);
    expect(prisma.gameHistory.create).toHaveBeenCalledTimes(1);
  });

  it('emits exactly one state snapshot for each successful persistent mutation', async () => {
    const { host, room } = await setupRoom();
    const { socket: participant } = await joinRoom(room.roomCode);
    const updates: PublicRoomData[] = [];
    const handler = (snapshot: PublicRoomData) => updates.push(snapshot);
    host.on('ROOM_STATE_UPDATED', handler);

    const active = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.ACTIVE);
    await emitResult(host, 'ROUND_START');
    await active;
    expect(updates).toHaveLength(1);
    updates.length = 0;

    await new Promise((resolve) => setTimeout(resolve, 180));
    const revealed = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.REVEALED);
    await emitResult(participant, 'BUZZ_SUBMIT', { clientPressedAt: Date.now() });
    await revealed;
    expect(updates).toHaveLength(1);
    updates.length = 0;

    const reset = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.WAITING);
    await emitResult(host, 'ROUND_RESET');
    await reset;
    expect(updates).toHaveLength(1);
    updates.length = 0;

    const clear = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.WAITING);
    await emitResult(host, 'HOST_CLEAR_SCORES');
    await clear;
    expect(updates).toHaveLength(1);
    host.off('ROOM_STATE_UPDATED', handler);
  });

  it('rejects malformed mutation payloads without changing room state', async () => {
    const createSocket = client('host-malformed');
    await connect(createSocket);
    const createResult = await emitResult(createSocket, 'ROOM_CREATE', { unexpected: true });
    expect(createResult).toEqual({ success: false, error: 'Некорректные данные' });
    expect(rooms.size).toBe(0);

    const { host, room } = await setupRoom();
    const { socket: participant } = await joinRoom(room.roomCode);
    const before = { ...room, participants: room.participants.map((item) => ({ ...item })) };
    const invalidCalls: Array<Promise<CallbackResult>> = [
      emitResult(participant, 'PARTICIPANT_REJOIN', { roomCode: room.roomCode, participantId: 'not-an-id', reconnectToken: 'token', extra: true }),
      emitResult(participant, 'BUZZ_SUBMIT', { clientPressedAt: 'now' }),
      emitResult(host, 'ROUND_START', { extra: true }),
      emitResult(host, 'ROUND_RESET', { winnerId: 42 }),
      emitResult(host, 'HOST_CLEAR_SCORES', { extra: true }),
      emitResult(host, 'ROOM_FINISH', { extra: true }),
    ];
    const results = await Promise.all(invalidCalls);

    expect(results).toHaveLength(6);
    expect(results.every((result) => result.success === false && result.error === 'Некорректные данные')).toBe(true);
    expect(room.roundState).toBe(before.roundState);
    expect(room.firstBuzzerId).toBe(before.firstBuzzerId);
    expect(room.participants.map((item) => item.score)).toEqual(before.participants.map((item) => item.score));
  });

  it('rejects PARTICIPANT_REJOIN from a host socket without changing participant control', async () => {
    const { host, room } = await setupRoom();
    const joined = await joinRoom(room.roomCode);

    const result = await emitResult(host, 'PARTICIPANT_REJOIN', {
      roomCode: room.roomCode,
      participantId: joined.result.participant!.id,
      reconnectToken: joined.result.reconnectToken!,
    });

    expect(result).toEqual({ success: false, error: 'Ведущий не может стать участником' });
    expect(room.hostSocketId).toBe(host.id);
    expect(room.participants[0].socketId).toBe(joined.socket.id);
    expect(room.participants[0].isConnected).toBe(true);
  });

  it('rejects wrong roles and invalid state without authoritative snapshots', async () => {
    const { host, room } = await setupRoom();
    const { socket: participant } = await joinRoom(room.roomCode);
    const updates: PublicRoomData[] = [];
    host.on('ROOM_STATE_UPDATED', (snapshot) => updates.push(snapshot));

    const roleResults = await Promise.all([
      emitResult(participant, 'ROUND_START'),
      emitResult(participant, 'ROUND_RESET'),
      emitResult(participant, 'HOST_CLEAR_SCORES'),
      emitResult(participant, 'ROOM_FINISH'),
      emitResult(host, 'BUZZ_SUBMIT', { clientPressedAt: Date.now() }),
    ]);
    expect(roleResults.every((result) => result.success === false)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(updates).toHaveLength(0);

    const active = await startRound(host, room.roomId);
    expect(active.result.success).toBe(true);
    const invalidStart = await emitResult(host, 'ROUND_START');
    const invalidReset = await emitResult(host, 'ROUND_RESET');
    expect(invalidStart.success).toBe(false);
    expect(invalidReset.success).toBe(false);
    expect(room.roundState).toBe(RoomState.ACTIVE);
  });

  it('keeps independent rooms isolated for state broadcasts and mutations', async () => {
    configureAuth();
    const hostA = client('host-a');
    const hostB = client('host-b');
    await Promise.all([connect(hostA), connect(hostB)]);
    const roomAResult = await emitResult(hostA, 'ROOM_CREATE');
    const roomBResult = await emitResult(hostB, 'ROOM_CREATE');
    const roomA = [...rooms.values()].find((room) => room.roomId === roomAResult.room!.roomId)!;
    const roomB = [...rooms.values()].find((room) => room.roomId === roomBResult.room!.roomId)!;
    const stateA = nextSnapshot(hostA, (snapshot) => snapshot.participants.length === 1);
    const participant = await joinRoom(roomA.roomCode);
    const hostBUpdates: PublicRoomData[] = [];
    hostB.on('ROOM_STATE_UPDATED', (snapshot) => hostBUpdates.push(snapshot));

    await stateA;
    const startA = await startRound(hostA, roomA.roomId);

    expect(startA.snapshot.roomId).toBe(roomA.roomId);
    expect(roomA.roundState).toBe(RoomState.ACTIVE);
    expect(roomB.roundState).toBe(RoomState.WAITING);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hostBUpdates).toHaveLength(0);
    expect(participant.result.success).toBe(true);
  });

  it('allows a callback-less successful mutation and keeps the authoritative state event', async () => {
    const { host, room } = await setupRoom();
    const state = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.ACTIVE);
    host.emit('ROUND_START');
    const snapshot = await state;
    expect(snapshot.roundState).toBe(RoomState.ACTIVE);
    expect(room.roundState).toBe(RoomState.ACTIVE);
  });

  it('serializes concurrent ROUND_START calls as one success and one state transition', async () => {
    const { host, room } = await setupRoom();
    const updates: PublicRoomData[] = [];
    host.on('ROOM_STATE_UPDATED', (snapshot) => updates.push(snapshot));
    const active = nextSnapshot(host, (snapshot) => snapshot.roundState === RoomState.ACTIVE);
    const results = await Promise.all([
      emitResult(host, 'ROUND_START'),
      emitResult(host, 'ROUND_START'),
    ]);
    await active;

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toHaveLength(1);
    expect(updates).toHaveLength(1);
    expect(room.roundState).toBe(RoomState.ACTIVE);
  });
});
