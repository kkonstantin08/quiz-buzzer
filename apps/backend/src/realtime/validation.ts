import { z } from 'zod';
import { Socket } from 'socket.io';
import { socketToRoom } from '../rooms';

const invalidPayloadRates = new Map<string, { count: number; windowStart: number }>();
const MAX_ERRORS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60000;

export function withValidation<T>(
  schema: z.ZodSchema<T>,
  eventName: string,
  handler: (data: T, callback?: any) => void
) {
  return function (this: Socket, dataOrCallback?: any, maybeCallback?: any) {
    const socket = this;
    const isCallbackFirst = typeof dataOrCallback === 'function';
    const data = isCallbackFirst ? undefined : dataOrCallback;
    const callback = isCallbackFirst ? dataOrCallback : maybeCallback;

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
        socket.emit('ERROR_EVENT', errorMsg);
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
        socket.emit('ERROR_EVENT', errorMsg);
      }
      return;
    }

    // Call the original handler with validated data
    if (isCallbackFirst) {
      (handler as any).call(socket, result.data as T, callback);
    } else {
      (handler as any).call(socket, result.data as T, callback);
    }
  };
}

// Clean up disconnected sockets from rate limit map to prevent memory leak
export function cleanupValidationRateLimits(socketId: string) {
  invalidPayloadRates.delete(socketId);
}
