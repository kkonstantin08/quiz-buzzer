import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.hostUser.findMany();
  console.log("Total users:", users.length);
  for (const user of users) {
    console.log("- User:", user.email);
  }

  const specificUser = await prisma.hostUser.findUnique({
    where: { email: 'kutasovkosta90@gmail.com' }
  });

  if (specificUser) {
    console.log("Found user kutasovkosta90@gmail.com");
    console.log("Password hash:", specificUser.passwordHash);
    const bcrypt = require('bcrypt');
    const isMatch = await bcrypt.compare('qwerty123456', specificUser.passwordHash);
    console.log("Password matches 'qwerty123456'?:", isMatch);
  } else {
    console.log("User kutasovkosta90@gmail.com NOT FOUND.");
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
