import { socket } from './socket';

class TimeSyncService {
  private offset: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  
  constructor() {
    this.startSync();
  }

  private startSync() {
    // Initial sync
    this.sync();

    // Periodic sync every 5 seconds
    this.intervalId = setInterval(() => {
      this.sync();
    }, 5000);

    socket.on('disconnect', () => {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    });

    socket.on('connect', () => {
      if (!this.intervalId) {
        this.sync();
        this.intervalId = setInterval(() => {
          this.sync();
        }, 5000);
      }
    });
  }

  private sync() {
    if (!socket.connected) return;

    const startClientTime = Date.now();
    // Use ts-ignore if type isn't fully updated yet or if there's type mismatch during compilation
    // @ts-ignore
    socket.emit('SYNC_TIME', startClientTime, (serverTime: number) => {
      const endClientTime = Date.now();
      const rtt = endClientTime - startClientTime;
      
      const estimatedClientTimeAtServer = startClientTime + (rtt / 2);
      this.offset = serverTime - estimatedClientTimeAtServer;
    });
  }

  /**
   * Returns the current estimated server time.
   */
  public getServerTime(): number {
    return Date.now() + this.offset;
  }
}

export const timeSync = new TimeSyncService();
