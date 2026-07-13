import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocketAuthRecovery } from '../authRecovery';
import { socket } from '../socket';
import { api } from '../../services/api';

vi.mock('../socket', () => ({ socket: { connect: vi.fn(), disconnect: vi.fn(), io: { opts: { reconnection: true } } } }));
vi.mock('../../services/api', () => ({ api: { clearSession: vi.fn() } }));

describe('Socket auth recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket.io.opts.reconnection = true;
    vi.mocked(api.clearSession).mockResolvedValue(undefined);
  });

  const authError = Object.assign(new Error('Host session invalid'), { data: { code: 'AUTH_SESSION_INVALID' } });

  it('disables reconnection while it clears an auth-invalid cookie', async () => {
    let finishClearSession: (() => void) | undefined;
    vi.mocked(api.clearSession).mockImplementation(() => new Promise<void>((resolve) => { finishClearSession = resolve; }));
    const recover = createSocketAuthRecovery(vi.fn(), vi.fn());

    const recovery = recover(authError);

    expect(socket.io.opts.reconnection).toBe(false);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    finishClearSession?.();
    await recovery;
  });

  it('restores reconnection before notifying that recovery succeeded', async () => {
    const onRecovered = vi.fn(() => {
      expect(socket.io.opts.reconnection).toBe(true);
    });
    const recover = createSocketAuthRecovery(onRecovered, vi.fn());

    await recover(authError);

    expect(socket.io.opts.reconnection).toBe(true);
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('restores reconnection before notifying that clearing the cookie failed', async () => {
    vi.mocked(api.clearSession).mockRejectedValue(new Error('Network error'));
    const onRecoveryError = vi.fn(() => {
      expect(socket.io.opts.reconnection).toBe(true);
    });
    const recover = createSocketAuthRecovery(vi.fn(), onRecoveryError);

    await recover(authError);

    expect(socket.io.opts.reconnection).toBe(true);
    expect(onRecoveryError).toHaveBeenCalledTimes(1);
  });

  it('preserves a disabled reconnection setting', async () => {
    socket.io.opts.reconnection = false;
    const recover = createSocketAuthRecovery(vi.fn(), vi.fn());

    await recover(authError);

    expect(socket.io.opts.reconnection).toBe(false);
  });

  it('clears an auth-invalid cookie only once after repeated auth errors', async () => {
    const onRecovered = vi.fn();
    const recover = createSocketAuthRecovery(onRecovered, vi.fn());

    await recover(authError);
    await recover(authError);

    expect(api.clearSession).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(2);
    expect(socket.io.opts.reconnection).toBe(true);
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('does not clear cookies for a network error', async () => {
    const recover = createSocketAuthRecovery(vi.fn(), vi.fn());

    await recover(new Error('transport error'));

    expect(api.clearSession).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
    expect(socket.io.opts.reconnection).toBe(true);
  });

  it('does not connect the socket directly after recovery', async () => {
    const recover = createSocketAuthRecovery(vi.fn(), vi.fn());

    await recover(authError);

    expect(socket.connect).not.toHaveBeenCalled();
  });
});
