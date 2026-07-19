import { EventEmitter } from 'events';

type AppEvents = {
  host_logout: [sessionId: string];
  host_sessions_revoked: [sessionIds: string[]];
};

class AppEventEmitter extends EventEmitter<AppEvents> {}

export const appEvents = new AppEventEmitter();
