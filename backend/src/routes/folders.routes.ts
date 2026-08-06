import { FastifyInstance } from 'fastify';
import { prisma } from '../database';

// Folders are flat (one level, no nesting) — a SavedQuery belongs to at
// most one Folder, and a Folder has no parent/children. See
// prisma/schema.prisma for the "why" (nesting needs recursive queries and
// cycle prevention for little payoff here).
export async function foldersRoutes(fastify: FastifyInstance) {

  fastify.get('/api/folders', async (request, reply) => {
    try {
      const folders = await prisma.folder.findMany({
        where: { userId: request.user.id },
        orderBy: { name: 'asc' }
      });
      return { success: true, folders };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.post('/api/folders', async (request, reply) => {
    const { name } = request.body as { name?: string };
    const trimmed = name?.trim();
    if (!trimmed) {
      return reply.status(400).send({ success: false, error: 'Folder name is required' });
    }
    try {
      const folder = await prisma.folder.create({
        data: { name: trimmed, userId: request.user.id }
      });
      return { success: true, folder };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  fastify.patch('/api/folders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name?: string };
    const trimmed = name?.trim();
    if (!trimmed) {
      return reply.status(400).send({ success: false, error: 'Folder name is required' });
    }
    try {
      // updateMany with a compound where, same IDOR-safe pattern as the
      // saved-query delete below: only touches the row if it's the
      // requester's own, and a count of 0 covers both "doesn't exist" and
      // "isn't theirs" without distinguishing the two in the response.
      const result = await prisma.folder.updateMany({
        where: { id, userId: request.user.id },
        data: { name: trimmed }
      });
      if (result.count === 0) {
        return reply.status(404).send({ success: false, error: 'Folder not found' });
      }
      const folder = await prisma.folder.findUnique({ where: { id } });
      return { success: true, folder };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  // Deleting a folder must never take the queries inside it down with it —
  // they're moved to "Uncategorized" (folderId: null, not a real Folder
  // row) instead of being deleted. Both steps run in one transaction, and
  // both are scoped to (id/folderId, userId) so a folder id that isn't the
  // requester's own is simply a no-op on both statements, not an IDOR.
  fastify.delete('/api/folders/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    try {
      const [, deleted] = await prisma.$transaction([
        prisma.savedQuery.updateMany({
          where: { folderId: id, userId },
          data: { folderId: null }
        }),
        prisma.folder.deleteMany({ where: { id, userId } })
      ]);

      if (deleted.count === 0) {
        return reply.status(404).send({ success: false, error: 'Folder not found' });
      }
      return { success: true };
    } catch (error: any) {
      return reply.status(500).send({ success: false, error: error.message });
    }
  });
}
