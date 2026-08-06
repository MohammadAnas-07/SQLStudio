import { FastifyRequest, FastifyReply } from 'fastify';
import { aiService } from '../services/ai.service';
import { prisma } from '../database';

export class AiController {

  // request.user.id is already the authenticated caller (verified by the
  // global JWT preHandler before this ever runs) — no need to look the user
  // up again. The only thing that actually needs a DB query is finding
  // *this* user's own DatabaseConnection, since connectionId isn't part of
  // the JWT payload. Every user is guaranteed to have exactly one, created
  // alongside them at registration (see auth.routes.ts), so this should
  // never come back empty for a real request — the error is a safety net,
  // not an expected path.
  private async getContextIds(request: FastifyRequest) {
    const userId = request.user.id;
    const connection = await prisma.databaseConnection.findFirst({ where: { userId } });
    if (!connection) {
      throw new Error('No database connection found for this user');
    }
    return { userId, connectionId: connection.id };
  }

  async chat(request: FastifyRequest, reply: FastifyReply) {
    const { prompt } = request.body as { prompt: string };
    if (!prompt) return reply.status(400).send({ success: false, error: 'Prompt is required' });

    try {
      const { userId, connectionId } = await this.getContextIds(request);
      const response = await aiService.chat(prompt, connectionId, userId);
      return { success: true, response };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async explain(request: FastifyRequest, reply: FastifyReply) {
    const { sql } = request.body as { sql: string };
    if (!sql) return reply.status(400).send({ success: false, error: 'SQL is required' });

    try {
      const response = await aiService.explain(sql);
      return { success: true, response };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async fix(request: FastifyRequest, reply: FastifyReply) {
    const { sql, error } = request.body as { sql: string, error: string };
    if (!sql || !error) return reply.status(400).send({ success: false, error: 'SQL and error message are required' });

    try {
      const response = await aiService.fix(sql, error);
      return { success: true, response };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async optimize(request: FastifyRequest, reply: FastifyReply) {
    const { sql } = request.body as { sql: string };
    if (!sql) return reply.status(400).send({ success: false, error: 'SQL is required' });

    try {
      const response = await aiService.optimize(sql);
      return { success: true, response };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async getHistory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { userId, connectionId } = await this.getContextIds(request);
      const history = await aiService.getHistory(connectionId, userId);
      return { success: true, history };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async clearHistory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { userId, connectionId } = await this.getContextIds(request);
      await aiService.clearHistory(connectionId, userId);
      return { success: true };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }
}

export const aiController = new AiController();
