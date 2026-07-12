// Shared Event Types and States

export enum RoomState {
  WAITING = 'WAITING',
  ACTIVE = 'ACTIVE',
  BUZZED_HIDDEN = 'BUZZED_HIDDEN',
  REVEALED = 'REVEALED',
  FINISHED = 'FINISHED',
}

export interface PublicParticipant {
  id: string;
  displayName: string;
  joinedAt: number;
  isConnected: boolean;
  score: number;
}

export interface InternalParticipant extends PublicParticipant {
  socketId: string;
  reconnectTokenHash?: string;
}

export interface PublicRoomData {
  roomId: string;
  roomCode: string;
  participants: PublicParticipant[];
  roundState: RoomState;
  firstBuzzerId: string | null;
  createdAt: number;
  customLogoUrl?: string | null;
  customBgUrl?: string | null;
  bgTheme?: string;
  unlockAt?: number | null;
  isHostConnected?: boolean;
}

export interface InternalRoomData extends Omit<PublicRoomData, 'participants'> {
  hostUserId: string;
  hostSocketId: string;
  participants: InternalParticipant[];
  historySaved?: boolean;
  roundId: string;
}

import { z } from 'zod';
import * as schemas from './schemas';

export * from './schemas';

// Infer types from Zod schemas
export type RoomJoinPayload = z.infer<typeof schemas.RoomJoinSchema>;
export type ParticipantRejoinPayload = z.infer<typeof schemas.ParticipantRejoinSchema>;
export type BuzzSubmitPayload = z.infer<typeof schemas.BuzzSubmitStrictSchema>;
export type RoundResetPayload = z.infer<typeof schemas.RoundResetSchema>;
export type SyncAckPayload = z.infer<typeof schemas.SyncAckSchema>;
export type HostClearScoresPayload = z.infer<typeof schemas.HostClearScoresSchema>;
export type HostRejoinRoomPayload = z.infer<typeof schemas.HostRejoinRoomSchema>;

export type SocketSuccessResult = {
  success: true;
};

export type SocketErrorResult = {
  success: false;
  error: string;
};

export type RoomCreateResult =
  | (SocketSuccessResult & { room: PublicRoomData })
  | SocketErrorResult;
export type RoomJoinResult =
  | (SocketSuccessResult & {
      participant: PublicParticipant;
      room: PublicRoomData;
      reconnectToken: string;
    })
  | SocketErrorResult;
export type ParticipantRejoinResult =
  | (SocketSuccessResult & { participant: PublicParticipant; room: PublicRoomData })
  | SocketErrorResult;
export type BuzzSubmitResult =
  | (SocketSuccessResult & { status: 'accepted' })
  | SocketErrorResult;
export type HostRejoinRoomResult =
  | (SocketSuccessResult & { room: PublicRoomData })
  | SocketErrorResult;
export type SocketActionResult = SocketSuccessResult | SocketErrorResult;

// Client -> Server Events
export interface ClientToServerEvents {
  ROOM_CREATE: (token: string, callback: (res: RoomCreateResult) => void) => void;
  ROOM_JOIN: (data: RoomJoinPayload, callback: (res: RoomJoinResult) => void) => void;
  PARTICIPANT_REJOIN: (data: ParticipantRejoinPayload, callback: (res: ParticipantRejoinResult) => void) => void;
  ROUND_START: (callback?: (res: SocketActionResult) => void) => void;
  BUZZ_SUBMIT: (data: BuzzSubmitPayload, callback?: (res: BuzzSubmitResult) => void) => void;
  FIRST_REVEAL: (callback?: (res: SocketActionResult) => void) => void;
  ROUND_RESET: (data?: RoundResetPayload, callback?: (res: SocketActionResult) => void) => void;
  ROOM_FINISH: (callback?: (res: SocketActionResult) => void) => void;
  ROOM_LEAVE: () => void;
  SYNC_TIME: (clientTime: number, callback: (serverTime: number) => void) => void;
  SYNC_ACK: (data: SyncAckPayload) => void;
  HOST_CLEAR_SCORES: (data: HostClearScoresPayload, callback?: (res: SocketActionResult) => void) => void;
  HOST_REJOIN_ROOM: (data: HostRejoinRoomPayload, callback: (res: HostRejoinRoomResult) => void) => void;
}

// Server -> Client Events
export interface ServerToClientEvents {
  ROOM_STATE_UPDATED: (room: PublicRoomData) => void;
  ERROR_EVENT: (data: { message: string }) => void;
  HOST_CONTROL_REVOKED: () => void;
  PARTICIPANT_CONTROL_REVOKED: () => void;
  ROOM_CLOSED: (data: { reason: string }) => void;
}
