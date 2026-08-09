import { EventEmitter } from 'events';

type AppEvents = {
  host_logout: [sessionId: string];
  host_sessions_revoked: [sessionIds: string[]];
  host_logout_all: [userId: string, sessionIds: string[]];
  host_account_deleted: [userId: string];
};

class AppEventEmitter extends EventEmitter<AppEvents> {}

export const appEvents = new AppEventEmitter();

function safeErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    && typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code)
    ? error.code
    : 'UNKNOWN';
}

export function emitAppEventBestEffort<Event extends keyof AppEvents>(event: Event, ...args: AppEvents[Event]) {
  try {
    const emitter: EventEmitter = appEvents;
    emitter.emit(event, ...args);
  } catch (error) {
    console.error(JSON.stringify({ event: 'auth_realtime_cleanup_failed', operation: event, code: safeErrorCode(error) }));
  }
}
