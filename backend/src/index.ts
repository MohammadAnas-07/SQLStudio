import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { aiRoutes } from './routes/ai.routes';
import { fileRoutes } from './routes/files.routes';
import { authRoutes } from './routes/auth.routes';
import { configureAuth } from './plugins/auth';
import { isExistingSchema } from './lib/schemaValidation';
import { config } from './config/env';
import { prisma, db } from './database';
import * as pty from 'node-pty';
import os from 'os';
import path from 'path';

const WORKSPACE_ROOT = config.WORKSPACE_ROOT_PATH;

// Single source of truth for the server's OS — reused for both picking the
// terminal shell below and telling the frontend which keyboard shortcut
// modifier to display (Ctrl vs Cmd), so the two never disagree.
export const isWindows = os.platform() === 'win32';


const fastify = Fastify({
  logger: true,
});

fastify.register(cors, {
  origin: config.CORS_ORIGIN,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

fastify.register(websocket);

// Must run before any route is declared below: Fastify only applies a hook
// to routes registered after it, so the global auth preHandler has to be
// wired in here first for it to cover everything that follows (including
// routes registered later inside async plugins like aiRoutes/fileRoutes/gitRoutes).
configureAuth(fastify);

fastify.get('/ping', async (request, reply) => {
  return { status: 'ok', service: 'sqlstudio-backend' };
});

// Lets the frontend show the right keyboard-shortcut modifier (Ctrl vs Cmd)
// without guessing at the client's OS separately — this is the same
// `isWindows` check the terminal handler below uses to pick a shell, so the
// two can never disagree.
fastify.get('/api/system/platform', async () => {
  return { success: true, isWindows };
});

fastify.register(async (app) => {
  app.get('/api/terminal', {
    websocket: true,
    // A preHandler hook cannot protect a websocket upgrade reliably, so the
    // terminal route authenticates explicitly during the handshake instead:
    // if this rejects, the reply is sent as a normal HTTP 401 and the
    // connection never gets upgraded to a websocket.
    preValidation: async (request, reply) => {
      const query = request.query as { token?: string };
      const authHeader = request.headers['authorization'];
      const bearerToken = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined;
      const token = query?.token || bearerToken;

      if (!token) {
        return reply.code(401).send({ success: false, error: 'Missing authentication token' });
      }

      try {
        app.jwt.verify(token);
      } catch (err) {
        return reply.code(401).send({ success: false, error: 'Invalid or expired token' });
      }
    },
  }, (connection, req) => {
    const shell = isWindows ? 'powershell.exe' : 'bash';
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: WORKSPACE_ROOT,
      env: process.env
    });
    
    ptyProcess.onData((data) => {
      connection.send(data);
    });
    
    connection.on('message', (msg: any) => {
      const dataStr = msg.toString();
      if (dataStr.startsWith('{"type":"resize"')) {
        try {
          const resizeData = JSON.parse(dataStr);
          if (resizeData.cols && resizeData.rows) {
            ptyProcess.resize(resizeData.cols, resizeData.rows);
          }
        } catch (e) {
          // ignore
        }
      } else {
        ptyProcess.write(dataStr);
      }
    });
    
    connection.on('close', () => {
      try {
        ptyProcess.kill();
      } catch(e) {}
    });
  });
});

fastify.get('/api/schema', async (request, reply) => {
  try {
    const tableResult = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = tableResult.rows as { table_name: string }[];
    
    const schemaTables = await Promise.all(tables.map(async (table) => {
      const colResult = await db.query(`
        SELECT column_name, data_type, 
          (SELECT COUNT(*) FROM information_schema.key_column_usage kcu
           JOIN information_schema.table_constraints tc 
           ON kcu.constraint_name = tc.constraint_name 
           WHERE kcu.table_name = $1 AND kcu.column_name = c.column_name AND tc.constraint_type = 'PRIMARY KEY'
          ) as is_primary
        FROM information_schema.columns c
        WHERE table_schema = 'public' AND table_name = $1
      `, [table.table_name]);
      
      return {
        name: table.table_name,
        columns: colResult.rows.map((col: any) => ({
          name: col.column_name,
          type: col.data_type,
          isPrimary: parseInt(col.is_primary) > 0
        }))
      };
    }));

    return { 
      schema: [
        {
          name: 'public',
          tables: schemaTables
        }
      ] 
    };
  } catch (error: any) {
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// Dashboard stats endpoint
fastify.get('/api/dashboard/stats', async (request, reply) => {
  try {
    const userId = request.user.id;

    const totalConnections = await prisma.databaseConnection.count({ where: { userId } });
    const totalQueries = await prisma.queryHistory.count({ where: { userId } });
    const activeUsers = await prisma.user.count();
    const savedQueries = await prisma.savedQuery.count({ where: { userId } });

    // The 5 most recently updated connections for this user
    const recentConnections = await prisma.databaseConnection.findMany({
      where: { userId },
      take: 5,
      orderBy: { updatedAt: 'desc' }
    });

    return {
      success: true,
      stats: [
        { name: 'Total Connections', value: totalConnections.toString(), change: '+1', trend: 'up' },
        { name: 'Active Users', value: activeUsers.toString(), change: '+0%', trend: 'up' },
        { name: 'Queries Run', value: totalQueries.toString(), change: '+5%', trend: 'up' },
        { name: 'Saved Queries', value: savedQueries.toString(), change: '+2', trend: 'up' }
      ],
      recentConnections
    };
  } catch (error: any) {
    return reply.status(500).send({ success: false, error: error.message });
  }
});

fastify.delete('/api/database/:name', async (request, reply) => {
  const { name } = request.params as { name: string };
  try {
    // Whitelist check: name must be alphanumeric/underscore AND match an
    // actual existing schema, so it can never carry SQL injection payloads
    // through to the raw DROP SCHEMA statement below.
    if (!(await isExistingSchema(db, name))) {
      return reply.status(400).send({ success: false, error: 'Invalid or unknown schema name' });
    }

    await db.exec(`DROP SCHEMA IF EXISTS "${name}" CASCADE;`);
    if (name === 'public') {
      await db.exec(`CREATE SCHEMA public;`);
    }
    return { success: true };
  } catch (error: any) {
    return reply.status(500).send({ success: false, error: error.message });
  }
});

import { gitRoutes } from './routes/git.routes';
import { queriesRoutes } from './routes/queries.routes';

const start = async () => {
  try {
    // Wait for the db to be ready before listening
    await db.waitReady;
    await authRoutes(fastify);
    await aiRoutes(fastify);
    await fileRoutes(fastify);
    await gitRoutes(fastify);
    await queriesRoutes(fastify);
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Backend listening on port 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
