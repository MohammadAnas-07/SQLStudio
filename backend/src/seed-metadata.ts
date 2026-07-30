import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!';

async function main() {
  // Check if default user exists
  let user = await prisma.user.findFirst();
  if (!user) {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    user = await prisma.user.create({
      data: {
        email: 'admin@sqlstudio.local',
        name: 'Admin User',
        password: passwordHash,
      },
    });
    console.log(`Created default user: ${user.id}`);
    console.log(`Default login: admin@sqlstudio.local / ${DEFAULT_ADMIN_PASSWORD}`);
  } else if (!user.password) {
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
    user = await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    });
    console.log(`Existing user had no password set, assigned default: ${user.email} / ${DEFAULT_ADMIN_PASSWORD}`);
  } else {
    console.log(`Found existing user: ${user.id}`);
  }

  // Check if default connection exists
  let connection = await prisma.databaseConnection.findFirst();
  if (!connection) {
    connection = await prisma.databaseConnection.create({
      data: {
        name: 'Local PGLite',
        type: 'postgresql',
        database: 'pgdata',
        userId: user.id,
      },
    });
    console.log(`Created default connection: ${connection.id}`);
  } else {
    console.log(`Found existing connection: ${connection.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
