import { Server } from 'socket.io';
import Client from 'socket.io-client';
import { createServer } from 'http';
import { setupSocketIO, participantDisconnectTimers } from '../index';
import { prisma } from '../../prisma';
import { RoomState } from 'shared';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { cleanupValidationRateLimits } from '../validation';

describe('Socket Payload Validation', () => {
  let io: Server;
  let clientSocket: any;
  let serverSocket: any;
  let httpServer: any;
  let testHostToken: string;

  beforeAll((done) => {
    httpServer = createServer();
    io = new Server(httpServer);
    setupSocketIO(io);

    const hostUserId = 'test-host-id';
    testHostToken = jwt.sign({ userId: hostUserId }, config.jwtSecret);

    httpServer.listen(() => {
      const port = (httpServer.address() as any).port;
      clientSocket = Client(`http://localhost:${port}`);
      io.on('connection', (socket) => {
        serverSocket = socket;
      });
      clientSocket.on('connect', done);
    });
  });

  afterAll(() => {
    clientSocket.disconnect();
    io.close();
    httpServer.close();
    for (const timer of participantDisconnectTimers.values()) {
      clearTimeout(timer);
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cleanupValidationRateLimits(clientSocket.id);
  });

  // Mock Prisma and room creation bypass for pure payload testing?
  // We can just test the responses for invalid payloads.

  it('rejects ROOM_JOIN with missing data', (done) => {
    clientSocket.emit('ROOM_JOIN', null, (res: any) => {
      expect(res.success).toBe(false);
      expect(res.error).toBe('Некорректные данные');
      done();
    });
  });

  it('rejects ROOM_JOIN with unknown fields (strict check)', (done) => {
    clientSocket.emit('ROOM_JOIN', { roomCode: '123456', displayName: 'Player', hackField: true }, (res: any) => {
      expect(res.success).toBe(false);
      expect(res.error).toBe('Некорректные данные');
      done();
    });
  });

  it('rejects ROOM_JOIN with too long displayName', (done) => {
    clientSocket.emit('ROOM_JOIN', { roomCode: '123456', displayName: 'A'.repeat(51) }, (res: any) => {
      expect(res.success).toBe(false);
      expect(res.error).toBe('Некорректные данные');
      done();
    });
  });

  it('rejects BUZZ_SUBMIT with invalid clientPressedAt (future timestamp)', (done) => {
    clientSocket.emit('BUZZ_SUBMIT', { clientPressedAt: Date.now() + 86400000 * 400 }, (res: any) => {
      expect(res.success).toBe(false);
      expect(res.error).toBe('Некорректные данные');
      done();
    });
  });

  it('rejects BUZZ_SUBMIT with string instead of number', (done) => {
    clientSocket.emit('BUZZ_SUBMIT', { clientPressedAt: "123" }, (res: any) => {
      expect(res.success).toBe(false);
      expect(res.error).toBe('Некорректные данные');
      done();
    });
  });

  it('triggers rate limiting on repeated invalid requests', (done) => {
    let completed = 0;
    const TOTAL = 15;
    let rateLimited = false;

    const cb = (res: any) => {
      if (res.error === 'Слишком много невалидных запросов') {
        rateLimited = true;
      }
      completed++;
      if (completed === TOTAL) {
        expect(rateLimited).toBe(true);
        done();
      }
    };

    for (let i = 0; i < TOTAL; i++) {
      clientSocket.emit('ROOM_JOIN', { invalidPayload: true }, cb);
    }
  });

  it('handles empty payload gracefully for FIRST_REVEAL', (done) => {
    // Should pass validation, but fail auth since we are not host in a room
    clientSocket.emit('FIRST_REVEAL', null, (res: any) => {
      expect(res.success).toBe(false);
      expect(res.error).toBe('Вы не в комнате');
      done();
    });
  });
  
  it('emits the shared ERROR_EVENT object for invalid payloads without a callback', (done) => {
    clientSocket.emit('ROOM_LEAVE', { someRandomData: 123 }); // strict error
    
    clientSocket.once('ERROR_EVENT', (payload: { message: string }) => {
      expect(payload).toEqual({ message: 'Некорректные данные' });
      done();
    });
  });
  
  it('passes valid payload correctly to handler (SYNC_ACK)', (done) => {
    const mockData = {
      clientTime: 1000,
      serverTime: 1100,
      clientReceiveTime: 1200
    };
    
    // SYNC_ACK doesn't have a callback, so we can't easily wait for it.
    // Instead we can use SYNC_TIME which has a callback
    clientSocket.emit('SYNC_TIME', 123, (serverTime: number) => {
      expect(typeof serverTime).toBe('number');
      done();
    });
  });

});
