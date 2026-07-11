import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import { RoomData, RoomState } from 'shared';
import { rooms, deleteRoom } from '../rooms';

// ---------------------------------------------------------------------------
// Timer registries
// ---------------------------------------------------------------------------
export const postFinishTimers = new Map<string, NodeJS.Timeout>();
export const maxLifetimeTimers = new Map<string, NodeJS.Timeout>();

// Mockable timer loader (allows fake timers in tests without freezing Socket.io)
export const lifecycleTimerLoader = {
  setTimeout: (cb: () => void, ms: number): NodeJS.Timeout => setTimeout(cb, ms),
  clearTimeout: (t: NodeJS.Timeout) => clearTimeout(t),
};

// ---------------------------------------------------------------------------
// History persistence (idempotent)
// ---------------------------------------------------------------------------
export async function saveGameHistory(
  room: RoomData,
  prisma: PrismaClient
): Promise<void> {
  if (room.historySaved) return; // Already saved — skip
  if (room.participants.length === 0) return; // No participants — do not record

  room.historySaved = true;

  let winnerName: string | null = null;
  let winnerScore = 0;

  const sorted = [...room.participants].sort((a, b) => b.score - a.score);
  winnerScore = sorted[0].score;
  if (winnerScore > 0) {
    winnerName = sorted[0].displayName;
  }

  try {
    await prisma.gameHistory.create({
      data: {
        hostUserId: room.hostUserId,
        roomCode: room.roomCode,
        winnerName: winnerName || 'Ничья / Нет победителя',
        winnerScore,
        participants: room.participants.length,
      },
    });
  } catch (err) {
    console.error('Failed to save game history:', err);
    // Reset flag so a retry is possible on transient DB errors
    room.historySaved = false;
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
    // Mark finished if not already, then save history before deletion
    const r = rooms.get(roomId);
    if (r && r.roundState !== RoomState.FINISHED) {
      r.roundState = RoomState.FINISHED;
    }
    const { participantDisconnectTimers } = require('./index');
    deleteRoom(roomId, 'время комнаты истекло', io, buzzBuffers, [
      ...extraTimers,
      postFinishTimers,
    ], participantDisconnectTimers);
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
