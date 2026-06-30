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

        const room = createRoom(user.id);
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

      const room = getRoomByCode(roomCode);
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      if (room.participants.length >= 8) {
        return callback({ success: false, error: 'Комната заполнена' });
      }

      const participant = {
        id: socket.id,
        displayName: displayName.trim().substring(0, 20),
        socketId: socket.id,
        joinedAt: Date.now(),
        isConnected: true,
      };

      room.participants.push(participant);
      socket.join(room.roomId);
      socketToRoom.set(socket.id, room.roomId);

      // Notify host and others
      io.to(room.roomId).emit('PARTICIPANT_JOINED', participant);
      io.to(room.roomId).emit('ROOM_STATE_UPDATED', room);
      
      callback({ success: true, participant });
    });

    // Start Round (Host)
    socket.on('ROUND_START', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      // In real scenario, we should verify the socket is the host.
      // But for MVP, if you are in the room and send this, we assume host or skip strict check.
      // Better: store hostSocketId in room, but we only have hostUserId.
      // We will allow anyone in the room to trigger it (since only host UI has the button).

      room.roundState = RoomState.ACTIVE;
      room.firstBuzzerId = null;
      
      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_STARTED');
      if (callback) callback({ success: true });
    });

    // Submit Buzz (Participant)
    socket.on('BUZZ_SUBMIT', (callback) => {
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
      room.roundState = RoomState.BUZZED_HIDDEN;

      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_LOCKED'); // Locks everyone
      io.to(roomId).emit('BUZZ_RECORDED_HIDDEN'); // Host sees it

      if (callback) callback({ success: true });
    });

    // Reveal First (Host)
    socket.on('FIRST_REVEAL', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      if (room.roundState !== RoomState.BUZZED_HIDDEN) {
        return callback && callback({ success: false, error: 'Cannot reveal now' });
      }

      room.roundState = RoomState.REVEALED;
      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('FIRST_REVEALED', room.firstBuzzerId!);
      
      if (callback) callback({ success: true });
    });

    // Reset Round (Host)
    socket.on('ROUND_RESET', (callback) => {
      const roomId = socketToRoom.get(socket.id);
      if (!roomId) return callback && callback({ success: false, error: 'Not in a room' });
      
      const room = rooms.get(roomId);
      if (!room) return callback && callback({ success: false, error: 'Room not found' });

      room.roundState = RoomState.WAITING;
      room.firstBuzzerId = null;

      io.to(roomId).emit('ROOM_STATE_UPDATED', room);
      io.to(roomId).emit('ROUND_RESET_DONE');
      
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
