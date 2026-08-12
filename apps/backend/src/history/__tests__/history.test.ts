import express from 'express';
import request from 'supertest';
import { prisma } from '../../prisma';

jest.mock('../../auth/middleware', () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const userId = req.get('x-user-id');
    if (!userId) return res.status(401).json({ error: 'No token provided' });
    (req as express.Request & { userId: string }).userId = userId;
    next();
  },
}));

import { historyRouter } from '..';

const app = express();
app.use('/history', historyRouter);

const prefix = `history-api-${Date.now()}`;
let ownerId: string;
let otherId: string;

beforeAll(async () => {
  const [owner, other] = await Promise.all([
    prisma.hostUser.create({ data: { email: `${prefix}-owner@example.com`, passwordHash: 'unused' } }),
    prisma.hostUser.create({ data: { email: `${prefix}-other@example.com`, passwordHash: 'unused' } }),
  ]);
  ownerId = owner.id;
  otherId = other.id;

  await prisma.gameHistory.createMany({
    data: [
      ...Array.from({ length: 12 }, (_, index) => ({
        id: `owner-${String(index).padStart(2, '0')}`,
        hostUserId: ownerId,
        roomCode: `OWN${index}`,
        result: 'WINNER',
        winnerName: 'Owner winner',
        winnerScore: index,
        participants: 3,
        createdAt: new Date(`2026-08-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`),
      })),
      {
        id: 'other-newest',
        hostUserId: otherId,
        roomCode: 'OTHER',
        result: 'DRAW',
        winnerName: null,
        winnerScore: 4,
        participants: 2,
        createdAt: new Date('2026-08-31T12:00:00.000Z'),
      },
    ],
  });
});

afterAll(async () => {
  await prisma.hostUser.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('Game history API', () => {
  it('returns stable newest-first pages only for the authenticated host', async () => {
    const first = await request(app)
      .get('/history?page=1&limit=5')
      .set('x-user-id', ownerId)
      .expect(200);

    expect(first.body).toMatchObject({ count: 12, page: 1, pageSize: 5, totalPages: 3 });
    expect(first.body.history.map((row: { id: string }) => row.id)).toEqual([
      'owner-11',
      'owner-10',
      'owner-09',
      'owner-08',
      'owner-07',
    ]);

    const second = await request(app)
      .get('/history?page=2&limit=5')
      .set('x-user-id', ownerId)
      .expect(200);

    expect(second.body).toMatchObject({ count: 12, page: 2, pageSize: 5, totalPages: 3 });
    expect(second.body.history.map((row: { id: string }) => row.id)).toEqual([
      'owner-06',
      'owner-05',
      'owner-04',
      'owner-03',
      'owner-02',
    ]);
    expect(JSON.stringify(first.body)).not.toContain('other-newest');
  });

  it('defaults to ten rows, caps page size, and rejects malformed pagination', async () => {
    const defaults = await request(app).get('/history').set('x-user-id', ownerId).expect(200);
    expect(defaults.body).toMatchObject({ count: 12, page: 1, pageSize: 10, totalPages: 2 });
    expect(defaults.body.history).toHaveLength(10);

    const capped = await request(app).get('/history?limit=999').set('x-user-id', ownerId).expect(200);
    expect(capped.body).toMatchObject({ count: 12, page: 1, pageSize: 50, totalPages: 1 });
    expect(capped.body.history).toHaveLength(12);

    for (const query of ['page=0', 'page=-1', 'page=1.5', 'limit=abc', 'page=1&page=2']) {
      const response = await request(app).get(`/history?${query}`).set('x-user-id', ownerId).expect(400);
      expect(response.body).toEqual({ error: 'Invalid pagination' });
    }
  });

  it('clears only the authenticated host history', async () => {
    await request(app).delete('/history').set('x-user-id', ownerId).expect(200, { success: true });

    await expect(prisma.gameHistory.count({ where: { hostUserId: ownerId } })).resolves.toBe(0);
    await expect(prisma.gameHistory.count({ where: { hostUserId: otherId } })).resolves.toBe(1);
  });
});
