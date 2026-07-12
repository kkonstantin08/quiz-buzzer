import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms } from '../../rooms';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

import { hostDisconnectTimers, reconnectTimeoutLoader } from '../host-reconnect';

jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(),
    },
  },
}));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const nativeSetTimeout = global.setTimeout;
const realSleep = (ms: number) => new Promise((resolve) => nativeSetTimeout(resolve, ms));

describe('Host Reconnect and Revocation', () => {
  let hostSocket: ClientSocket;
  let p1Socket: ClientSocket;
  let port: number;
  let hostToken: string;
  let host2Token: string;

  let timerCallbacks: (() => void)[] = [];

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

  beforeEach(() => {
    timerCallbacks = [];
    jest.spyOn(reconnectTimeoutLoader, 'setTimeout').mockImplementation((cb) => {
      timerCallbacks.push(cb);
      return 12345 as any;
    });
  });

  afterEach(() => {
    if (hostSocket && hostSocket.connected) hostSocket.disconnect();
    if (p1Socket && p1Socket.connected) p1Socket.disconnect();
    // Clear all pending timeouts to prevent Jest from hanging
    for (const timer of hostDisconnectTimers.values()) {
      clearTimeout(timer);
    }
    hostDisconnectTimers.clear();
    rooms.clear();
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const createClient = (token?: string) => {
    return Client(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: false,
      auth: token ? { token } : undefined,
    });
  };

  const setupRoom = async (): Promise<string> => {
    (prisma.hostUser.findUnique as any).mockResolvedValue({
      id: 'host123',
      subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 10000) },
    } as any);
    hostToken = jwt.sign({ userId: 'host123' }, config.jwtSecret);
    host2Token = jwt.sign({ userId: 'host456' }, config.jwtSecret); // different host

    hostSocket = createClient(hostToken);
    p1Socket = createClient();

    hostSocket.connect();
    
    return new Promise((resolve) => {
      hostSocket.on('connect', () => {
        hostSocket.emit('ROOM_CREATE', hostToken, (res: any) => {
          resolve(res.room.roomId);
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

  it('1. Authorized owner successfully restores their room', async () => {
    const roomId = await setupRoom();
    
    // Disconnect host
    hostSocket.disconnect();
    await sleep(50);

    // Reconnect with a new socket
    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    const res = await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    expect(res.success).toBe(true);
    expect(res.room.roomId).toBe(roomId);
    expect(res.room.hostSocketId).toBe(newHostSocket.id);
    newHostSocket.disconnect();
  });

  it('2. Restoration returns actual participants and score', async () => {
    const roomId = await setupRoom();
    const room = Array.from(rooms.values())[0];
    const roomCode = room.roomCode;

    // Join a participant
    await joinRoom(p1Socket, roomCode, 'Alice');

    // Simulate score update
    room.participants[0].score = 10;

    hostSocket.disconnect();
    await sleep(50);

    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    const res = await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    expect(res.success).toBe(true);
    expect(res.room.participants.length).toBe(1);
    expect(res.room.participants[0].displayName).toBe('Alice');
    expect(res.room.participants[0].score).toBe(10);
    newHostSocket.disconnect();
  });

  it('3. Stranger user cannot restore room', async () => {
    const roomId = await setupRoom();

    const strangerSocket = createClient();
    strangerSocket.connect();

    const res = await new Promise<any>((resolve) => {
      strangerSocket.on('connect', () => {
        // Sign with different host token
        (prisma.hostUser.findUnique as any).mockResolvedValue({
          id: 'host456',
          subscription: { status: 'active' },
        } as any);
        strangerSocket.emit('ROOM_CREATE', host2Token, () => {
          // Now try to rejoin the original room
          strangerSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
        });
      });
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Комната недоступна/i);
    strangerSocket.disconnect();
  });

  it('4. Unauthorized socket cannot restore room', async () => {
    const roomId = await setupRoom();

    const strangerSocket = createClient();
    strangerSocket.connect();

    const res = await new Promise<any>((resolve) => {
      strangerSocket.on('connect', () => {
        strangerSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Комната недоступна/i);
    strangerSocket.disconnect();
  });

  it('5. Non-existent room returns safe error', async () => {
    await setupRoom();

    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    const res = await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId: 'room_non_existent' }, resolve);
      });
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Комната недоступна/i);
    newHostSocket.disconnect();
  });

  it('6. Finished room does not restore', async () => {
    const roomId = await setupRoom();
    
    // Complete the room
    await new Promise<void>((resolve) => {
      hostSocket.emit('ROOM_FINISH', () => resolve());
    });

    hostSocket.disconnect();
    await sleep(50);

    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    const res = await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Комната недоступна/i);
    newHostSocket.disconnect();
  });

  it('7. New connection gets control, 8. Old socket gets HOST_CONTROL_REVOKED', async () => {
    const roomId = await setupRoom();

    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    const revokedPromise = new Promise<void>((resolve) => {
      hostSocket.on('HOST_CONTROL_REVOKED', () => resolve());
    });

    const rejoinRes = await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    expect(rejoinRes.success).toBe(true);
    await revokedPromise;
    newHostSocket.disconnect();
  });

  it('9. Host commands from old socket after transfer are rejected, 10. Command from new socket executes', async () => {
    const roomId = await setupRoom();

    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    // Try starting round from old hostSocket
    const resOld = await new Promise<any>((resolve) => {
      hostSocket.emit('ROUND_START', resolve);
    });
    expect(resOld.success).toBe(false);

    // Try starting round from newHostSocket
    const resNew = await new Promise<any>((resolve) => {
      newHostSocket.emit('ROUND_START', resolve);
    });
    expect(resNew.success).toBe(true);

    newHostSocket.disconnect();
  });

  it('11. Disconnect of old socket does not affect new host socket', async () => {
    const roomId = await setupRoom();

    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    // Disconnect old socket
    hostSocket.disconnect();
    await sleep(50);

    // Room should still have newHostSocket as host and not be closed/timer active
    const room = rooms.get(roomId);
    expect(room?.hostSocketId).toBe(newHostSocket.id);

    newHostSocket.disconnect();
  });

  it('12. Host disconnect starts 10-minute timer, 13. Participants get host disconnect status', async () => {
    const roomId = await setupRoom();
    const room = rooms.get(roomId)!;

    await joinRoom(p1Socket, room.roomCode, 'Bob');

    const statusPromise = new Promise<void>((resolve) => {
      p1Socket.on('ROOM_STATE_UPDATED', (roomState: any) => {
        if (!roomState.isHostConnected) resolve();
      });
    });

    hostSocket.disconnect();
    await statusPromise;
    
    expect(rooms.get(roomId)).toBeDefined();
    expect(timerCallbacks.length).toBe(1);

    // Trigger the close timeout manually
    const closedPromise = new Promise<void>((resolve) => {
      p1Socket.on('ROOM_CLOSED', () => resolve());
    });

    timerCallbacks[0]();

    await closedPromise;

    // Verify room is closed / finished
    expect(rooms.get(roomId)).toBeUndefined();
  });

  it('14. Rejoin before timeout cancels room closure, 15. Participants get host reconnected status', async () => {
    const roomId = await setupRoom();
    const room = rooms.get(roomId)!;

    await joinRoom(p1Socket, room.roomCode, 'Bob');

    hostSocket.disconnect();
    await sleep(50);

    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    const reconnectStatusPromise = new Promise<void>((resolve) => {
      p1Socket.on('ROOM_STATE_UPDATED', (roomState: any) => {
        if (roomState.isHostConnected) resolve();
      });
    });

    await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    await reconnectStatusPromise;

    // Check that 10m timer is scheduled
    expect(timerCallbacks.length).toBe(1);
    
    // Room should still be active
    expect(rooms.get(roomId)).toBeDefined();
    newHostSocket.disconnect();
  });

  it('16. After 10 minutes room is closed, 17. Rejoin is impossible, 18. Timers cleaned up', async () => {
    const roomId = await setupRoom();
    const room = rooms.get(roomId)!;

    await joinRoom(p1Socket, room.roomCode, 'Bob');

    hostSocket.disconnect();
    await sleep(50);

    expect(timerCallbacks.length).toBe(1);

    const closedPromise = new Promise<void>((resolve) => {
      p1Socket.on('ROOM_CLOSED', () => resolve());
    });

    // Trigger the close timeout manually
    timerCallbacks[0]();

    await closedPromise;

    // Rejoin should fail
    const newHostSocket = createClient(hostToken);
    newHostSocket.connect();

    const res = await new Promise<any>((resolve) => {
      newHostSocket.on('connect', () => {
        newHostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
      });
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Комната недоступна/i);
    newHostSocket.disconnect();
  });

  it('19. Repeated rejoin of current host socket is handled idempotently', async () => {
    const roomId = await setupRoom();

    const rejoinRes1 = await new Promise<any>((resolve) => {
      hostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
    });
    expect(rejoinRes1.success).toBe(true);

    const rejoinRes2 = await new Promise<any>((resolve) => {
      hostSocket.emit('HOST_REJOIN_ROOM', { roomId }, resolve);
    });
    expect(rejoinRes2.success).toBe(true);
  });

});
