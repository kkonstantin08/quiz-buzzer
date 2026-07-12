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
  },
}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Validated Latency Compensation', () => {
  let hostSocket: ClientSocket;
  let p1Socket: ClientSocket;
  let p2Socket: ClientSocket;
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
    if (p2Socket && p2Socket.connected) p2Socket.disconnect();
    rooms.clear();
  });

  const createClient = () => {
    return Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
    });
  };

  const setupRoom = async (): Promise<string> => {
    (prisma.hostUser.findUnique as any).mockResolvedValue({
      id: 'host123',
      subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 10000) },
    } as any);
    const token = jwt.sign({ userId: 'host123' }, config.jwtSecret);

    hostSocket = createClient();
    p1Socket = createClient();
    p2Socket = createClient();

    hostSocket.connect();
    
    return new Promise((resolve) => {
      hostSocket.on('connect', () => {
        hostSocket.emit('ROOM_CREATE', token, (res: any) => {
          const code = res.room.roomCode;
          p1Socket.connect();
          p2Socket.connect();

          let joined = 0;
          const checkJoin = () => {
            joined++;
            if (joined === 2) resolve(code);
          };

          p1Socket.on('connect', () => p1Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'P1' }, checkJoin));
          p2Socket.on('connect', () => p2Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'P2' }, checkJoin));
        });
      });
    });
  };

  const simulateSync = async (socket: ClientSocket, offset: number, rtt: number) => {
    const cT1 = Date.now() + offset;
    return new Promise<void>((resolve) => {
      socket.emit('SYNC_TIME', cT1, async (sT1: number) => {
        await sleep(rtt); 
        const cT2 = Date.now() + offset;
        socket.emit('SYNC_ACK', { clientTime: cT1, serverTime: sT1, clientReceiveTime: cT2 });
        await sleep(10); 
        resolve();
      });
    });
  };

  it('player with high RTT but earlier clientPressedAt beats low RTT player', async () => {
    await setupRoom();

    await simulateSync(p1Socket, 100, 200);
    await simulateSync(p2Socket, 0, 20);

    await new Promise<void>((resolve) => {
      hostSocket.emit('ROUND_START', () => resolve());
    });

    const room = Array.from(rooms.values())[0];
    const unlockAt = room.unlockAt || Date.now() + 150;
    
    // Wait until unlocked
    await sleep(Math.max(0, unlockAt - Date.now()));

    const now = Date.now();
    
    // p1 has offset (client = server + 100).
    // server unlockAt is around now.
    // If p1 presses at serverTime = now + 20, clientPressedAt = now + 20 + 100 = now + 120
    // If p2 presses at serverTime = now + 40, clientPressedAt = now + 40 + 0 = now + 40
    p2Socket.emit('BUZZ_SUBMIT', { clientPressedAt: unlockAt + 40 }, () => {});
    
    await sleep(10);
    p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: unlockAt + 220 }, () => {}); 

    await sleep(300); 

    const roomAfter = Array.from(rooms.values())[0];
    const p1Participant = roomAfter.participants.find((p: any) => p.socketId === p1Socket.id);
    expect(roomAfter.firstBuzzerId).toBe(p1Participant?.id);
  });

  it('rejects timestamp earlier than unlockAt', async () => {
    await setupRoom();
    await simulateSync(p1Socket, 0, 10);
    
    await new Promise<void>((resolve) => {
      hostSocket.emit('ROUND_START', () => resolve());
    });

    const room = Array.from(rooms.values())[0];
    const unlockAt = room.unlockAt!;

    return new Promise<void>((resolve) => {
      p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: unlockAt - 100 }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/рано|early|Фальстарт/i);
        resolve();
      });
    });
  });

  it('rejects future timestamp', async () => {
    await setupRoom();
    await simulateSync(p1Socket, 0, 10);
    
    await new Promise<void>((resolve) => {
      hostSocket.emit('ROUND_START', () => resolve());
    });

    const room = Array.from(rooms.values())[0];
    const unlockAt = room.unlockAt || Date.now() + 150;
    
    // Wait until unlocked
    await sleep(Math.max(0, unlockAt - Date.now()));

    const now = Date.now();
    return new Promise<void>((resolve) => {
      p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: now + 5000 }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.error).toMatch(/будущ|future/i); 
        resolve();
      });
    });
  });

  it('concurrent buzzes within grace period - only one winner is determined', async () => {
    await setupRoom();
    await simulateSync(p1Socket, 0, 10);
    await simulateSync(p2Socket, 0, 10);
    
    await new Promise<void>((resolve) => {
      hostSocket.emit('ROUND_START', () => resolve());
    });

    const room = Array.from(rooms.values())[0];
    const unlockAt = room.unlockAt || Date.now() + 150;
    await sleep(Math.max(0, unlockAt - Date.now()));

    // Both buzz almost simultaneously
    const p1Promise = new Promise<any>((resolve) => p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: unlockAt + 20 }, resolve));
    const p2Promise = new Promise<any>((resolve) => p2Socket.emit('BUZZ_SUBMIT', { clientPressedAt: unlockAt + 22 }, resolve));

    const [r1, r2] = await Promise.all([p1Promise, p2Promise]);
    
    // Both should be accepted
    expect(r1.success).toBe(true);
    expect(r1.status).toBe('accepted');
    expect(r2.success).toBe(true);
    expect(r2.status).toBe('accepted');

    // Neither has won YET (it takes 250ms buffer)
    const roomBeforeGrace = Array.from(rooms.values())[0];
    expect(roomBeforeGrace.firstBuzzerId).toBeNull();

    await sleep(300); // Wait for grace period

    const roomAfterGrace = Array.from(rooms.values())[0];
    const p1Participant = roomAfterGrace.participants.find((p: any) => p.socketId === p1Socket.id);
    const p2Participant = roomAfterGrace.participants.find((p: any) => p.socketId === p2Socket.id);

    // Only one should win (p1 because timestamp is earlier)
    expect(roomAfterGrace.firstBuzzerId).toBe(p1Participant?.id);
  });

  it('preserves winner if they disconnect before grace period ends', async () => {
    await setupRoom();
    await simulateSync(p1Socket, 0, 10);
    
    await new Promise<void>((resolve) => {
      hostSocket.emit('ROUND_START', () => resolve());
    });

    const room = Array.from(rooms.values())[0];
    const unlockAt = room.unlockAt || Date.now() + 150;
    await sleep(Math.max(0, unlockAt - Date.now()));

    // p1 buzzes then disconnects immediately
    await new Promise<any>((resolve) => p1Socket.emit('BUZZ_SUBMIT', { clientPressedAt: unlockAt + 10 }, resolve));
    
    const p1SocketId = p1Socket.id;
    p1Socket.disconnect(); // Disconnect BEFORE 250ms grace period finishes

    await sleep(300);

    const roomAfterGrace = Array.from(rooms.values())[0];
    const p1Participant = roomAfterGrace.participants.find((p: any) => p.socketId === p1SocketId);
    
    // They should still be the winner because it uses participantId
    expect(roomAfterGrace.firstBuzzerId).toBe(p1Participant?.id);
    expect(roomAfterGrace.firstBuzzerId).not.toBeNull();
  });

});
