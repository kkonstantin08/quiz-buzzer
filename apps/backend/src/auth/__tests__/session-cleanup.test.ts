import { jest } from '@jest/globals';
import { runSessionCleanup, startSessionCleanup } from '../sessionCleanup';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Session retention scheduler', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('runs at startup and daily without throwing or logging storage details', async () => {
    jest.useFakeTimers();
    const deleteMany = jest.fn<() => Promise<{ count: number }>>()
      .mockRejectedValueOnce(new Error('storage path with personal data'))
      .mockResolvedValue({ count: 1 });
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const db = { session: { deleteMany } } as never;

    await expect(runSessionCleanup(db, new Date('2026-08-09T12:00:00.000Z'))).resolves.toBeUndefined();
    const timer = startSessionCleanup(db);
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(DAY_MS);

    expect(deleteMany).toHaveBeenCalledTimes(3);
    expect(errorLog).toHaveBeenCalledWith('Failed to clean inactive sessions');
    expect(errorLog.mock.calls.flat().join(' ')).not.toContain('personal data');
    clearInterval(timer);
  });
});
