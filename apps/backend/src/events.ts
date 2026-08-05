import { EventEmitter } from 'events';

type AppEvents = {
  host_logout: [sessionId: string];
  host_sessions_revoked: [sessionIds: string[]];
  host_logout_all: [userId: string, sessionIds: string[]];
  host_account_deleted: [userId: string];
};

class AppEventEmitter extends EventEmitter<AppEvents> {}

export const appEvents = new AppEventEmitter();
