import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { prisma, db } from '../database';

// 256 bits of randomness, URL-safe — unguessable by construction (not a
// sequential id, not derived from anything predictable like the query id
// or a timestamp).
function generateShareToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

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
      const { search, folderId } = request.query as { search?: string; folderId?: string };
      const term = search?.trim();

      // Was an unscoped findMany() — returned every user's saved queries to
      // any authenticated caller. Scope to the requester (search/folder
      // filters must stay scoped the same way — never let either become a
      // way to read across other users' data).
      const saved = await prisma.savedQuery.findMany({
        where: {
          userId: request.user.id,
          // Matches both the query's name and its SQL text, since a user
          // might remember either.
          ...(term ? { OR: [{ name: { contains: term } }, { query: { contains: term } }] } : {}),
          // "uncategorized" is a UI-only label (no Folder row for it) — a
          // literal folderId=uncategorized filters to queries with no
          // folder at all. Any other folderId filters to that folder.
          ...(folderId === 'uncategorized' ? { folderId: null } : folderId ? { folderId } : {})
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

  // Moves a saved query into a folder, or back to "Uncategorized" by
  // passing folderId: null.
  fastify.patch('/api/saved-queries/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { folderId } = request.body as { folderId: string | null };
    const userId = request.user.id;

    if (folderId !== null && typeof folderId !== 'string') {
      return reply.status(400).send({ success: false, error: 'folderId must be a string or null' });
    }

    try {
      if (folderId !== null) {
        // The target folder must belong to the requester too — otherwise
        // this would let a user file their own query under another user's
        // folder id (harmless to the other user's data, but still an
        // unintended cross-user reference, so reject it outright).
        const folder = await prisma.folder.findFirst({ where: { id: folderId, userId } });
        if (!folder) {
          return reply.status(404).send({ success: false, error: 'Folder not found' });
        }
      }

      // Same IDOR-safe pattern as the delete endpoint below: updateMany
      // with a compound where only touches the row if it's the
      // requester's own.
      const result = await prisma.savedQuery.updateMany({
        where: { id, userId },
        data: { folderId }
      });
      if (result.count === 0) {
        return reply.status(404).send({ success: false, error: 'Saved query not found' });
      }
      const savedQuery = await prisma.savedQuery.findUnique({ where: { id } });
      return { success: true, savedQuery };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Turns on public sharing for a query, or rotates its link if sharing is
  // already on — every call issues a brand-new token, so this doubles as
  // "regenerate my link" (e.g. if an old link leaked, calling this again
  // kills it and hands back a fresh one). Owner-only, same IDOR-safe
  // updateMany-with-compound-where pattern as every other mutation here.
  fastify.post('/api/saved-queries/:id/share', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    try {
      const shareToken = generateShareToken();
      const result = await prisma.savedQuery.updateMany({
        where: { id, userId },
        data: { shareToken }
      });
      if (result.count === 0) {
        return reply.status(404).send({ success: false, error: 'Saved query not found' });
      }
      return { success: true, shareToken };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Turns off public sharing. Nulling shareToken here is also what makes an
  // old link's 404 indistinguishable from a link that was never valid —
  // GET /api/public/shared-queries/:token below does a plain lookup by
  // token, so once it's null there is simply nothing left to find.
  fastify.delete('/api/saved-queries/:id/share', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    try {
      const result = await prisma.savedQuery.updateMany({
        where: { id, userId },
        data: { shareToken: null }
      });
      if (result.count === 0) {
        return reply.status(404).send({ success: false, error: 'Saved query not found' });
      }
      return { success: true };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // PUBLIC — no auth, exempted in plugins/auth.ts via the /api/public/
  // prefix. Rate-limited (config.rateLimit below) since this is the one
  // endpoint in the whole API an anonymous caller can hit at all.
  //
  // Returns ONLY { name, query } via an explicit Prisma `select` — never a
  // spread of the row. That's deliberate: a spread (`{ ...savedQuery }`)
  // would silently start leaking connectionId, description, userId, or
  // whatever else this model grows in the future the moment such a field
  // is added, with nothing here forcing anyone to notice. The explicit
  // select can't do that — a new field has to be added to it by hand
  // before it's ever returned.
  //
  // A token that's invalid and a token whose query has sharing disabled
  // produce the exact same 404 (same lookup, same miss) — there is no
  // separate "found but not shared" branch to accidentally get right or
  // wrong.
  fastify.get('/api/public/shared-queries/:token', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute'
      }
    }
  }, async (request, reply) => {
    const { token } = request.params as { token: string };
    try {
      const shared = await prisma.savedQuery.findUnique({
        where: { shareToken: token },
        select: { name: true, query: true }
      });
      if (!shared) {
        return reply.status(404).send({ success: false, error: 'Shared query not found' });
      }
      return { success: true, name: shared.name, query: shared.query };
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
