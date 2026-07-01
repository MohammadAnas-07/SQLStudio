import { FastifyRequest, FastifyReply } from 'fastify';
import { aiService } from '../services/ai.service';
import { prisma } from '../database';

export class AiController {
  
  private async getContextIds() {
    const user = await prisma.user.findFirst();
    const connection = await prisma.databaseConnection.findFirst();
    if (!user || !connection) {
      throw new Error('Default user or connection not found');
    }
    return { userId: user.id, connectionId: connection.id };
  }

  async chat(request: FastifyRequest, reply: FastifyReply) {
    const { prompt } = request.body as { prompt: string };
    if (!prompt) return reply.status(400).send({ success: false, error: 'Prompt is required' });

    try {
      const { userId, connectionId } = await this.getContextIds();
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
      const { userId, connectionId } = await this.getContextIds();
      const history = await aiService.getHistory(connectionId, userId);
      return { success: true, history };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }

  async clearHistory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { userId, connectionId } = await this.getContextIds();
      await aiService.clearHistory(connectionId, userId);
      return { success: true };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  }
}

export const aiController = new AiController();
