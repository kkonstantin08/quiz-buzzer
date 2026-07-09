import { server, io } from '../../server';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { prisma } from '../../prisma';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { rooms } from '../../rooms';
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';

// Mock Prisma so we don't hit the real database
jest.mock('../../prisma', () => ({
  prisma: {
    hostUser: {
      findUnique: jest.fn(),
    },
  },
}));

describe('Socket.IO Realtime Logic', () => {
  let hostSocket: ClientSocket;
  let p1Socket: ClientSocket;
  let p2Socket: ClientSocket;
  let port: number;
  let createdRoomCode: string;

  beforeAll((done) => {
    // Start ephemeral server
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

  it('should allow host to create a room and participants to join', (done) => {
    // 1. Mock DB response for Host login check
    (prisma.hostUser.findUnique as any).mockResolvedValue({
      id: 'mock_host_id',
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 100000000), // Future date
      },
    } as any);

    // Generate a valid mock JWT token
    const mockToken = jwt.sign({ userId: 'mock_host_id' }, config.jwtSecret);

    hostSocket = createClient();
    hostSocket.connect();

    hostSocket.on('connect', () => {
      hostSocket.emit('ROOM_CREATE', mockToken, (res: any) => {
        expect(res.success).toBe(true);
        expect(res.room).toBeDefined();
        createdRoomCode = res.room.roomCode;

        // 2. Connect Participant 1
        p1Socket = createClient();
        p1Socket.connect();

        p1Socket.on('connect', () => {
          p1Socket.emit('ROOM_JOIN', { roomCode: createdRoomCode, displayName: 'Player 1' }, (joinRes: any) => {
            expect(joinRes.success).toBe(true);
            expect(joinRes.participant.displayName).toBe('Player 1');
            
            // 3. Connect Participant 2
            p2Socket = createClient();
            p2Socket.connect();

            p2Socket.on('connect', () => {
              p2Socket.emit('ROOM_JOIN', { roomCode: createdRoomCode, displayName: 'Player 2' }, (joinRes2: any) => {
                expect(joinRes2.success).toBe(true);
                expect(joinRes2.room.participants.length).toBe(2);
                done();
              });
            });
          });
        });
      });
    });
  });

  it('should handle round race condition correctly', (done) => {
    // Assume room is already created and participants are connected for this isolated test
    // For simplicity, we manually create a room in memory and simulate sockets in it.
    
    // Instead of full e2e setup in each test, we'll setup manually:
    const fromIndex = require('../../rooms');
    const room = fromIndex.createRoom('host123');
    room.roundState = 'ACTIVE'; // manually make it active
    
    // Wait, testing socket.io logic requires clients to be actually connected to the room.
    // Let's do a quick full setup.
    (prisma.hostUser.findUnique as any).mockResolvedValue({
      id: 'host123',
      subscription: { status: 'active', currentPeriodEnd: new Date(Date.now() + 10000) },
    } as any);
    const token = jwt.sign({ userId: 'host123' }, config.jwtSecret);

    hostSocket = createClient();
    p1Socket = createClient();
    p2Socket = createClient();

    hostSocket.connect();
    
    hostSocket.on('connect', () => {
      hostSocket.emit('ROOM_CREATE', token, (res: any) => {
        const code = res.room.roomCode;
        p1Socket.connect();
        p2Socket.connect();

        let joined = 0;
        const checkJoin = () => {
          joined++;
          if (joined === 2) {
            // Both joined. Start round.
            hostSocket.emit('ROUND_START', () => {
              // Now P1 buzzes
              p1Socket.emit('BUZZ_SUBMIT', (buzz1Res: any) => {
                expect(buzz1Res.success).toBe(true); // Since P1 emitted first
                // Wait for the 250ms grace period to expire and lock the round
                setTimeout(() => {
                  // Now P2 buzzes and should be rejected
                  p2Socket.emit('BUZZ_SUBMIT', (buzz2Res: any) => {
                    expect(buzz2Res.success).toBe(false); // P2 is too late
                    expect(buzz2Res.error).toBe('Round is not active');
                    done();
                  });
                }, 300);
              });
            });
          }
        };

        p1Socket.on('connect', () => p1Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'P1' }, checkJoin));
        p2Socket.on('connect', () => p2Socket.emit('ROOM_JOIN', { roomCode: code, displayName: 'P2' }, checkJoin));
      });
    });
  });
});
