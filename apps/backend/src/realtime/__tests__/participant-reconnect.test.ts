import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms, getRoomByCode } from '../../rooms';
import { participantDisconnectTimers } from '../index';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(),
    },
  },
}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Participant Reconnect', () => {
  let hostSocket: ClientSocket;
  let p1Socket: ClientSocket;
  let port: number;

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
    rooms.clear();
    for (const timer of participantDisconnectTimers.values()) {
      clearTimeout(timer);
    }
    participantDisconnectTimers.clear();
  });

  const createClient = () => {
    return Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
    });
  };

  const setupRoom = async (): Promise<{ code: string; p1ParticipantId: string; p1Token: string }> => {
    (prisma.hostUser.findUnique as any).mockResolvedValue({
      id: 'host123',
      subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 10000) },
    } as any);
    const token = jwt.sign({ userId: 'host123' }, config.jwtSecret);

    hostSocket = createClient();
    p1Socket = createClient();

    hostSocket.connect();
    
    return new Promise((resolve) => {
      hostSocket.on('connect', () => {
        hostSocket.emit('ROOM_CREATE', token, (res: any) => {
          const code = res.room.roomCode;
          p1Socket.connect();

          p1Socket.on('connect', () => {
            p1Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'P1' }, (res2: any) => {
              resolve({ code, p1ParticipantId: res2.participant.id, p1Token: res2.reconnectToken });
            });
          });
        });
      });
    });
  };

  it('disconnecting sets isConnected=false and starts 5m timer', async () => {
    const { code, p1ParticipantId } = await setupRoom();
    
    const room = getRoomByCode(code)!;
    expect(room.participants[0].isConnected).toBe(true);
    
    p1Socket.disconnect();
    await sleep(50); // wait for disconnect to propagate

    expect(room.participants[0].isConnected).toBe(false);
    
    // Timer should be active
    const timerKey = `${room.roomId}_${p1ParticipantId}`;
    expect(participantDisconnectTimers.has(timerKey)).toBe(true);
  });

  it('PARTICIPANT_REJOIN with valid token reconnects participant', async () => {
    const { code, p1ParticipantId, p1Token } = await setupRoom();
    const room = getRoomByCode(code)!;
    
    p1Socket.disconnect();
    await sleep(50);
    
    expect(room.participants[0].isConnected).toBe(false);
    
    // Now reconnect
    const newSocket = createClient();
    newSocket.connect();
    
    await new Promise<void>((resolve) => {
      newSocket.on('connect', () => {
        newSocket.emit('PARTICIPANT_REJOIN', { roomCode: code, participantId: p1ParticipantId, reconnectToken: p1Token }, (res: any) => {
          expect(res.success).toBe(true);
          expect(res.participant.id).toBe(p1ParticipantId);
          expect(res.participant.isConnected).toBe(true);
          resolve();
        });
      });
    });

    expect(room.participants[0].isConnected).toBe(true);
    expect(room.participants[0].socketId).toBe(newSocket.id);
    
    // Timer should be cleared
    const timerKey = `${room.roomId}_${p1ParticipantId}`;
    expect(participantDisconnectTimers.has(timerKey)).toBe(false);

    newSocket.disconnect();
  });

  it('PARTICIPANT_REJOIN from a different socket revokes control from the old active socket', async () => {
    const { code, p1ParticipantId, p1Token } = await setupRoom();
    const room = getRoomByCode(code)!;
    
    // p1Socket is still connected!
    expect(room.participants[0].isConnected).toBe(true);
    
    // Now connect from a new socket
    const newSocket = createClient();
    newSocket.connect();
    
    let revoked = false;
    p1Socket.on('PARTICIPANT_CONTROL_REVOKED', () => {
      revoked = true;
    });
    
    await new Promise<void>((resolve) => {
      newSocket.on('connect', () => {
        newSocket.emit('PARTICIPANT_REJOIN', { roomCode: code, participantId: p1ParticipantId, reconnectToken: p1Token }, (res: any) => {
          expect(res.success).toBe(true);
          resolve();
        });
      });
    });

    await sleep(50); // let events propagate

    expect(revoked).toBe(true);
    expect(room.participants[0].isConnected).toBe(true);
    expect(room.participants[0].socketId).toBe(newSocket.id);

    newSocket.disconnect();
  });

  it('PARTICIPANT_REJOIN with invalid token fails', async () => {
    const { code, p1ParticipantId } = await setupRoom();
    
    p1Socket.disconnect();
    await sleep(50);
    
    const newSocket = createClient();
    newSocket.connect();
    
    await new Promise<void>((resolve) => {
      newSocket.on('connect', () => {
        newSocket.emit('PARTICIPANT_REJOIN', { roomCode: code, participantId: p1ParticipantId, reconnectToken: 'invalid_token_123' }, (res: any) => {
          expect(res.success).toBe(false);
          expect(res.error).toBe('Неверный токен восстановления');
          resolve();
        });
      });
    });

    newSocket.disconnect();
  });
});
