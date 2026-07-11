import { EventEmitter } from 'events';

class AppEventEmitter extends EventEmitter {}

export const appEvents = new AppEventEmitter();
