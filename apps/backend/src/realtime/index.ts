import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';
import { rooms, socketToRoom, createRoom, getRoomByCode } from '../rooms';
import { RoomState, ClientToServerEvents, ServerToClientEvents, RoomData } from 'shared';
import xss from 'xss';

export function setupSocketIO(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  // Grace period buffers for each room
  const buzzBuffers = new Map<string, { timer: NodeJS.Timeout, buzzes: { socketId: string, timestamp: number }[] }>();

  // Authenticate socket connections via httpOnly cookie or explicit auth token
  io.use((socket, next) => {
    // Try explicit token from handshake auth first (legacy)
    let token: string | undefined = socket.handshake.auth?.token;

    // Fall back to httpOnly cookie sent with the HTTP upgrade request
    if (!token) {
      const cookieStr = socket.handshake.headers.cookie || '';
      const match = cookieStr.match(/(?:^|;\s*)hostToken=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
        socket.data.userId = decoded.userId;
      } catch {
        // Ignore invalid tokens — participants don't need auth
      }
    }
    next();
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    
    // Time Sync
    // @ts-ignore (because the event may not be typed perfectly in this server setup yet)
    socket.on('SYNC_TIME', (clientTime: number, callback: (serverTime: number) => void) => {
      if (callback) callback(Date.now());
    });

    // Create Room (Host only)
    socket.on('ROOM_CREATE', async (token, callback) => {
      try {
        // Prefer userId already set by cookie middleware; fall back to explicit token
        let userId = socket.data.userId;
        if (!userId && token) {
          const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
          userId = decoded.userId;
        }
        if (!userId) {
          return callback({ success: false, error: 'Требуется авторизация' });
        }

        const user = await prisma.hostUser.findUnique({
          where: { id: userId },
          include: { subscription: true, settings: true },
        });

        if (!user || !user.subscription || user.subscription.status !== 'active' || user.subscription.currentPeriodEnd < new Date()) {
          return callback({ success: false, error: 'Для создания комнаты нужна активная подписка' });
        }

        socket.data.userId = userId;
        const room = createRoom(userId, socket.id, user.settings?.customLogoUrl);
        socket.join(room.roomId);
        socketToRoom.set(socket.id, room.roomId);
        callback({ success: true, room });
      } catch (error) {
        callback({ success: false, error: 'Ошибка авторизации' });
      }
    });

    // Join Room (Participant)
    socket.on('ROOM_JOIN', ({ roomCode, displayName }, callback) => {
      if (!displayName || displayName.trim().length === 0) {
        return callback({ success: false, error: 'Введите имя' });
      }

      // Sanitize displayName to prevent injection
      const safeDisplayName = xss(displayName).trim().substring(0, 20);
      if (safeDisplayName.length === 0) {
        return callback({ success: false, error: 'Недопустимое имя' });
      }

      const room = getRoomByCode(roomCode);
      if (!room) {
        return callback({ success: false, error: 'Комната не найдена' });
      }

      const participant = {
        id: socket.id,
        displayName: safeDisplayName,
        socketId: socket.id,
        joinedAt: Date.now(),
        isConnected: true,
        score: 0,
      };

      room.participants.push(participant);
      socket.join(room.roomId);
      socketToRoom.set(socket.id, room.roomId);

      // Notify host and others
      io.to(room.roomId).emit('PARTICIPANT_JOINED', participant);
      io.to(room.roomId).emit('ROOM_STATE_UPDATED', room);
      
      callback({ success: true, participant, room });
    });

    // Start Round (Host)
    socket.on('ROUND_START', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      if (!socket.data.userId || room.hostUserId !== socket.data.userId) {
        return callback && callback({ success: false, error: 'Только ведущий может выполнить это действие' });
      }

      const existingBuffer = buzzBuffers.get(roomId);
      if (existingBuffer) {
        clearTimeout(existingBuffer.timer);
        buzzBuffers.delete(roomId);
      }

      room.roundState = RoomState.ACTIVE;
      room.firstBuzzerId = null;
      room.unlockAt = Date.now() + 500; // Scheduled unlock buffer
      
      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_STARTED');
      if (callback) callback({ success: true });
    });

    // Rate limiting map for BUZZ_SUBMIT
    const buzzRateLimits = new Map<string, number>();

    // Submit Buzz (Participant)
    // @ts-ignore
    socket.on('BUZZ_SUBMIT', (data: any, callback?: any) => {
      const timestamp = data && typeof data.timestamp === 'number' ? data.timestamp : Date.now();
      const actualCallback = typeof data === 'function' ? data : callback;

      const now = Date.now();
      const lastBuzz = buzzRateLimits.get(socket.id) || 0;
      if (now - lastBuzz < 500) { // 500ms limit
        return actualCallback && actualCallback({ success: false, error: 'Слишком много запросов' });
      }
      buzzRateLimits.set(socket.id, now);

      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return actualCallback && actualCallback({ success: false, error: 'Вы не в комнате' });
      
      const room = rooms.get(roomId);
      if (!room) return actualCallback && actualCallback({ success: false, error: 'Комната не найдена' });

      if (room.roundState !== RoomState.ACTIVE) {
        return actualCallback && actualCallback({ success: false, error: 'Раунд еще не начался' });
      }

      if (room.unlockAt && timestamp < room.unlockAt) {
        return actualCallback && actualCallback({ success: false, error: 'Фальстарт! Вы нажали слишком рано' });
      }

      // If firstBuzzerId is already set, the round is definitely over.
      if (room.firstBuzzerId) {
        return actualCallback && actualCallback({ success: false, error: 'Слишком поздно' });
      }

      let buffer = buzzBuffers.get(roomId);
      if (!buffer) {
        buffer = {
          buzzes: [],
          timer: setTimeout(() => {
            const b = buzzBuffers.get(roomId);
            if (b && b.buzzes.length > 0) {
              b.buzzes.sort((a, b) => a.timestamp - b.timestamp);
              const winner = b.buzzes[0];

              const currentRoom = rooms.get(roomId);
              if (currentRoom && currentRoom.roundState === RoomState.ACTIVE) {
                currentRoom.firstBuzzerId = winner.socketId;
                currentRoom.roundState = RoomState.REVEALED;

                io.to(roomId).emit('ROOM_STATE_UPDATED', currentRoom);
                io.to(roomId).emit('ROUND_LOCKED');
                io.to(roomId).emit('FIRST_REVEALED', currentRoom.firstBuzzerId);
              }
            }
            buzzBuffers.delete(roomId);
          }, 250) // 250ms grace period
        };
        buzzBuffers.set(roomId, buffer);
      }

      buffer.buzzes.push({ socketId: socket.id, timestamp });

      if (actualCallback) actualCallback({ success: true });
    });

    // Reveal First (Host)
    socket.on('FIRST_REVEAL', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      if (!socket.data.userId || room.hostUserId !== socket.data.userId) {
        return callback && callback({ success: false, error: 'Только ведущий может выполнить это действие' });
      }

      if (room.roundState !== RoomState.BUZZED_HIDDEN) {
        return callback && callback({ success: false, error: 'Нельзя открыть ответ сейчас' });
      }

      room.roundState = RoomState.REVEALED;
      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('FIRST_REVEALED', room.firstBuzzerId!);
      
      if (callback) callback({ success: true });
    });

    // Reset Round (Host)
    socket.on('ROUND_RESET', (dataOrCallback?: any, maybeCallback?: any) => {
      const data = typeof dataOrCallback === 'function' ? undefined : dataOrCallback;
      const callback = typeof dataOrCallback === 'function' ? dataOrCallback : maybeCallback;

      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      if (!socket.data.userId || room.hostUserId !== socket.data.userId) {
        return callback && callback({ success: false, error: 'Только ведущий может выполнить это действие' });
      }

      if (data?.winnerId) {
        // Security: only the actual first buzzer can be declared winner
        if (data.winnerId !== room.firstBuzzerId) {
          return callback && callback({ success: false, error: 'Неверный победитель' });
        }
        const winner = room.participants.find(p => p.id === data.winnerId);
        if (winner) winner.score += 1;
      }

      const existingBuffer = buzzBuffers.get(roomId);
      if (existingBuffer) {
        clearTimeout(existingBuffer.timer);
        buzzBuffers.delete(roomId);
      }

      room.roundState = RoomState.WAITING;
      room.firstBuzzerId = null;
      room.unlockAt = null;

      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_RESET_DONE');
      
      if (callback) callback({ success: true });
    });

    // Finish Room (Host)
    socket.on('ROOM_FINISH', async (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      if (!socket.data.userId || room.hostUserId !== socket.data.userId) {
        return callback && callback({ success: false, error: 'Только ведущий может выполнить это действие' });
      }

      if (room.roundState === RoomState.FINISHED) {
        return callback && callback({ success: false, error: 'Игра уже завершена' });
      }

      room.roundState = RoomState.FINISHED;

      // Find winner
      let winnerName: string | null = null;
      let winnerScore = 0;

      if (room.participants.length > 0) {
        const sorted = [...room.participants].sort((a, b) => b.score - a.score);
        winnerScore = sorted[0].score;
        if (winnerScore > 0) {
          winnerName = sorted[0].displayName;
        }
      }

      // Save to history
      if (room.participants.length > 0) {
        try {
          await prisma.gameHistory.create({
            data: {
              hostUserId: room.hostUserId,
              roomCode: room.roomCode,
              winnerName: winnerName || 'Ничья / Нет победителя',
              winnerScore,
              participants: room.participants.length,
            }
          });
        } catch (err) {
          console.error('Failed to save game history:', err);
        }
      }

      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROOM_FINISHED', { winnerName, winnerScore });
      
      if (callback) callback({ success: true });
    });

    socket.on('ROOM_LEAVE', () => {
      handleDisconnect(socket, io);
    });

    socket.on('disconnect', () => {
      handleDisconnect(socket, io);
    });
  });
}

function handleDisconnect(socket: Socket<ClientToServerEvents, ServerToClientEvents>, io: Server) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    const isParticipant = room.participants.some(p => p.id === socket.id);
    if (isParticipant) {
      room.participants = room.participants.filter(p => p.id !== socket.id);
      io.to(roomId).emit('PARTICIPANT_LEFT', socket.id);
      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
    } else {
      // It was the host. For MVP, we can delete the room or leave it.
      // Let's just leave it for now (in case of quick reload).
    }
  }
  
  socketToRoom.delete(socket.id);
}
