import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';

// --- Test isolation setup ---------------------------------------------
//
// This exercises the exact bug: ai.controller.ts / queries.routes.ts used
// to attribute AI chats, saved queries, and query-history entries to
// whichever user was first in the table, instead of request.user.id. It
// creates two real registered users and asserts each only ever sees their
// own data through the real HTTP routes.
//
// Runs against its own dedicated SQLite file (never the dev metadata.db)
// pushed fresh via `prisma db push` in before(). DATABASE_URL must be set
// before any module that constructs PrismaClient is imported — config/env.ts's
// dotenv.config() won't override an already-set env var, so this line has to
// run first in this file.
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TEST_DB_PATH = path.join(BACKEND_ROOT, 'prisma', 'test-data-isolation.db');
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.JWT_SECRET = 'test-secret-for-data-isolation-tests';

function removeTestDbFiles() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

// The AI chat route calls the real Gemini API via @google/genai — mocked so
// tests are hermetic (no network, no quota, no flakiness) and so the
// isolation assertions are about OUR attribution logic, not Gemini's output.
// Each mocked reply echoes back a snippet of the prompt so the two users'
// conversations are distinguishable in the assertions below.
mock.module('@google/genai', {
  exports: {
    GoogleGenAI: class {
      models = {
        generateContent: async ({ contents }: any) => {
          const lastUserText = contents[contents.length - 1]?.parts?.[0]?.text || '';
          return { text: `mocked reply to: ${lastUserText}` };
        }
      };
    }
  }
});

let app: FastifyInstance;
let prisma: typeof import('../database').prisma;
let db: typeof import('../database').db;

before(async () => {
  removeTestDbFiles();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: BACKEND_ROOT,
    env: { ...process.env },
    stdio: 'pipe',
  });

  const database = await import('../database');
  prisma = database.prisma;
  db = database.db;
  await db.waitReady;

  const { configureAuth } = await import('../plugins/auth');
  const { authRoutes } = await import('./auth.routes');
  const { aiRoutes } = await import('./ai.routes');
  const { queriesRoutes } = await import('./queries.routes');

  app = Fastify();
  configureAuth(app);
  await authRoutes(app);
  await aiRoutes(app);
  await queriesRoutes(app);
  await app.ready();
});

after(async () => {
  await app?.close();
  await prisma?.$disconnect();
  await db?.close();
  removeTestDbFiles();
});

async function registerUser(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'correct-horse-battery-staple', name: email.split('@')[0] },
  });
  assert.equal(res.statusCode, 200, `registration failed for ${email}: ${res.body}`);
  const body = res.json();
  assert.ok(body.success, `registration did not succeed for ${email}: ${JSON.stringify(body)}`);
  return { token: body.token as string, userId: body.user.id as string };
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

test('two users each performing an AI chat, a saved query, and a query run stay fully isolated from each other', async () => {
  const userA = await registerUser(`alice-${Date.now()}@example.com`);
  const userB = await registerUser(`bob-${Date.now()}@example.com`);

  // --- AI chat --------------------------------------------------------
  const chatA = await app.inject({
    method: 'POST', url: '/api/ai/chat', headers: authHeaders(userA.token),
    payload: { prompt: "Alice's secret question about revenue" },
  });
  assert.equal(chatA.statusCode, 200, chatA.body);
  assert.equal(chatA.json().success, true, chatA.body);

  const chatB = await app.inject({
    method: 'POST', url: '/api/ai/chat', headers: authHeaders(userB.token),
    payload: { prompt: "Bob's secret question about headcount" },
  });
  assert.equal(chatB.statusCode, 200, chatB.body);
  assert.equal(chatB.json().success, true, chatB.body);

  // --- Saved query ------------------------------------------------------
  const savedA = await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(userA.token),
    payload: { name: "Alice's query", query: 'SELECT 1;' },
  });
  assert.equal(savedA.statusCode, 200, savedA.body);
  const savedAId = savedA.json().savedQuery.id as string;

  const savedB = await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(userB.token),
    payload: { name: "Bob's query", query: 'SELECT 2;' },
  });
  assert.equal(savedB.statusCode, 200, savedB.body);
  const savedBId = savedB.json().savedQuery.id as string;

  // --- Run a query (exercises the real query.execute + history logging) -
  const runA = await app.inject({
    method: 'POST', url: '/api/query/execute', headers: authHeaders(userA.token),
    payload: { query: 'SELECT 1;' },
  });
  assert.equal(runA.statusCode, 200, runA.body);
  assert.equal(runA.json().success, true, runA.body);

  const runB = await app.inject({
    method: 'POST', url: '/api/query/execute', headers: authHeaders(userB.token),
    payload: { query: 'SELECT 2;' },
  });
  assert.equal(runB.statusCode, 200, runB.body);
  assert.equal(runB.json().success, true, runB.body);

  // === Assertions: each user sees only their own data ===================

  // AI chat history
  const historyA = await app.inject({ method: 'GET', url: '/api/ai/history', headers: authHeaders(userA.token) });
  const messagesA: Array<{ content: string }> = historyA.json().history;
  assert.ok(messagesA.some(m => m.content.includes("Alice's secret question")), "A's own AI history is missing");
  assert.ok(!messagesA.some(m => m.content.includes("Bob's secret question")), "A can see B's AI chat — isolation broken");

  const historyB = await app.inject({ method: 'GET', url: '/api/ai/history', headers: authHeaders(userB.token) });
  const messagesB: Array<{ content: string }> = historyB.json().history;
  assert.ok(messagesB.some(m => m.content.includes("Bob's secret question")), "B's own AI history is missing");
  assert.ok(!messagesB.some(m => m.content.includes("Alice's secret question")), "B can see A's AI chat — isolation broken");

  // Saved queries
  const savedListA = await app.inject({ method: 'GET', url: '/api/saved-queries', headers: authHeaders(userA.token) });
  const savedQueriesA: Array<{ name: string }> = savedListA.json().savedQueries;
  assert.ok(savedQueriesA.some(q => q.name === "Alice's query"), "A's own saved query is missing");
  assert.ok(!savedQueriesA.some(q => q.name === "Bob's query"), "A can see B's saved query — isolation broken");

  const savedListB = await app.inject({ method: 'GET', url: '/api/saved-queries', headers: authHeaders(userB.token) });
  const savedQueriesB: Array<{ name: string }> = savedListB.json().savedQueries;
  assert.ok(savedQueriesB.some(q => q.name === "Bob's query"), "B's own saved query is missing");
  assert.ok(!savedQueriesB.some(q => q.name === "Alice's query"), "B can see A's saved query — isolation broken");

  // Query-run history
  const queryHistoryA = await app.inject({ method: 'GET', url: '/api/history', headers: authHeaders(userA.token) });
  const runsA: Array<{ query: string }> = queryHistoryA.json().history;
  assert.ok(runsA.some(r => r.query === 'SELECT 1;'), "A's own query-run history is missing");
  assert.ok(!runsA.some(r => r.query === 'SELECT 2;'), "A can see B's query-run history — isolation broken");

  const queryHistoryB = await app.inject({ method: 'GET', url: '/api/history', headers: authHeaders(userB.token) });
  const runsB: Array<{ query: string }> = queryHistoryB.json().history;
  assert.ok(runsB.some(r => r.query === 'SELECT 2;'), "B's own query-run history is missing");
  assert.ok(!runsB.some(r => r.query === 'SELECT 1;'), "B can see A's query-run history — isolation broken");

  // IDOR check: B must not be able to delete A's saved query by id
  const deleteAttempt = await app.inject({
    method: 'DELETE', url: `/api/saved-queries/${savedAId}`, headers: authHeaders(userB.token),
  });
  assert.equal(deleteAttempt.statusCode, 404, `B was able to act on A's saved query: ${deleteAttempt.body}`);
  const stillThere = await prisma.savedQuery.findUnique({ where: { id: savedAId } });
  assert.ok(stillThere, "A's saved query was deleted by B — IDOR still present");

  // Sanity: each user CAN delete their own.
  const ownDelete = await app.inject({
    method: 'DELETE', url: `/api/saved-queries/${savedBId}`, headers: authHeaders(userB.token),
  });
  assert.equal(ownDelete.statusCode, 200, ownDelete.body);
});

test('registering a new user auto-provisions a DatabaseConnection they own', async () => {
  const user = await registerUser(`carol-${Date.now()}@example.com`);
  const connection = await prisma.databaseConnection.findFirst({ where: { userId: user.userId } });
  assert.ok(connection, 'no DatabaseConnection was created for the newly registered user');
});
