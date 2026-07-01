import { FastifyInstance } from 'fastify';
import { aiController } from '../controllers/ai.controller';

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.post('/api/ai/chat', aiController.chat.bind(aiController));
  fastify.post('/api/ai/explain', aiController.explain.bind(aiController));
  fastify.post('/api/ai/fix', aiController.fix.bind(aiController));
  fastify.post('/api/ai/optimize', aiController.optimize.bind(aiController));
  fastify.get('/api/ai/history', aiController.getHistory.bind(aiController));
  fastify.delete('/api/ai/history', aiController.clearHistory.bind(aiController));
}
