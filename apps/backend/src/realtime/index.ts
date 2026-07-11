import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';
import { rooms, socketToRoom, createRoom, getRoomByCode } from '../rooms';
import { RoomState, ClientToServerEvents, ServerToClientEvents, RoomData } from 'shared';
import xss from 'xss';
import { reattachHostToRoom, startHostReconnectTimeout } from './host-reconnect';
import { saveGameHistory, schedulePostFinishCleanup, scheduleMaxLifetimeCleanup, postFinishTimers, maxLifetimeTimers } from './room-lifecycle';
import { hostDisconnectTimers } from './host-reconnect';
import crypto from 'crypto';
import { appEvents } from '../events';
import { deleteRoom } from '../rooms';

export const participantDisconnectTimers = new Map<string, NodeJS.Timeout>();

export type SocketRole = 'host' | 'participant';

export interface CustomSocketData {
  role?: SocketRole;
  userId?: string;
  participantId?: string;
  sessionId?: string;
  intentionalLogout?: boolean;
}

function rejectSocketAction(action: string, reason: string, socketId: string, roomId?: string) {
  console.warn(JSON.stringify({
    event: 'socket_action_rejected',
    action,
    reason,
    socketId,
    roomId
  }));
  let errorMsg = 'Действие отклонено';
  if (reason === 'host_cannot_join') errorMsg = 'Ведущий не может стать участником';
  else if (reason === 'participant_cannot_create') errorMsg = 'Участник не может создать комнату';
  else if (reason === 'already_joined') errorMsg = 'Вы уже в комнате';
  else if (reason === 'not_a_host') errorMsg = 'Только ведущий может выполнить это действие';
  else if (reason === 'not_a_participant' || reason === 'participant_not_found') errorMsg = 'Только участник может нажать кнопку';
  
  return { success: false, error: errorMsg };
}

function requireHostSocket(socket: Socket<any, any, any, CustomSocketData>, room: RoomData, action: string) {
  if (socket.data.role !== 'host') {
    return rejectSocketAction(action, 'not_a_host', socket.id, room.roomId);
  }
  if (socket.data.userId !== room.hostUserId) {
    return rejectSocketAction(action, 'host_id_mismatch', socket.id, room.roomId);
  }
  return null;
}

function requireParticipantSocket(socket: Socket<any, any, any, CustomSocketData>, room: RoomData, action: string) {
  if (socket.data.role !== 'participant') {
    return rejectSocketAction(action, 'not_a_participant', socket.id, room.roomId);
  }
  const participant = room.participants.find(p => p.id === socket.data.participantId && p.socketId === socket.id && p.isConnected);
  if (!participant) {
    return rejectSocketAction(action, 'participant_not_found', socket.id, room.roomId);
  }
  return null;
}

export function setupSocketIO(io: Server<ClientToServerEvents, ServerToClientEvents, import('socket.io').DefaultEventsMap, CustomSocketData>) {
  // Grace period buffers for each room
  const buzzBuffers = new Map<string, { timer: NodeJS.Timeout, buzzes: { socketId: string, timestamp: number, receivedAt: number }[] }>();

  interface SyncStats {
    rttWindow: number[];
    offsetWindow: number[];
    medianRtt: number;
    medianOffset: number;
    jitter: number;
    lastSyncTime: number;
  }
  const socketToSyncStats = new Map<string, SyncStats>();

  // Authenticate socket connections via httpOnly cookie or explicit auth token
  io.use(async (socket, next) => {
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
        const decoded = jwt.verify(token, config.jwtSecret) as { userId: string, sessionId?: string };
        socket.data.userId = decoded.userId;
        
        if (decoded.sessionId) {
          const session = await prisma.session.findUnique({ where: { id: decoded.sessionId } });
          if (session && session.userId === decoded.userId && session.expiresAt > new Date() && !session.revokedAt) {
            socket.data.sessionId = decoded.sessionId;
          } else {
            return next(new Error('Session revoked'));
          }
        }
      } catch {
        // Ignore invalid tokens — participants don't need auth
      }
    }
    next();
  });

  appEvents.on('host_logout', (sessionId: string) => {
    for (const [socketId, socket] of io.sockets.sockets.entries()) {
      if (socket.data.sessionId === sessionId) {
        socket.data.intentionalLogout = true;
        const roomId = socketToRoom.get(socketId);
        if (roomId) {
          deleteRoom(
            roomId, 
            'Ведущий завершил сессию', 
            io, 
            buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>, 
            [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers], 
            participantDisconnectTimers
          );
        }
        socket.disconnect(true);
      }
    }
  });

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, import('socket.io').DefaultEventsMap, CustomSocketData>) => {
    
    // Time Sync
    socket.on('SYNC_TIME', (clientTime: number, callback: (serverTime: number) => void) => {
      if (callback) callback(Date.now());
    });

    socket.on('SYNC_ACK', (data: { clientTime: number, serverTime: number, clientReceiveTime: number }) => {
      const serverReceiveTime = Date.now();
      const rtt = data.clientReceiveTime - data.clientTime;
      const offset = data.serverTime - (data.clientTime + rtt / 2);

      // Simple anomaly detection (if RTT is negative or suspiciously high relative to previous)
      if (rtt < 0) return;

      let stats = socketToSyncStats.get(socket.id);
      if (!stats) {
        stats = { rttWindow: [], offsetWindow: [], medianRtt: 0, medianOffset: 0, jitter: 0, lastSyncTime: 0 };
        socketToSyncStats.set(socket.id, stats);
      }

      stats.rttWindow.push(rtt);
      stats.offsetWindow.push(offset);

      if (stats.rttWindow.length > 5) stats.rttWindow.shift();
      if (stats.offsetWindow.length > 5) stats.offsetWindow.shift();

      const sortedRtt = [...stats.rttWindow].sort((a, b) => a - b);
      const sortedOffset = [...stats.offsetWindow].sort((a, b) => a - b);
      
      stats.medianRtt = sortedRtt[Math.floor(sortedRtt.length / 2)];
      stats.medianOffset = sortedOffset[Math.floor(sortedOffset.length / 2)];
      stats.jitter = sortedRtt[sortedRtt.length - 1] - sortedRtt[0];
      stats.lastSyncTime = serverReceiveTime;
    });

    socket.on('disconnect', () => {
      socketToSyncStats.delete(socket.id);
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

        if (socket.data.role === 'participant') {
          return callback(rejectSocketAction('ROOM_CREATE', 'participant_cannot_create', socket.id));
        }

        const user = await prisma.hostUser.findUnique({
          where: { id: userId },
          include: { subscription: true, settings: true },
        });

        if (!user || !user.subscription || user.subscription.status !== 'active' || user.subscription.currentPeriodEnd < new Date()) {
          return callback({ success: false, error: 'Для создания комнаты нужна активная подписка' });
        }

        socket.data.userId = userId;
        socket.data.role = 'host';
        const room = createRoom(
          userId, 
          socket.id, 
          user.settings?.customLogoUrl,
          user.settings?.customBgUrl,
          user.settings?.bgTheme
        );
        socket.join(room.roomId);
        socketToRoom.set(socket.id, room.roomId);

        // Schedule 24-hour max lifetime cleanup
        scheduleMaxLifetimeCleanup(
          room.roomId,
          io,
          buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
          [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers]
        );

        callback({ success: true, room });
      } catch (error) {
        callback({ success: false, error: 'Ошибка авторизации' });
      }
    });

    // Rejoin Room (Host only)
    socket.on('HOST_REJOIN_ROOM', ({ roomId }, callback) => {
      if (!roomId || typeof roomId !== 'string') {
        return callback({ success: false, error: 'Комната недоступна' });
      }
      
      const userId = socket.data.userId;
      if (!userId) {
        return callback({ success: false, error: 'Комната недоступна' });
      }

      const room = rooms.get(roomId);
      if (!room) {
        return callback({ success: false, error: 'Комната недоступна' });
      }

      if (room.hostUserId !== userId) {
        return callback({ success: false, error: 'Комната недоступна' });
      }

      if (room.roundState === RoomState.FINISHED) {
        return callback({ success: false, error: 'Комната недоступна' });
      }

      reattachHostToRoom(socket, room, io);
      callback({ success: true, room });
    });

    // Join Room (Participant)
    socket.on('ROOM_JOIN', ({ roomCode, displayName }, callback) => {
      if (socket.data.role === 'host') {
        return callback(rejectSocketAction('ROOM_JOIN', 'host_cannot_join', socket.id));
      }
      if (socket.data.role === 'participant') {
        return callback(rejectSocketAction('ROOM_JOIN', 'already_joined', socket.id));
      }

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

      // Block joining a finished or expired room
      if (room.roundState === RoomState.FINISHED) {
        return callback({ success: false, error: 'Игра уже завершена' });
      }

      const participantId = crypto.randomUUID();
      const reconnectToken = crypto.randomBytes(32).toString('hex');
      const reconnectTokenHash = crypto.createHash('sha256').update(reconnectToken).digest('hex');

      const participant = {
        id: participantId,
        displayName: safeDisplayName,
        socketId: socket.id,
        joinedAt: Date.now(),
        isConnected: true,
        score: 0,
        reconnectTokenHash,
      };

      room.participants.push(participant);
      socket.join(room.roomId);
      socketToRoom.set(socket.id, room.roomId);
      socket.data.role = 'participant';
      socket.data.participantId = participant.id;

      // Notify host and others (without hash)
      const { reconnectTokenHash: _hash, ...safeParticipant } = participant;
      io.to(room.roomId).emit('PARTICIPANT_JOINED', safeParticipant as any);
      
      // Also emit room state without hashes
      const safeRoom = { ...room, participants: room.participants.map(({ reconnectTokenHash, ...p }) => p) };
      io.to(room.roomId).emit('ROOM_STATE_UPDATED', safeRoom as any);
      
      callback({ success: true, participant: safeParticipant as any, room: safeRoom as any, reconnectToken });
    });

    // Rejoin Room (Participant)
    socket.on('PARTICIPANT_REJOIN', ({ roomCode, participantId, reconnectToken }, callback) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        return callback({ success: false, error: 'Комната не найдена' });
      }

      if (room.roundState === RoomState.FINISHED) {
        return callback({ success: false, error: 'Игра уже завершена' });
      }

      const participant = room.participants.find(p => p.id === participantId);
      if (!participant || !participant.reconnectTokenHash) {
        return callback({ success: false, error: 'Участник не найден или недействителен' });
      }

      const hash = crypto.createHash('sha256').update(reconnectToken).digest('hex');
      if (participant.reconnectTokenHash !== hash) {
        return callback({ success: false, error: 'Неверный токен восстановления' });
      }

      // If the participant was connected on another socket, revoke it
      if (participant.isConnected && participant.socketId && participant.socketId !== socket.id) {
        const oldSocket = io.sockets.sockets.get(participant.socketId);
        if (oldSocket) {
          oldSocket.emit('PARTICIPANT_CONTROL_REVOKED');
          oldSocket.data.role = undefined;
          oldSocket.data.participantId = undefined;
          oldSocket.leave(room.roomId);
          socketToRoom.delete(oldSocket.id);
        }
      }

      // Clear any pending disconnect timer
      const timerKey = `${room.roomId}_${participant.id}`;
      const existingTimer = participantDisconnectTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        participantDisconnectTimers.delete(timerKey);
      }

      // Rebind socket
      participant.socketId = socket.id;
      participant.isConnected = true;
      socket.join(room.roomId);
      socketToRoom.set(socket.id, room.roomId);
      socket.data.role = 'participant';
      socket.data.participantId = participant.id;

      const safeRoom = { ...room, participants: room.participants.map(({ reconnectTokenHash, ...p }) => p) };
      io.to(room.roomId).emit('ROOM_STATE_UPDATED', safeRoom as any);
      
      const { reconnectTokenHash: _hash, ...safeParticipant } = participant;
      callback({ success: true, participant: safeParticipant as any, room: safeRoom as any });
    });

    // Start Round (Host)
    socket.on('ROUND_START', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      const rejection = requireHostSocket(socket, room, 'ROUND_START');
      if (rejection) return callback && callback(rejection);

      const existingBuffer = buzzBuffers.get(roomId);
      if (existingBuffer) {
        clearTimeout(existingBuffer.timer);
        buzzBuffers.delete(roomId);
      }

      room.roundState = RoomState.ACTIVE;
      room.firstBuzzerId = null;
      room.unlockAt = Date.now() + 150; // Scheduled unlock buffer
      
      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_STARTED');
      if (callback) callback({ success: true });
    });

    // Rate limiting map for BUZZ_SUBMIT
    const buzzRateLimits = new Map<string, number>();

    // Submit Buzz (Participant)
    socket.on('BUZZ_SUBMIT', (data: any, callback?: any) => {
      const receivedAt = Date.now();
      const clientPressedAt = data && typeof data.clientPressedAt === 'number' ? data.clientPressedAt : Date.now();
      const actualCallback = typeof data === 'function' ? data : callback;

      const lastBuzz = buzzRateLimits.get(socket.id) || 0;
      if (receivedAt - lastBuzz < 500) { // 500ms limit
        return actualCallback && actualCallback({ success: false, error: 'Слишком много запросов' });
      }
      buzzRateLimits.set(socket.id, receivedAt);

      const roomId = socketToRoom.get(socket.id);
      if (!roomId) {
        // If not even in socketToRoom, role check will fail anyway, but we can't fetch room
        // Let's manually reject
        if (socket.data.role !== 'participant') {
          return actualCallback && actualCallback(rejectSocketAction('BUZZ_SUBMIT', 'not_a_participant', socket.id));
        }
        return actualCallback && actualCallback({ success: false, error: 'Вы не в комнате' });
      }
      
      const room = rooms.get(roomId);
      if (!room) return actualCallback && actualCallback({ success: false, error: 'Комната не найдена' });

      const rejection = requireParticipantSocket(socket, room, 'BUZZ_SUBMIT');
      if (rejection) return actualCallback && actualCallback(rejection);

      if (room.roundState !== RoomState.ACTIVE) {
        return actualCallback && actualCallback({ success: false, error: 'Раунд еще не начался' });
      }

      const stats = socketToSyncStats.get(socket.id);
      const medianOffset = stats?.medianOffset || 0;
      const medianRtt = stats?.medianRtt || 0;
      const jitter = stats?.jitter || 0;

      const estimatedPressedAt = clientPressedAt + medianOffset;

      if (room.unlockAt && estimatedPressedAt < room.unlockAt) {
        return actualCallback && actualCallback({ success: false, error: 'Фальстарт! Вы нажали слишком рано' });
      }

      if (estimatedPressedAt > receivedAt + 100) { // Slight buffer for future timestamps
        return actualCallback && actualCallback({ success: false, error: 'Неверная метка времени (будущее)' });
      }

      // If firstBuzzerId is already set, the round is definitely over.
      if (room.firstBuzzerId) {
        return actualCallback && actualCallback({ success: false, error: 'Слишком поздно' });
      }

      const MAX_COMPENSATION_MS = 300;
      const SAFETY_MARGIN = 50;
      const allowedDelay = Math.min((medianRtt / 2) + (jitter * 2) + SAFETY_MARGIN, MAX_COMPENSATION_MS);

      const validatedPressedAt = Math.max(
        estimatedPressedAt,
        receivedAt - allowedDelay,
        room.unlockAt || 0
      );

      let buffer = buzzBuffers.get(roomId);
      if (!buffer) {
        buffer = {
          buzzes: [],
          timer: setTimeout(() => {
            const b = buzzBuffers.get(roomId);
            if (b && b.buzzes.length > 0) {
              b.buzzes.sort((a, b) => {
                if (a.timestamp === b.timestamp) {
                  return a.receivedAt - b.receivedAt; // Tie-breaker
                }
                return a.timestamp - b.timestamp;
              });
              const winner = b.buzzes[0];

              const currentRoom = rooms.get(roomId);
              if (currentRoom && currentRoom.roundState === RoomState.ACTIVE) {
                // Find the participantId for this socket
                const winnerParticipantId = io.sockets.sockets.get(winner.socketId)?.data.participantId;
                if (winnerParticipantId) {
                  currentRoom.firstBuzzerId = winnerParticipantId;
                  currentRoom.roundState = RoomState.REVEALED;

                  const safeRoom = { ...currentRoom, participants: currentRoom.participants.map(({ reconnectTokenHash, ...p }) => p) };
                  io.to(roomId).emit('ROOM_STATE_UPDATED', safeRoom as any);
                  io.to(roomId).emit('ROUND_LOCKED');
                  io.to(roomId).emit('FIRST_REVEALED', currentRoom.firstBuzzerId);
                }
              }
            }
            buzzBuffers.delete(roomId);
          }, 250) // 250ms grace period
        };
        buzzBuffers.set(roomId, buffer);
      }

      buffer.buzzes.push({ socketId: socket.id, timestamp: validatedPressedAt, receivedAt });

      if (actualCallback) actualCallback({ success: true });
    });

    // Reveal First (Host)
    socket.on('FIRST_REVEAL', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      const rejection = requireHostSocket(socket, room, 'FIRST_REVEAL');
      if (rejection) return callback && callback(rejection);

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

      const rejection = requireHostSocket(socket, room, 'ROUND_RESET');
      if (rejection) return callback && callback(rejection);

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

      const rejection = requireHostSocket(socket, room, 'ROOM_FINISH');
      if (rejection) return callback && callback(rejection);

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

      // Save to history (idempotent)
      await saveGameHistory(room, prisma);

      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROOM_FINISHED', { winnerName, winnerScore });

      // Schedule 5-minute post-finish cleanup
      schedulePostFinishCleanup(
        roomId,
        io,
        buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
        [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers]
      );

      if (callback) callback({ success: true });
    });

    socket.on('ROOM_LEAVE', () => {
      handleDisconnect(socket);
    });

    socket.on('disconnect', () => {
      handleDisconnect(socket);
    });
  });

  function handleDisconnect(socket: Socket<ClientToServerEvents, ServerToClientEvents, import('socket.io').DefaultEventsMap, CustomSocketData>) {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      const participant = room.participants.find(p => p.socketId === socket.id);
      if (participant) {
        participant.isConnected = false;
        const safeRoom = { ...room, participants: room.participants.map(({ reconnectTokenHash, ...p }) => p) };
        io.to(roomId).emit('ROOM_STATE_UPDATED', safeRoom as any);

        // Schedule 5-minute disconnect timer
        const timerKey = `${roomId}_${participant.id}`;
        const timer = setTimeout(() => {
          const currentRoom = rooms.get(roomId);
          if (currentRoom) {
            currentRoom.participants = currentRoom.participants.filter(p => p.id !== participant.id);
            const safeCurrentRoom = { ...currentRoom, participants: currentRoom.participants.map(({ reconnectTokenHash, ...p }) => p) };
            io.to(roomId).emit('PARTICIPANT_LEFT', participant.id);
            io.to(roomId).emit('ROOM_STATE_UPDATED', safeCurrentRoom as any);
          }
          participantDisconnectTimers.delete(timerKey);
        }, 5 * 60 * 1000);
        participantDisconnectTimers.set(timerKey, timer);

      } else if (room.hostSocketId === socket.id) {
        if (!socket.data.intentionalLogout) {
          startHostReconnectTimeout(roomId, io, buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>);
          const safeRoom = { ...room, participants: room.participants.map(({ reconnectTokenHash, ...p }) => p) };
          io.to(roomId).emit('ROOM_STATE_UPDATED', safeRoom as any);
        }
      }
    }

    socketToRoom.delete(socket.id);
  }
}
