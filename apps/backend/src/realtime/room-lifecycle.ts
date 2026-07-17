import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { InternalRoomData, RoomState, GameResult } from 'shared';
import { rooms, deleteRoom } from '../rooms';
import { prisma } from '../prisma';

// ---------------------------------------------------------------------------
// Timer registries
// ---------------------------------------------------------------------------
export const postFinishTimers = new Map<string, NodeJS.Timeout>();
export const maxLifetimeTimers = new Map<string, NodeJS.Timeout>();

// Mockable timer loader (allows fake timers in tests without freezing Socket.io)
export const lifecycleTimerLoader = {
  setTimeout: (cb: () => void, ms: number): NodeJS.Timeout => {
    const timer = setTimeout(cb, ms);
    if (timer.unref) timer.unref();
    return timer;
  },
  clearTimeout: (t: NodeJS.Timeout) => clearTimeout(t),
};

export function calculateGameResult(room: InternalRoomData): void {
  room.gameResult = GameResult.NO_WINNER;
  room.winnerName = null;

  if (room.participants.length > 0) {
    const sorted = [...room.participants].sort((a, b) => b.score - a.score);
    const topScore = sorted[0].score;

    if (topScore > 0) {
      // Check for draw
      const topScorers = sorted.filter(p => p.score === topScore);
      if (topScorers.length > 1) {
        room.gameResult = GameResult.DRAW;
      } else {
        room.gameResult = GameResult.WINNER;
        room.winnerName = topScorers[0].displayName;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// History persistence (idempotent)
// ---------------------------------------------------------------------------
export async function saveGameHistory(
  room: InternalRoomData,
  prisma: PrismaClient
): Promise<void> {
  if (room.historySaved) return; // Already saved — skip

  room.historySaved = true;

  let winnerScore = 0;
  if (room.participants.length > 0) {
    const sorted = [...room.participants].sort((a, b) => b.score - a.score);
    winnerScore = sorted[0].score;
  }

  try {
    await prisma.gameHistory.create({
      data: {
        hostUserId: room.hostUserId,
        roomCode: room.roomCode,
        result: room.gameResult || 'NO_WINNER',
        winnerName: room.winnerName,
        winnerScore,
        participants: room.participants.length,
      },
    });
  } catch (err) {
    console.error('Failed to save game history:', err);
    // Reset flag so a retry is possible on transient DB errors
    room.historySaved = false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Post-finish 5-minute cleanup
// ---------------------------------------------------------------------------
export function schedulePostFinishCleanup(
  roomId: string,
  io: Server,
  buzzBuffers: Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
  extraTimers: Map<string, NodeJS.Timeout>[]
): void {
  // Cancel any existing post-finish timer
  const existing = postFinishTimers.get(roomId);
  if (existing) {
    lifecycleTimerLoader.clearTimeout(existing);
    postFinishTimers.delete(roomId);
  }

  const timer = lifecycleTimerLoader.setTimeout(() => {
    postFinishTimers.delete(roomId);
    const { participantDisconnectTimers } = require('./index');
    deleteRoom(roomId, 'игра завершена', io, buzzBuffers, [
      ...extraTimers,
      maxLifetimeTimers,
    ], participantDisconnectTimers);
  }, 5 * 60 * 1000); // 5 minutes

  postFinishTimers.set(roomId, timer);
}

// ---------------------------------------------------------------------------
// Max 24-hour lifetime cleanup
// ---------------------------------------------------------------------------
export function scheduleMaxLifetimeCleanup(
  roomId: string,
  io: Server,
  buzzBuffers: Map<string, { timer: NodeJS.Timeout; buzzes: unknown[] }>,
  extraTimers: Map<string, NodeJS.Timeout>[]
): void {
  // Cancel any existing max-lifetime timer
  const existing = maxLifetimeTimers.get(roomId);
  if (existing) {
    lifecycleTimerLoader.clearTimeout(existing);
    maxLifetimeTimers.delete(roomId);
  }

  const room = rooms.get(roomId);
  const createdAt = room?.createdAt ?? Date.now();
  const delay = Math.max(0, createdAt + 24 * 60 * 60 * 1000 - Date.now());

  const timer = lifecycleTimerLoader.setTimeout(() => {
    maxLifetimeTimers.delete(roomId);

    (async () => {
      const r = rooms.get(roomId);
      try {
        if (r && r.roundState !== RoomState.FINISHED) {
          r.roundState = RoomState.FINISHED;
          calculateGameResult(r);
        }
        if (r) {
          await saveGameHistory(r, prisma);
        }
      } catch (err) {
        console.error('Error saving history on max lifetime cleanup:', err);
      } finally {
        const { participantDisconnectTimers } = require('./index');
        deleteRoom(roomId, 'время комнаты истекло', io, buzzBuffers, [
          ...extraTimers,
          postFinishTimers,
        ], participantDisconnectTimers);
      }
    })();
  }, delay);

  maxLifetimeTimers.set(roomId, timer);
}

// ---------------------------------------------------------------------------
// Cancel all lifecycle timers for a room (called by deleteRoom indirectly)
// ---------------------------------------------------------------------------
export function cancelRoomLifecycleTimers(roomId: string): void {
  const pt = postFinishTimers.get(roomId);
  if (pt) {
    lifecycleTimerLoader.clearTimeout(pt);
    postFinishTimers.delete(roomId);
  }
  const lt = maxLifetimeTimers.get(roomId);
  if (lt) {
    lifecycleTimerLoader.clearTimeout(lt);
    maxLifetimeTimers.delete(roomId);
  }
}
