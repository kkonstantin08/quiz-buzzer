import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { config } from '../config';
import { rooms, socketToRoom, createRoom, getRoomByCode } from '../rooms';
import { RoomState, ClientToServerEvents, ServerToClientEvents, RoomData } from 'shared';

export function setupSocketIO(io: Server<ClientToServerEvents, ServerToClientEvents>) {
  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    
    // Create Room (Host only)
    socket.on('ROOM_CREATE', async (token, callback) => {
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
        const user = await prisma.hostUser.findUnique({
          where: { id: decoded.userId },
          include: { subscription: true },
        });

        if (!user || !user.subscription || user.subscription.status !== 'active' || user.subscription.currentPeriodEnd < new Date()) {
          return callback({ success: false, error: 'Для создания комнаты нужна активная подписка' });
        }

        const room = createRoom(user.id, socket.id);
        socket.join(room.roomId);
        socketToRoom.set(socket.id, room.roomId);
        callback({ success: true, room });
      } catch (error) {
        callback({ success: false, error: 'Authentication failed' });
      }
    });

    // Join Room (Participant)
    socket.on('ROOM_JOIN', ({ roomCode, displayName }, callback) => {
      if (!displayName || displayName.trim().length === 0) {
        return callback({ success: false, error: 'Name is required' });
      }

      // Sanitize displayName to prevent injection
      const safeDisplayName = displayName.replace(/[<>]/g, '').trim().substring(0, 20);
      if (safeDisplayName.length === 0) {
        return callback({ success: false, error: 'Invalid name' });
      }

      const room = getRoomByCode(roomCode);
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      if (room.participants.length >= 8) {
        return callback({ success: false, error: 'Комната заполнена' });
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
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Unauthorized: Only host can perform this action' });
      }

      room.roundState = RoomState.ACTIVE;
      room.firstBuzzerId = null;
      
      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_STARTED');
      if (callback) callback({ success: true });
    });

    // Rate limiting map for BUZZ_SUBMIT
    const buzzRateLimits = new Map<string, number>();

    // Submit Buzz (Participant)
    socket.on('BUZZ_SUBMIT', (callback) => {
      const now = Date.now();
      const lastBuzz = buzzRateLimits.get(socket.id) || 0;
      if (now - lastBuzz < 500) { // 500ms limit
        return callback && callback({ success: false, error: 'Too many requests' });
      }
      buzzRateLimits.set(socket.id, now);

      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      if (room.roundState !== RoomState.ACTIVE) {
        return callback && callback({ success: false, error: 'Round is not active' });
      }

      // First one wins
      if (room.firstBuzzerId) {
        return callback && callback({ success: false, error: 'Too late' });
      }

      room.firstBuzzerId = socket.id;
      room.roundState = RoomState.REVEALED;

      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_LOCKED'); // Locks everyone optimistically
      io.to(roomId).emit('FIRST_REVEALED', room.firstBuzzerId);

      if (callback) callback({ success: true });
    });

    // Reveal First (Host)
    socket.on('FIRST_REVEAL', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Unauthorized: Only host can perform this action' });
      }

      if (room.roundState !== RoomState.BUZZED_HIDDEN) {
        return callback && callback({ success: false, error: 'Cannot reveal now' });
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
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Unauthorized: Only host can perform this action' });
      }

      if (data?.winnerId) {
        const winner = room.participants.find(p => p.id === data.winnerId);
        if (winner) winner.score += 1;
      }

      room.roundState = RoomState.WAITING;
      room.firstBuzzerId = null;

      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_RESET_DONE');
      
      if (callback) callback({ success: true });
    });

    // Finish Room (Host)
    socket.on('ROOM_FINISH', async (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      if (room.hostSocketId !== socket.id) {
        return callback && callback({ success: false, error: 'Unauthorized: Only host can perform this action' });
      }

      if (room.roundState === RoomState.FINISHED) {
        return callback && callback({ success: false, error: 'Room already finished' });
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
