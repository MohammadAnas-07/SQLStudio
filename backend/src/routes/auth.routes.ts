import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '../database';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/register', async (request, reply) => {
    const { email, password, name } = request.body as { email: string; password: string; name?: string };

    if (!email || !password) {
      return reply.status(400).send({ success: false, error: 'Email and password are required' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ success: false, error: 'Password must be at least 8 characters' });
    }

    try {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.status(409).send({ success: false, error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      // Every user needs a DatabaseConnection row of their own: QueryHistory
      // and AiConversation both require a non-null connectionId, and there's
      // no UI/API path for a user to create one for themselves later. Create
      // it in the same transaction as the user so registration either fully
      // succeeds (both rows exist) or fully fails (no orphaned user stuck
      // without a connection) — mirrors what seed-metadata.ts does for the
      // bootstrap admin, just per-user instead of a one-time global default.
      const user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email, name, password: passwordHash },
        });
        await tx.databaseConnection.create({
          data: {
            name: 'Local PGLite',
            type: 'postgresql',
            database: 'pgdata',
            userId: created.id,
          },
        });
        return created;
      });

      const token = fastify.jwt.sign({ id: user.id, email: user.email });
      return { success: true, token, user: { id: user.id, email: user.email, name: user.name } };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ success: false, error: 'Email and password are required' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.password) {
        return reply.status(401).send({ success: false, error: 'Invalid credentials' });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return reply.status(401).send({ success: false, error: 'Invalid credentials' });
      }

      const token = fastify.jwt.sign({ id: user.id, email: user.email });
      return { success: true, token, user: { id: user.id, email: user.email, name: user.name } };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.get('/api/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: request.user.id },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      if (!user) return reply.status(404).send({ success: false, error: 'User not found' });
      return { success: true, user };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
