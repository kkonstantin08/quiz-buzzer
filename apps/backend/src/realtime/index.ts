import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { prisma } from '../prisma';
import { HostSessionAuthCode, validateHostSession, validateHostToken } from '../auth/session';
import { rooms, socketToRoom, createRoom, getRoomByCode } from '../rooms';
import { BuzzSubmitResult, ClientToServerEvents, InternalRoomData, PublicRoomData, RoomCreateResult, RoomState, ServerToClientEvents, SocketErrorResult, GameResult } from 'shared';
import xss from 'xss';
import { reattachHostToRoom, startHostReconnectTimeout } from './host-reconnect';
import { finishAndDeleteRoom, finishRoom, schedulePostFinishCleanup, scheduleMaxLifetimeCleanup, postFinishTimers, maxLifetimeTimers } from './room-lifecycle';
import { hostDisconnectTimers } from './host-reconnect';
import crypto from 'crypto';
import { appEvents } from '../events';
import { withValidation, cleanupValidationRateLimits } from './validation';
import {
  SyncTimeSchema, SyncAckSchema, HostRejoinRoomSchema,
  RoomJoinSchema, ParticipantRejoinSchema, RoundStartSchema, BuzzSubmitStrictSchema,
  RoundResetSchema, EmptyPayloadSchema, HostClearScoresSchema
} from 'shared';

export const participantDisconnectTimers = new Map<string, NodeJS.Timeout>();

export type SocketRole = 'host' | 'participant';

export interface CustomSocketData {
  role?: SocketRole;
  userId?: string;
  participantId?: string;
  sessionId?: string;
  intentionalLogout?: boolean;
}

type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, CustomSocketData>;
type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, CustomSocketData>;

function rejectSocketAction(action: string, reason: string, socketId: string, roomId?: string): SocketErrorResult {
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

function getHostTokenFromCookie(cookieHeader: string | undefined): string | undefined {
  const match = cookieHeader?.match(/(?:^|;\s*)hostToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

async function requireAuthenticatedHostSession(socket: RealtimeSocket, action: string) {
  const { userId, sessionId } = socket.data;
  if (!userId || !sessionId) {
    return rejectSocketAction(action, 'not_a_host', socket.id);
  }

  const validation = await validateHostSession({ userId, sessionId });
  if (!validation.valid) {
    return rejectSocketAction(action, 'not_a_host', socket.id);
  }

  return null;
}

function socketAuthError(code: HostSessionAuthCode) {
  return Object.assign(new Error('Host session invalid'), { data: { code } });
}

async function requireHostSocket(socket: RealtimeSocket, room: InternalRoomData, action: string) {
  const sessionRejection = await requireAuthenticatedHostSession(socket, action);
  if (sessionRejection) {
    return sessionRejection;
  }
  if (socket.data.role !== 'host' || socket.data.userId !== room.hostUserId || room.hostSocketId !== socket.id) {
    return rejectSocketAction(action, 'not_a_host', socket.id, room.roomId);
  }
  return null;
}

function requireParticipantSocket(socket: RealtimeSocket, room: InternalRoomData, action: string) {
  if (socket.data.role !== 'participant') {
    return rejectSocketAction(action, 'not_a_participant', socket.id, room.roomId);
  }
  const participant = room.participants.find(p => p.id === socket.data.participantId && p.socketId === socket.id && p.isConnected);
  if (!participant) {
    return rejectSocketAction(action, 'participant_not_found', socket.id, room.roomId);
  }
  return null;
}


export function toPublicRoomData(room: InternalRoomData): PublicRoomData {
  return {
    roomId: room.roomId,
    roomCode: room.roomCode,
    participants: room.participants.map(p => ({
      id: p.id,
      displayName: p.displayName,
      joinedAt: p.joinedAt,
      isConnected: p.isConnected,
      score: p.score,
    })),
    roundState: room.roundState,
    firstBuzzerId: room.firstBuzzerId,
    createdAt: room.createdAt,
    customLogoUrl: room.customLogoUrl,
    customBgUrl: room.customBgUrl,
    bgTheme: room.bgTheme,
    unlockAt: room.unlockAt,
    isHostConnected: room.isHostConnected,
  };
}

export function emitRoomState(io: RealtimeServer, room: InternalRoomData) {
  io.to(room.roomId).emit('ROOM_STATE_UPDATED', toPublicRoomData(room));
}

export function setupSocketIO(io: RealtimeServer) {
  // Grace period buffers for each room
  const buzzBuffers = new Map<string, { roundId: string, timer: NodeJS.Timeout, buzzes: { participantId: string, timestamp: number, receivedAt: number }[] }>();

  interface SyncStats {
    rttWindow: number[];
    offsetWindow: number[];
    medianRtt: number;
    medianOffset: number;
    jitter: number;
    lastSyncTime: number;
  }
  const socketToSyncStats = new Map<string, SyncStats>();

  // Authenticate host sockets only through the httpOnly host cookie.
  io.use(async (socket, next) => {
    try {
      const token = getHostTokenFromCookie(socket.handshake.headers.cookie);
      if (!token) {
        return next();
      }

      const validation = await validateHostToken(token);
      if (!validation.valid) return next(socketAuthError(validation.code));

      socket.data.userId = validation.identity.userId;
      socket.data.sessionId = validation.identity.sessionId;
      return next();
    } catch {
      return next(socketAuthError('AUTH_SESSION_INVALID'));
    }
  });

  appEvents.on('host_logout', (sessionId: string) => {
    for (const [socketId, socket] of io.sockets.sockets.entries()) {
      if (socket.data.sessionId === sessionId) {
        socket.data.intentionalLogout = true;
        const roomId = socketToRoom.get(socketId);
        if (roomId) {
          const room = rooms.get(roomId);
          if (room) {
            void finishAndDeleteRoom(
              roomId,
              'Ведущий завершил сессию',
              'Error saving history on host logout:',
              io,
              buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
              [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers],
              participantDisconnectTimers,
            );
          }
        }
        socket.disconnect(true);
      }
    }
  });

  appEvents.on('host_sessions_revoked', (sessionIds) => {
    const revokedSessionIds = new Set(sessionIds);
    for (const socket of io.sockets.sockets.values()) {
      if (socket.data.sessionId && revokedSessionIds.has(socket.data.sessionId)) socket.disconnect(true);
    }
  });

  io.on('connection', (socket: RealtimeSocket) => {

    // Time Sync
    socket.on('SYNC_TIME', withValidation(SyncTimeSchema, 'SYNC_TIME', (_clientTime, callback) => {
      if (callback) callback(Date.now());
    }));

    socket.on('SYNC_ACK', withValidation(SyncAckSchema, 'SYNC_ACK', (data: { clientTime: number, serverTime: number, clientReceiveTime: number }) => {
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
    }));

    socket.on('disconnect', () => {
      socketToSyncStats.delete(socket.id);
      cleanupValidationRateLimits(socket.id);
    });

    // Create Room (Host only)
    socket.on('ROOM_CREATE', async (...args: unknown[]) => {
      const [firstArgument, secondArgument] = args;
      const callback = typeof firstArgument === 'function'
        ? firstArgument as (result: RoomCreateResult) => void
        : typeof secondArgument === 'function'
          ? secondArgument as (result: RoomCreateResult) => void
          : undefined;

      if (args.length !== 1 || typeof firstArgument !== 'function') {
        if (callback) callback({ success: false, error: 'Некорректные данные' });
        return;
      }

      try {
        const sessionRejection = await requireAuthenticatedHostSession(socket, 'ROOM_CREATE');
        if (sessionRejection) {
          if (callback) callback(sessionRejection);
          return;
        }

        const userId = socket.data.userId;
        if (!userId) {
          if (callback) callback({ success: false, error: 'Ошибка авторизации' });
          return;
        }

        const user = await prisma.hostUser.findUnique({
          where: { id: userId },
          include: { subscription: true, settings: true },
        });

        if (!user || !user.subscription || user.subscription.status !== 'active' || user.subscription.currentPeriodEnd < new Date()) {
          if (callback) return callback({ success: false, error: 'Для создания комнаты нужна активная подписка' });
          return;
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
          [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers],
          participantDisconnectTimers
        );

        if (callback) callback({ success: true, room: toPublicRoomData(room) });
      } catch (error) {
        if (callback) callback({ success: false, error: 'Ошибка авторизации' });
      }
    });

    // Rejoin Room (Host only)
    socket.on('HOST_REJOIN_ROOM', withValidation(HostRejoinRoomSchema, 'HOST_REJOIN_ROOM', async ({ roomId }, callback) => {
      if (!roomId || typeof roomId !== 'string') {
        if (callback) return callback({ success: false, error: 'Комната недоступна' });
        return;
      }

      const sessionRejection = await requireAuthenticatedHostSession(socket, 'HOST_REJOIN_ROOM');
      if (sessionRejection) {
        if (callback) callback({ success: false, error: 'Комната недоступна' });
        return;
      }

      const userId = socket.data.userId;
      if (!userId) {
        if (callback) return callback({ success: false, error: 'Комната недоступна' });
        return;
      }

      const room = rooms.get(roomId);
      if (!room) {
        if (callback) return callback({ success: false, error: 'Комната недоступна' });
        return;
      }

      if (room.hostUserId !== userId) {
        if (callback) return callback({ success: false, error: 'Комната недоступна' });
        return;
      }

      if (room.roundState === RoomState.FINISHED) {
        if (callback) return callback({ success: false, error: 'Комната недоступна' });
        return;
      }

      reattachHostToRoom(socket, room, io);

      emitRoomState(io, room);

      if (callback) callback({ success: true, room: toPublicRoomData(room) });
    }));

    // Join Room (Participant)
    socket.on('ROOM_JOIN', withValidation(RoomJoinSchema, 'ROOM_JOIN', ({ roomCode, displayName }, callback) => {
      if (socket.data.role === 'host') {
        if (callback) return callback(rejectSocketAction('ROOM_JOIN', 'host_cannot_join', socket.id));
        return;
      }
      if (socket.data.role === 'participant') {
        if (callback) return callback(rejectSocketAction('ROOM_JOIN', 'already_joined', socket.id));
        return;
      }

      if (!displayName || displayName.trim().length === 0) {
        if (callback) return callback({ success: false, error: 'Введите имя' });
        return;
      }

      // Sanitize displayName to prevent injection
      const safeDisplayName = xss(displayName).trim().substring(0, 20);
      if (safeDisplayName.length === 0) {
        if (callback) return callback({ success: false, error: 'Недопустимое имя' });
        return;
      }

      const room = getRoomByCode(roomCode);
      if (!room) {
        if (callback) return callback({ success: false, error: 'Комната не найдена' });
        return;
      }

      // Block joining a finished or expired room
      if (room.roundState === RoomState.FINISHED) {
        if (callback) return callback({ success: false, error: 'Игра уже завершена' });
        return;
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

      // Emit room state without hashes
      emitRoomState(io, room);

      const { reconnectTokenHash: _hash, ...safeParticipant } = participant;
      if (callback) { const { socketId, reconnectTokenHash, ...pubParticipant } = participant; callback({ success: true, participant: pubParticipant, room: toPublicRoomData(room), reconnectToken }); }
    }));

    // Rejoin Room (Participant)
    socket.on('PARTICIPANT_REJOIN', withValidation(ParticipantRejoinSchema, 'PARTICIPANT_REJOIN', ({ roomCode, participantId, reconnectToken }, callback) => {
      const room = getRoomByCode(roomCode);
      if (!room) {
        if (callback) return callback({ success: false, error: 'Комната не найдена' });
        return;
      }

      if (room.roundState === RoomState.FINISHED) {
        if (callback) return callback({ success: false, error: 'Игра уже завершена' });
        return;
      }

      const participant = room.participants.find(p => p.id === participantId);
      if (!participant || !participant.reconnectTokenHash) {
        if (callback) return callback({ success: false, error: 'Участник не найден или недействителен' });
        return;
      }

      const hash = crypto.createHash('sha256').update(reconnectToken).digest('hex');
      if (participant.reconnectTokenHash !== hash) {
        if (callback) return callback({ success: false, error: 'Неверный токен восстановления' });
        return;
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

      emitRoomState(io, room);

      const { reconnectTokenHash: _hash, ...safeParticipant } = participant;
      if (callback) { const { socketId, reconnectTokenHash, ...pubParticipant } = participant; callback({ success: true, participant: pubParticipant, room: toPublicRoomData(room) }); }
    }));

    // Start Round (Host)
    socket.on('ROUND_START', withValidation(RoundStartSchema, 'ROUND_START', async (_data, callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });

      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      const rejection = await requireHostSocket(socket, room, 'ROUND_START');
      if (rejection) return callback && callback(rejection);

      if (room.roundState !== RoomState.WAITING) {
        return callback && callback({ success: false, error: 'Раунд можно начать только из режима ожидания' });
      }

      const existingBuffer = buzzBuffers.get(roomId);
      if (existingBuffer) {
        clearTimeout(existingBuffer.timer);
        buzzBuffers.delete(roomId);
      }

      room.roundState = RoomState.ACTIVE;
      room.roundId = crypto.randomUUID();
      room.firstBuzzerId = null;
      room.unlockAt = Date.now() + 150; // Scheduled unlock buffer

      emitRoomState(io, room);
      if (callback) callback({ success: true });
    }));

    // Rate limiting map for BUZZ_SUBMIT
    const buzzRateLimits = new Map<string, number>();

    // Submit Buzz (Participant)
    socket.on('BUZZ_SUBMIT', withValidation(BuzzSubmitStrictSchema, 'BUZZ_SUBMIT', (data, callback) => {
      const receivedAt = Date.now();
      const clientPressedAt = data?.clientPressedAt ?? Date.now();
      const actualCallback: ((result: BuzzSubmitResult) => void) | undefined = callback;

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
      if (!buffer || buffer.roundId !== room.roundId) {
        if (buffer) clearTimeout(buffer.timer);
        buffer = {
          roundId: room.roundId,
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
              const currentRoom = rooms.get(roomId);
              const winner = b.buzzes[0];

              if (currentRoom && currentRoom.roundState === RoomState.ACTIVE && currentRoom.roundId === b.roundId) {
                // Find if participant is still in the room
                const winnerParticipant = currentRoom.participants.find(p => p.id === winner.participantId);
                if (winnerParticipant) {
                  currentRoom.firstBuzzerId = winnerParticipant.id;
                  currentRoom.roundState = RoomState.REVEALED;
                  emitRoomState(io, currentRoom);
                }
              }
            }
            buzzBuffers.delete(roomId);
          }, 250) // 250ms grace period
        };
        buzzBuffers.set(roomId, buffer);
      }

      buffer.buzzes.push({ participantId: socket.data.participantId!, timestamp: validatedPressedAt, receivedAt });

      if (actualCallback) actualCallback({ success: true, status: 'accepted' });
    }));

    // Reset Round (Host)
    socket.on('ROUND_RESET', withValidation(RoundResetSchema, 'ROUND_RESET', async (data, callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });

      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      const rejection = await requireHostSocket(socket, room, 'ROUND_RESET');
      if (rejection) return callback && callback(rejection);

      if (room.roundState !== RoomState.REVEALED) {
        return callback && callback({ success: false, error: 'Сброс возможен только после ответа' });
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

      emitRoomState(io, room);

      if (callback) callback({ success: true });
    }));

    socket.on('HOST_CLEAR_SCORES', withValidation(HostClearScoresSchema, 'HOST_CLEAR_SCORES', async (_data, callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });

      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      const rejection = await requireHostSocket(socket, room, 'HOST_CLEAR_SCORES');
      if (rejection) return callback && callback(rejection);

      if (room.roundState === RoomState.FINISHED) {
        return callback && callback({ success: false, error: 'Игра уже завершена' });
      }

      for (const participant of room.participants) {
        participant.score = 0;
      }

      emitRoomState(io, room);
      if (callback) callback({ success: true });
    }));

    // Finish Room (Host)
    socket.on('ROOM_FINISH', withValidation(EmptyPayloadSchema, 'ROOM_FINISH', async (_data, callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Вы не в комнате' });

      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Комната не найдена' });

      const rejection = await requireHostSocket(socket, room, 'ROOM_FINISH');
      if (rejection) return callback && callback(rejection);

      if (room.roundState === RoomState.FINISHED) {
        return callback && callback({ success: false, error: 'Игра уже завершена' });
      }

      const prevRoundState = room.roundState;
      const prevGameResult = room.gameResult;
      const prevWinnerName = room.winnerName;

      try {
        await finishRoom(room);
      } catch (err) {
        // Revert temporary state
        room.roundState = prevRoundState;
        room.gameResult = prevGameResult;
        room.winnerName = prevWinnerName;
        return callback && callback({ success: false, error: 'Не удалось сохранить результаты игры' });
      }

      emitRoomState(io, room);

      // Schedule 5-minute post-finish cleanup
      schedulePostFinishCleanup(
        roomId,
        io,
        buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
        [hostDisconnectTimers, postFinishTimers, maxLifetimeTimers],
        participantDisconnectTimers
      );

      if (callback) callback({ success: true });
    }));

    socket.on('ROOM_LEAVE', withValidation(EmptyPayloadSchema, 'ROOM_LEAVE', () => {
      handleDisconnect(socket);
    }));

    socket.on('disconnect', () => {
      handleDisconnect(socket);
    });
  });

  function handleDisconnect(socket: RealtimeSocket) {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      const participant = room.participants.find(p => p.socketId === socket.id);
      if (participant) {
        participant.isConnected = false;
        emitRoomState(io, room);

        // Schedule 5-minute disconnect timer
        const timerKey = `${roomId}_${participant.id}`;
        const timer = setTimeout(() => {
          const currentRoom = rooms.get(roomId);
          const currentParticipant = currentRoom?.participants.find(p => p.id === participant.id);
          if (currentRoom && currentParticipant && !currentParticipant.isConnected) {
            currentParticipant.socketId = '';
            currentParticipant.reconnectTokenHash = undefined;
            emitRoomState(io, currentRoom);
          }
          participantDisconnectTimers.delete(timerKey);
        }, 5 * 60 * 1000);
        participantDisconnectTimers.set(timerKey, timer);

      } else if (room.hostSocketId === socket.id) {
        if (!socket.data.intentionalLogout) {
          startHostReconnectTimeout(
            roomId,
            io,
            buzzBuffers as Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
            undefined,
            participantDisconnectTimers,
          );
          emitRoomState(io, room);
        }
      }
    }

    socketToRoom.delete(socket.id);
  }
}
