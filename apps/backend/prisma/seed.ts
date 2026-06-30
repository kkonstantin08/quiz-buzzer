import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const status = process.env.SEED_SUBSCRIPTION_STATUS || 'active';
  const days = parseInt(process.env.SEED_SUBSCRIPTION_DAYS || '365', 10);

  const passwordHash = await bcrypt.hash(password, 10);

  console.log(`Seeding user: ${email}`);

  // UPSERT the user
  const user = await prisma.hostUser.upsert({
    where: { email },
    update: { passwordHash },
    create: {
      email,
      passwordHash,
    },
  });

  const now = new Date();
  const future = new Date();
  future.setDate(future.getDate() + days);

  // UPSERT the subscription
  await prisma.subscription.upsert({
    where: { hostUserId: user.id },
    update: {
      status,
      currentPeriodStart: now,
      currentPeriodEnd: future,
    },
    create: {
      hostUserId: user.id,
      status,
      currentPeriodStart: now,
      currentPeriodEnd: future,
    },
  });

  console.log('Seeding complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
