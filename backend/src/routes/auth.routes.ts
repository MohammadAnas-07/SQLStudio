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
      const user = await prisma.user.create({
        data: { email, name, password: passwordHash },
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
