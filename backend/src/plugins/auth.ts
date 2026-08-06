import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fjwt from '@fastify/jwt';
import { config } from '../config/env';

export interface AuthUser {
  id: string;
  email: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthUser;
    user: AuthUser;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Routes that must remain reachable without a token.
// /api/terminal is exempt here because its websocket upgrade is authenticated
// explicitly in index.ts (a preHandler hook cannot protect a socket upgrade).
// /api/public/ is a deliberately-reserved prefix for endpoints designed to be
// world-readable without auth (currently just the shared-query view) — see
// GET /api/public/shared-queries/:token in queries.routes.ts. Anything new
// added under this prefix is public by construction, so treat adding a route
// here as a security-relevant change, not routine.
const PUBLIC_PATHS = ['/ping', '/api/auth/', '/api/public/'];

function isPublicPath(url: string): boolean {
  const path = url.split('?')[0];
  if (path === '/ping') return true;
  if (path.startsWith('/api/auth/')) return true;
  if (path.startsWith('/api/terminal')) return true;
  if (path.startsWith('/api/public/')) return true;
  return false;
}

// Must be called directly on the root Fastify instance (not via fastify.register)
// before any routes are declared, so the preHandler hook applies to every route
// registered afterwards, including ones added later inside async plugins.
export function configureAuth(fastify: FastifyInstance) {
  fastify.register(fjwt, { secret: config.JWT_SECRET });

  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  fastify.addHook('preHandler', async (request, reply) => {
    const url = request.raw.url || '';
    if (!url.startsWith('/api/') && url !== '/ping') return;
    if (isPublicPath(url)) return;

    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
  });
}
