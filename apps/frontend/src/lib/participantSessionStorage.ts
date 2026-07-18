export const PARTICIPANT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

export type ParticipantSession = {
  participantId: string;
  reconnectToken: string;
  createdAt: string;
  expiresAt: string;
};

function storageKey(roomCode: string): string {
  return `quiz_participant_${roomCode}`;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isSession(value: unknown): value is ParticipantSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as ParticipantSession;
  return typeof session.participantId === "string" && session.participantId.length > 0
    && typeof session.reconnectToken === "string" && session.reconnectToken.length > 0
    && isIsoDate(session.createdAt)
    && isIsoDate(session.expiresAt)
    && Date.parse(session.createdAt) < Date.parse(session.expiresAt);
}

export function readParticipantSession(roomCode: string | undefined): ParticipantSession | null {
  if (!roomCode) return null;
  const key = storageKey(roomCode);
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  try {
    const session = JSON.parse(stored);
    if (!isSession(session) || Date.parse(session.expiresAt) <= Date.now()) {
      localStorage.removeItem(key);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function saveParticipantSession(roomCode: string | undefined, participantId: string, reconnectToken: string): void {
  if (!roomCode) return;
  const createdAt = new Date();
  localStorage.setItem(storageKey(roomCode), JSON.stringify({
    participantId,
    reconnectToken,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + PARTICIPANT_SESSION_TTL_MS).toISOString(),
  }));
}

export function removeParticipantSession(roomCode: string | undefined): void {
  if (roomCode) localStorage.removeItem(storageKey(roomCode));
}
