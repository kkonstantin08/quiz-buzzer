// Shared Event Types and States

export enum RoomState {
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  BUZZED_HIDDEN = 'BUZZED_HIDDEN',
  REVEALED = 'REVEALED',
  FINISHED = 'FINISHED',
}

export interface Participant {
  id: string;
  displayName: string;
  socketId: string;
  joinedAt: number;
  isConnected: boolean;
  score: number;
}

export interface RoomData {
  roomId: string;
  roomCode: string;
  hostUserId: string;
  hostSocketId: string;
  participants: Participant[];
  roundState: RoomState;
  firstBuzzerId: string | null;
  createdAt: number;
  customLogoUrl?: string | null;
  unlockAt?: number | null;
}

// Client -> Server Events
export interface ClientToServerEvents {
  ROOM_CREATE: (token: string, callback: (res: { success: boolean, room?: RoomData, error?: string }) => void) => void;
  ROOM_JOIN: (data: { roomCode: string, displayName: string }, callback: (res: { success: boolean, participant?: Participant, room?: RoomData, error?: string }) => void) => void;
  ROUND_START: (callback?: (res: { success: boolean, error?: string }) => void) => void;
  BUZZ_SUBMIT: (data: { clientPressedAt: number }, callback?: (res: { success: boolean, error?: string }) => void) => void;
  FIRST_REVEAL: (callback?: (res: { success: boolean, error?: string }) => void) => void;
  ROUND_RESET: (data?: { winnerId?: string | null }, callback?: (res: { success: boolean, error?: string }) => void) => void;
  ROOM_FINISH: (callback?: (res: { success: boolean, error?: string }) => void) => void;
  ROOM_LEAVE: () => void;
  SYNC_TIME: (clientTime: number, callback: (serverTime: number) => void) => void;
  SYNC_ACK: (data: { clientTime: number, serverTime: number, clientReceiveTime: number }) => void;
  HOST_CLEAR_SCORES: (data: { roomId: string }, callback?: (res: { success: boolean, error?: string }) => void) => void;
}

// Server -> Client Events
export interface ServerToClientEvents {
  ROOM_STATE_UPDATED: (room: RoomData) => void;
  PARTICIPANT_JOINED: (participant: Participant) => void;
  PARTICIPANT_LEFT: (participantId: string) => void;
  ROUND_STARTED: () => void;
  ROUND_LOCKED: () => void;
  BUZZ_RECORDED_HIDDEN: () => void;
  FIRST_REVEALED: (firstBuzzerId: string) => void;
  ROUND_RESET_DONE: () => void;
  ROOM_FINISHED: (data: { winnerName: string | null, winnerScore: number }) => void;
  ERROR_EVENT: (error: string) => void;
}
