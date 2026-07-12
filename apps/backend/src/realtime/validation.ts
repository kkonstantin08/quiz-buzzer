import { z } from 'zod';
import { Socket } from 'socket.io';
import { SocketErrorResult, SocketSuccessResult } from 'shared';
import { socketToRoom } from '../rooms';

const invalidPayloadRates = new Map<string, { count: number; windowStart: number }>();
const MAX_ERRORS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60000;
type ValidationCallbackResult = (SocketSuccessResult & Record<string, unknown>) | SocketErrorResult | number;
type ValidationCallback = (result: ValidationCallbackResult) => void;

export function withValidation<T>(
  schema: z.ZodSchema<T>,
  eventName: string,
  handler: (data: T, callback?: ValidationCallback) => void,
) {
  return function (this: Socket, dataOrCallback?: unknown, maybeCallback?: unknown) {
    const socket = this;
    const isCallbackFirst = typeof dataOrCallback === 'function';
    const data = isCallbackFirst ? undefined : dataOrCallback;
    const callback = (isCallbackFirst ? dataOrCallback : maybeCallback) as ValidationCallback | undefined;

    // Rate limiting check
    const now = Date.now();
    let rateData = invalidPayloadRates.get(socket.id);
    if (!rateData || now - rateData.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateData = { count: 0, windowStart: now };
      invalidPayloadRates.set(socket.id, rateData);
    }

    if (rateData.count >= MAX_ERRORS_PER_MINUTE) {
      const errorMsg = 'Слишком много невалидных запросов';
      if (typeof callback === 'function') {
        callback({ success: false, error: errorMsg });
      } else {
        socket.emit('ERROR_EVENT', { message: errorMsg });
      }
      return; // Do not process further
    }

    // Validation
    const result = schema.safeParse(data);
    if (!result.success) {
      rateData.count++;
      
      const errorDetails = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      
      console.warn(JSON.stringify({
        event: 'socket_payload_validation_failed',
        eventName,
        socketId: socket.id,
        roomId: socketToRoom.get(socket.id),
        errors: errorDetails
      }));

      const errorMsg = 'Некорректные данные';
      if (typeof callback === 'function') {
        callback({ success: false, error: errorMsg });
      } else {
        socket.emit('ERROR_EVENT', { message: errorMsg });
      }
      return;
    }

    handler.call(socket, result.data, callback);
  };
}

// Clean up disconnected sockets from rate limit map to prevent memory leak
export function cleanupValidationRateLimits(socketId: string) {
  invalidPayloadRates.delete(socketId);
}
