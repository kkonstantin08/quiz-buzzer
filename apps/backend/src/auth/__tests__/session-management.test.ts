import { prisma } from '../../prisma';

const email = `session-management-${Date.now()}@example.com`;

afterAll(async () => {
  await prisma.hostUser.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe('session management storage', () => {
  it('stores optional session metadata while keeping legacy sessions valid', async () => {
    const user = await prisma.hostUser.create({
      data: { email, passwordHash: 'not-used-in-this-test' },
    });

    const legacy = await prisma.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 60_000) },
    });
    const lastSeenAt = new Date();
    const current = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + 60_000),
        ipAddress: '198.51.100.10',
        userAgent: 'Mozilla/5.0 Test Browser',
        lastSeenAt,
      },
    });

    await expect(prisma.session.findUnique({ where: { id: legacy.id } })).resolves.toMatchObject({
      ipAddress: null,
      userAgent: null,
      lastSeenAt: null,
    });
    await expect(prisma.session.findUnique({ where: { id: current.id } })).resolves.toMatchObject({
      ipAddress: '198.51.100.10',
      userAgent: 'Mozilla/5.0 Test Browser',
      lastSeenAt,
    });
  });
});
