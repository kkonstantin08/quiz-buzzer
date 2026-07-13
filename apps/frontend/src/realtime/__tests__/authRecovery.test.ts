import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSocketAuthRecovery } from '../authRecovery';
import { socket } from '../socket';
import { api } from '../../services/api';

vi.mock('../socket', () => ({ socket: { disconnect: vi.fn(), io: { opts: { reconnection: true } } } }));
vi.mock('../../services/api', () => ({ api: { clearSession: vi.fn() } }));

describe('Socket auth recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socket.io.opts.reconnection = true;
    vi.mocked(api.clearSession).mockResolvedValue(undefined);
  });

  it('clears an auth-invalid cookie only once and stops reconnecting', async () => {
    const onRecovered = vi.fn();
    const recover = createSocketAuthRecovery(onRecovered, vi.fn());
    const authError = Object.assign(new Error('Host session invalid'), { data: { code: 'AUTH_SESSION_INVALID' } });

    await recover(authError);
    await recover(authError);

    expect(api.clearSession).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(2);
    expect(socket.io.opts.reconnection).toBe(false);
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });

  it('does not clear cookies for a network error', async () => {
    const recover = createSocketAuthRecovery(vi.fn(), vi.fn());

    await recover(new Error('transport error'));

    expect(api.clearSession).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
