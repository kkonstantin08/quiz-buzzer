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

// Deprecated: use PublicRoomData or InternalRoomData directly
export type RoomData = InternalRoomData;

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

// Client -> Server Events
export interface ClientToServerEvents {
  ROOM_CREATE: (token: string, callback: (res: { success: boolean, room?: PublicRoomData, error?: string }) => void) => void;
  ROOM_JOIN: (data: RoomJoinPayload, callback: (res: { success: boolean, participant?: PublicParticipant, room?: PublicRoomData, reconnectToken?: string, error?: string }) => void) => void;
  PARTICIPANT_REJOIN: (data: ParticipantRejoinPayload, callback: (res: { success: boolean, participant?: PublicParticipant, room?: PublicRoomData, error?: string }) => void) => void;
  ROUND_START: (callback?: (res: { success: boolean, error?: string }) => void) => void;
  BUZZ_SUBMIT: (data: BuzzSubmitPayload, callback?: (res: { success: boolean, status?: 'accepted', error?: string }) => void) => void;
  FIRST_REVEAL: (callback?: (res: { success: boolean, error?: string }) => void) => void;
  ROUND_RESET: (data?: RoundResetPayload, callback?: (res: { success: boolean, error?: string }) => void) => void;
  ROOM_FINISH: (callback?: (res: { success: boolean, error?: string }) => void) => void;
  ROOM_LEAVE: () => void;
  SYNC_TIME: (clientTime: number, callback: (serverTime: number) => void) => void;
  SYNC_ACK: (data: SyncAckPayload) => void;
  HOST_CLEAR_SCORES: (data: HostClearScoresPayload, callback?: (res: { success: boolean, error?: string }) => void) => void;
  HOST_REJOIN_ROOM: (data: HostRejoinRoomPayload, callback: (res: { success: boolean, room?: PublicRoomData, error?: string }) => void) => void;
}

// Server -> Client Events
export interface ServerToClientEvents {
  ROOM_STATE_UPDATED: (room: PublicRoomData) => void;
  ERROR_EVENT: (data: { message: string }) => void;
  HOST_CONTROL_REVOKED: () => void;
  PARTICIPANT_CONTROL_REVOKED: () => void;
  ROOM_CLOSED: (data: { reason: string }) => void;
}
