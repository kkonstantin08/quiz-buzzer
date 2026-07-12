import { z } from 'zod';

export const RoomCreateSchema = z.string().max(4096).optional(); // token is optional string, JWTs can be long

export const RoomJoinSchema = z.object({
  roomCode: z.string().min(1).max(10), // Assuming room code is a short string, usually 6 chars
  displayName: z.string().min(1).max(50),
}).strict();

export const ParticipantRejoinSchema = z.object({
  roomCode: z.string().min(1).max(10),
  participantId: z.string().uuid().or(z.string().max(50)), // Fallback max 50 if not strict uuid
  reconnectToken: z.string().min(1).max(128),
}).strict();

export const RoundStartSchema = z.void().or(z.undefined()); // No arguments expected

export const BuzzSubmitStrictSchema = z.object({
  clientPressedAt: z.number().finite().nonnegative().max(Date.now() + 86400000 * 365),
}).strict().optional();

export const RoundResetSchema = z.object({
  winnerId: z.string().max(128).nullable().optional(),
}).strict().optional();

export const SyncTimeSchema = z.number().finite().nonnegative();

export const SyncAckSchema = z.object({
  clientTime: z.number().finite().nonnegative(),
  serverTime: z.number().finite().nonnegative(),
  clientReceiveTime: z.number().finite().nonnegative(),
}).strict();

export const HostClearScoresSchema = z.void().or(z.undefined()).or(z.null()).or(z.object({}).strict());

export const HostRejoinRoomSchema = z.object({
  roomId: z.string().max(128),
}).strict();

export const EmptyPayloadSchema = z.void().or(z.undefined()).or(z.null()).or(z.object({}).strict());
