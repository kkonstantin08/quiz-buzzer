import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitRoomCreateWhenConnected } from '../roomCreate';
import { socket } from '../socket';

vi.mock('../socket', () => ({ socket: { connected: false, connect: vi.fn(), emit: vi.fn(), once: vi.fn(), off: vi.fn() } }));

describe('ROOM_CREATE connection flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('waits for connect before emitting ROOM_CREATE exactly once', () => {
    socket.connected = false;
    emitRoomCreateWhenConnected(vi.fn(), vi.fn());

    expect(socket.emit).not.toHaveBeenCalled();
    const onConnect = vi.mocked(socket.once).mock.calls.find(([event]) => event === 'connect')?.[1] as unknown as (() => void) | undefined;
    expect(onConnect).toBeDefined();
    onConnect?.();
    onConnect?.();

    expect(socket.emit).toHaveBeenCalledTimes(1);
    expect(socket.emit).toHaveBeenCalledWith('ROOM_CREATE', expect.any(Function));
  });

  it('does not emit ROOM_CREATE after connect_error', () => {
    const onConnectionError = vi.fn();
    socket.connected = false;
    emitRoomCreateWhenConnected(vi.fn(), onConnectionError);

    const onError = vi.mocked(socket.once).mock.calls.find(([event]) => event === 'connect_error')?.[1] as unknown as ((error: Error) => void) | undefined;
    onError?.(new Error('Host session invalid'));

    expect(socket.emit).not.toHaveBeenCalled();
    expect(onConnectionError).toHaveBeenCalledTimes(1);
  });
});
