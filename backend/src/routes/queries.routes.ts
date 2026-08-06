import { FastifyInstance } from 'fastify';
import { prisma, db } from '../database';

// Extracted out of index.ts (which otherwise inlines routes directly on a
// module-scoped Fastify instance that calls .listen() immediately) so these
// handlers — the ones involved in the cross-user data-isolation fix — can be
// registered on an isolated test instance via Fastify's inject(), matching
// how auth.routes.ts/ai.routes.ts/git.routes.ts/files.routes.ts are already
// organized.
export async function queriesRoutes(fastify: FastifyInstance) {

  fastify.post('/api/query/execute', async (request, reply) => {
    const { query } = request.body as { query: string };

    if (!query || query.trim() === '') {
      return { success: false, error: 'Query cannot be empty' };
    }

    const start = performance.now();
    let executionTimeMs = 0;
    let status = 'error';
    let errorMessage = '';

    try {
      const results = await db.exec(query);
      const lastResult = Array.isArray(results) ? results[results.length - 1] : results;
      const columns = lastResult.fields ? lastResult.fields.map((f: any) => f.name) : [];

      executionTimeMs = Math.round(performance.now() - start);
      status = 'success';

      // Log to query history, scoped to whoever actually ran this query —
      // not whichever user happens to be first in the table.
      const userId = request.user.id;
      const connection = await prisma.databaseConnection.findFirst({ where: { userId } });
      if (connection) {
        await prisma.queryHistory.create({
          data: {
            query,
            status,
            executionTimeMs,
            connectionId: connection.id,
            userId
          }
        });
      }

      return {
        success: true,
        data: {
          columns,
          rows: lastResult.rows || [],
          rowCount: lastResult.rows ? lastResult.rows.length : 0,
          executionTimeMs,
          affectedRows: lastResult.affectedRows || 0
        }
      };
    } catch (error: any) {
      executionTimeMs = Math.round(performance.now() - start);
      errorMessage = error.message;

      // Log error to query history, same scoping as the success path above.
      const userId = request.user.id;
      const connection = await prisma.databaseConnection.findFirst({ where: { userId } });
      if (connection) {
        await prisma.queryHistory.create({
          data: {
            query,
            status,
            executionTimeMs,
            errorMessage,
            connectionId: connection.id,
            userId
          }
        });
      }

      return {
        success: false,
        error: errorMessage,
        executionTimeMs
      };
    }
  });

  // Saved queries endpoints
  fastify.get('/api/saved-queries', async (request, reply) => {
    try {
      const { search } = request.query as { search?: string };
      const term = search?.trim();

      // Was an unscoped findMany() — returned every user's saved queries to
      // any authenticated caller. Scope to the requester (search must stay
      // scoped the same way — never let it become a way to search across
      // other users' data).
      const saved = await prisma.savedQuery.findMany({
        where: {
          userId: request.user.id,
          // Matches both the query's name and its SQL text, since a user
          // might remember either.
          ...(term ? { OR: [{ name: { contains: term } }, { query: { contains: term } }] } : {})
        },
        orderBy: { updatedAt: 'desc' }
      });
      return { success: true, savedQueries: saved };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/saved-queries', async (request, reply) => {
    const { name, description, query } = request.body as { name: string, description?: string, query: string };
    try {
      const userId = request.user.id;
      // Unlike QueryHistory/AiConversation, SavedQuery.connectionId is
      // nullable in the schema — a user without a connection can still save
      // a query, so this doesn't need to error the way getContextIds() does.
      const connection = await prisma.databaseConnection.findFirst({ where: { userId } });

      const saved = await prisma.savedQuery.create({
        data: {
          name,
          description,
          query,
          connectionId: connection?.id ?? null,
          userId
        }
      });
      return { success: true, savedQuery: saved };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Query history endpoint (already correctly scoped — moved here alongside
  // the other query-related routes for consistency, not part of the fix).
  fastify.get('/api/history', async (request, reply) => {
    try {
      const { search } = request.query as { search?: string };
      const term = search?.trim();

      // QueryHistory has no separate "name" field, only the SQL text itself.
      const history = await prisma.queryHistory.findMany({
        where: {
          userId: request.user.id,
          ...(term ? { query: { contains: term } } : {})
        },
        orderBy: { createdAt: 'desc' },
        take: 100
      });
      return { success: true, history };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.delete('/api/saved-queries/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      // Was delete-by-id-alone, with no check that the row belonged to the
      // requester — an IDOR letting any authenticated user delete any other
      // user's saved query by id. deleteMany with a compound where only
      // removes the row if it matches both id AND the requester's userId;
      // count === 0 means it either doesn't exist or isn't theirs, and we
      // don't distinguish the two in the response so as not to leak which.
      const result = await prisma.savedQuery.deleteMany({
        where: { id, userId: request.user.id }
      });
      if (result.count === 0) {
        return reply.status(404).send({ success: false, error: 'Saved query not found' });
      }
      return { success: true };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
