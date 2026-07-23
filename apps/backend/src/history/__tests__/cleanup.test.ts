import { describe, expect, it, jest } from '@jest/globals';
import * as historyCleanup from '../cleanup';

const { cleanupGameHistory, gameHistoryCutoff, runGameHistoryCleanup } = historyCleanup;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('Game history cleanup', () => {
  const now = new Date('2026-07-23T12:00:00.000Z');

  it('deletes records strictly older than three calendar months', async () => {
    const deleteMany = jest.fn<(arg: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 });

    await cleanupGameHistory({ gameHistory: { deleteMany } } as any, now);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date('2026-04-23T12:00:00.000Z') } },
    });
  });

  it('keeps records at the three-calendar-month boundary and newer', () => {
    const cutoff = gameHistoryCutoff(now);

    expect(new Date('2026-04-23T11:59:59.999Z').getTime()).toBeLessThan(cutoff.getTime());
    expect(new Date('2026-04-23T12:00:00.000Z').getTime()).not.toBeLessThan(cutoff.getTime());
    expect(new Date('2026-04-23T12:00:00.001Z').getTime()).not.toBeLessThan(cutoff.getTime());
  });

  it.each([
    ['2026-05-31T12:00:00.000Z', '2026-02-28T12:00:00.000Z'],
    ['2026-12-31T12:00:00.000Z', '2026-09-30T12:00:00.000Z'],
    ['2024-05-31T12:00:00.000Z', '2024-02-29T12:00:00.000Z'],
  ])('uses the last day of the target month for %s', (input, expected) => {
    expect(gameHistoryCutoff(new Date(input))).toEqual(new Date(expected));
  });

  it('runs no more than once per day and logs cleanup errors without throwing', async () => {
    const deleteMany = jest.fn<(arg: unknown) => Promise<never>>().mockRejectedValue(new Error('database unavailable'));
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runGameHistoryCleanup({ gameHistory: { deleteMany } } as any, now)).resolves.toBe(true);
    await expect(runGameHistoryCleanup({ gameHistory: { deleteMany } } as any, new Date('2026-07-24T11:59:59.999Z'))).resolves.toBe(false);

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('Failed to clean expired game history:', expect.any(Error));
    error.mockRestore();
  });

  it('runs again on the next daily interval', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
    const deleteMany = jest.fn<(arg: unknown) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 });
    const start = (historyCleanup as any).startGameHistoryCleanup as (prisma: unknown) => NodeJS.Timeout;

    const timer = start({ gameHistory: { deleteMany } });
    await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(DAY_MS);

    expect(deleteMany).toHaveBeenCalledTimes(2);
    clearInterval(timer);
    jest.useRealTimers();
  });
});
