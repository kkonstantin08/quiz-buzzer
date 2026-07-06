import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.hostUser.findUnique({ where: { email: 'kutasovkosta90@gmail.com' } });
  if (user) {
    await prisma.subscription.upsert({
      where: { hostUserId: user.id },
      create: {
        hostUserId: user.id,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      update: {
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    });
    console.log('Subscription activated for kutasovkosta90@gmail.com!');
  } else {
    console.log('User not found.');
  }
}
main().finally(() => prisma.$disconnect());
