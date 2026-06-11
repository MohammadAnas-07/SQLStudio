import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check if default user exists
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'admin@sqlstudio.local',
        name: 'Admin User',
      },
    });
    console.log(`Created default user: ${user.id}`);
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
