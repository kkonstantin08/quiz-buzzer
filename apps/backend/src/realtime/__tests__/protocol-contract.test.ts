import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { expect, describe, it, jest } from '@jest/globals';
import { RoomState, type InternalRoomData } from 'shared';
import { emitRoomState, toPublicRoomData } from '../index';
import { withValidation } from '../validation';

const backendRoot = process.cwd();
const readSource = (...parts: string[]) => readFileSync(resolve(backendRoot, ...parts), 'utf8');
const eventNames = (source: string, method: 'on' | 'emit') =>
  new Set([...source.matchAll(new RegExp(`\\.${method}\\(\\s*['\"]([A-Z_]+)['\"]`, 'g'))].map((match) => match[1]));

const clientToServerEvents = new Set([
  'ROOM_CREATE', 'ROOM_JOIN', 'PARTICIPANT_REJOIN', 'ROUND_START', 'BUZZ_SUBMIT',
  'ROUND_RESET', 'ROOM_FINISH', 'ROOM_LEAVE', 'SYNC_TIME',
  'SYNC_ACK', 'HOST_CLEAR_SCORES', 'HOST_REJOIN_ROOM',
]);
const serverToClientEvents = new Set([
  'ROOM_STATE_UPDATED', 'ERROR_EVENT', 'HOST_CONTROL_REVOKED',
  'PARTICIPANT_CONTROL_REVOKED', 'ROOM_CLOSED',
]);

describe('Socket.IO protocol contract', () => {
  it('exposes only supported round states', () => {
    expect(Object.values(RoomState)).toEqual(['WAITING', 'ACTIVE', 'REVEALED', 'FINISHED']);
  });

  it('maps every shared client event to a backend handler and every frontend producer to the shared map', () => {
    const realtimeSource = readSource('src/realtime/index.ts');
    const backendHandlers = eventNames(realtimeSource, 'on');
    for (const event of clientToServerEvents) {
      expect(backendHandlers).toContain(event);
    }

    const frontendSources = [
      readSource('..', 'frontend/src/pages/ParticipantRoom.tsx'),
      readSource('..', 'frontend/src/pages/HostRoom.tsx'),
      readSource('..', 'frontend/src/pages/HostDashboard.tsx'),
      readSource('..', 'frontend/src/pages/HostSettings.tsx'),
      readSource('..', 'frontend/src/realtime/timeSync.ts'),
    ];
    const frontendEvents = new Set(frontendSources.flatMap((source) => [...eventNames(source, 'emit')]));
    for (const event of frontendEvents) {
      expect(clientToServerEvents).toContain(event);
    }
    expect(frontendEvents).toContain('HOST_CLEAR_SCORES');
  });

  it('defines ROOM_CREATE as a callback-only event without a token schema', () => {
    const sharedSource = readSource('..', '..', 'packages/shared/src/index.ts');
    const schemaSource = readSource('..', '..', 'packages/shared/src/schemas.ts');

    expect(sharedSource).toContain('ROOM_CREATE: (callback: (res: RoomCreateResult) => void) => void;');
    expect(sharedSource).not.toContain('ROOM_CREATE: (token: string');
    expect(schemaSource).not.toContain('RoomCreateSchema');
  });

  it('has a producer for every shared server event and sends persistent state only through emitRoomState', () => {
    const realtimeSource = readSource('src/realtime/index.ts');
    const producerSources = [
      realtimeSource,
      readSource('src/realtime/validation.ts'),
      readSource('src/realtime/host-reconnect.ts'),
      readSource('src/rooms/index.ts'),
    ];
    const emittedEvents = new Set(producerSources.flatMap((source) => [...eventNames(source, 'emit')]));
    for (const event of serverToClientEvents) {
      expect(emittedEvents).toContain(event);
    }
    expect([...realtimeSource.matchAll(/['"]ROOM_STATE_UPDATED['"]/g)]).toHaveLength(1);
    expect(realtimeSource).toContain("io.to(room.roomId).emit('ROOM_STATE_UPDATED', toPublicRoomData(room))");
  });

  it('serializes public state for broadcasts and strips every internal field', () => {
    const internalRoom: InternalRoomData = {
      roomId: 'room-1', roomCode: 'ABC123', hostUserId: 'host-1', hostSocketId: 'host-socket',
      participants: [{
        id: 'participant-1', displayName: 'Игрок', socketId: 'participant-socket', joinedAt: 1,
        isConnected: true, score: 3, reconnectTokenHash: 'secret',
      }],
      roundState: 'ACTIVE' as InternalRoomData['roundState'], firstBuzzerId: null, createdAt: 1,
      roundId: 'round-secret', historySaved: true, unlockAt: 2, isHostConnected: true,
    };
    const emit = jest.fn();
    const to = jest.fn((_roomId: string) => ({ emit }));
    const io = { to };

    emitRoomState(io as never, internalRoom);

    expect(to).toHaveBeenCalledWith('room-1');
    expect(emit).toHaveBeenCalledWith('ROOM_STATE_UPDATED', toPublicRoomData(internalRoom));
    const snapshot = toPublicRoomData(internalRoom);
    expect(snapshot).not.toHaveProperty('hostSocketId');
    expect(snapshot).not.toHaveProperty('hostUserId');
    expect(snapshot).not.toHaveProperty('roundId');
    expect(snapshot.participants[0]).not.toHaveProperty('socketId');
    expect(snapshot.participants[0]).not.toHaveProperty('reconnectTokenHash');
  });

  it('emits the shared ERROR_EVENT object when validation fails without a callback', () => {
    const emit = jest.fn();
    const listener = withValidation(z.object({ value: z.number() }).strict(), 'TEST_EVENT', jest.fn());

    listener.call({ id: 'socket-1', emit } as never, { value: 'invalid' });

    expect(emit).toHaveBeenCalledWith('ERROR_EVENT', { message: 'Некорректные данные' });
  });
});
