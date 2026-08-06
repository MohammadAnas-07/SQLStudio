import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';

// Exercises the `search` query param added to GET /api/saved-queries and
// GET /api/history: it must match against the right fields (name + query
// text for saved queries, query text only for history) and — critically —
// must stay scoped to the requesting user the same way the unfiltered list
// endpoints do (reusing the fix from dataIsolation.test.ts's chunk; search
// must never become a side-channel for reading another user's data).
//
// Runs against its own dedicated SQLite file (never the dev metadata.db),
// same setup pattern as dataIsolation.test.ts. DATABASE_URL must be set
// before any module that constructs PrismaClient is imported.
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TEST_DB_PATH = path.join(BACKEND_ROOT, 'prisma', 'test-search.db');
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.JWT_SECRET = 'test-secret-for-search-tests';

function removeTestDbFiles() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

let app: FastifyInstance;

before(async () => {
  removeTestDbFiles();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: BACKEND_ROOT,
    env: { ...process.env },
    stdio: 'pipe',
  });

  const database = await import('../database');
  await database.db.waitReady;

  const { configureAuth } = await import('../plugins/auth');
  const { authRoutes } = await import('./auth.routes');
  const { queriesRoutes } = await import('./queries.routes');

  app = Fastify();
  configureAuth(app);
  await authRoutes(app);
  await queriesRoutes(app);
  await app.ready();
});

after(async () => {
  await app?.close();
  const database = await import('../database');
  await database.prisma?.$disconnect();
  await database.db?.close();
  removeTestDbFiles();
});

async function registerUser(email: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'correct-horse-battery-staple', name: email.split('@')[0] },
  });
  assert.equal(res.statusCode, 200, `registration failed for ${email}: ${res.body}`);
  return res.json().token as string;
}

function authHeaders(token: string) {
  return { authorization: `Bearer ${token}` };
}

test('GET /api/saved-queries?search= matches name or SQL text, scoped to the requesting user', async () => {
  const tokenA = await registerUser(`alice-${Date.now()}@example.com`);
  const tokenB = await registerUser(`bob-${Date.now()}@example.com`);

  // Alice: one saved query matchable by name, one matchable only by SQL text.
  await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(tokenA),
    payload: { name: 'Top Customers Report', query: 'SELECT * FROM customers;' },
  });
  await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(tokenA),
    payload: { name: 'Untitled', query: 'SELECT * FROM revenue_by_region;' },
  });
  await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(tokenA),
    payload: { name: 'Orders', query: 'SELECT * FROM orders;' },
  });

  // Bob has a saved query that would also match the term "revenue" — this
  // must never show up in Alice's search results.
  await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(tokenB),
    payload: { name: "Bob's revenue query", query: 'SELECT * FROM bob_revenue;' },
  });

  // Match by name.
  const byName = await app.inject({
    method: 'GET', url: '/api/saved-queries?search=Top%20Customers', headers: authHeaders(tokenA),
  });
  assert.equal(byName.statusCode, 200, byName.body);
  const byNameResults: Array<{ name: string }> = byName.json().savedQueries;
  assert.equal(byNameResults.length, 1);
  assert.equal(byNameResults[0].name, 'Top Customers Report');

  // Match by SQL text (name doesn't contain the term).
  const byQueryText = await app.inject({
    method: 'GET', url: '/api/saved-queries?search=revenue_by_region', headers: authHeaders(tokenA),
  });
  assert.equal(byQueryText.statusCode, 200, byQueryText.body);
  const byQueryResults: Array<{ name: string }> = byQueryText.json().savedQueries;
  assert.equal(byQueryResults.length, 1);
  assert.equal(byQueryResults[0].name, 'Untitled');

  // A broader term ("revenue") that also matches Bob's saved query must stay
  // scoped to Alice — this is the actual isolation assertion.
  const scoped = await app.inject({
    method: 'GET', url: '/api/saved-queries?search=revenue', headers: authHeaders(tokenA),
  });
  assert.equal(scoped.statusCode, 200, scoped.body);
  const scopedResults: Array<{ name: string }> = scoped.json().savedQueries;
  assert.ok(scopedResults.every(q => q.name !== "Bob's revenue query"), "search leaked another user's saved query");
  assert.ok(scopedResults.some(q => q.name === 'Untitled'), "search dropped the requester's own matching query");

  // No match at all -> empty list, not an error.
  const noMatch = await app.inject({
    method: 'GET', url: '/api/saved-queries?search=nonexistent-term-xyz', headers: authHeaders(tokenA),
  });
  assert.equal(noMatch.statusCode, 200, noMatch.body);
  assert.deepEqual(noMatch.json().savedQueries, []);

  // No search param -> unfiltered list, same as before this feature.
  const unfiltered = await app.inject({
    method: 'GET', url: '/api/saved-queries', headers: authHeaders(tokenA),
  });
  assert.equal(unfiltered.statusCode, 200, unfiltered.body);
  assert.equal(unfiltered.json().savedQueries.length, 3);
});

test('GET /api/history?search= matches the SQL text, scoped to the requesting user', async () => {
  const tokenA = await registerUser(`carol-${Date.now()}@example.com`);
  const tokenB = await registerUser(`dave-${Date.now()}@example.com`);

  await app.inject({
    method: 'POST', url: '/api/query/execute', headers: authHeaders(tokenA),
    payload: { query: 'SELECT * FROM widgets;' },
  });
  await app.inject({
    method: 'POST', url: '/api/query/execute', headers: authHeaders(tokenA),
    payload: { query: 'SELECT 1;' },
  });
  await app.inject({
    method: 'POST', url: '/api/query/execute', headers: authHeaders(tokenB),
    payload: { query: 'SELECT * FROM widgets_owned_by_dave;' },
  });

  const results = await app.inject({
    method: 'GET', url: '/api/history?search=widgets', headers: authHeaders(tokenA),
  });
  assert.equal(results.statusCode, 200, results.body);
  const runs: Array<{ query: string }> = results.json().history;
  assert.ok(runs.some(r => r.query === 'SELECT * FROM widgets;'), "search dropped the requester's own matching run");
  assert.ok(!runs.some(r => r.query.includes('dave')), "search leaked another user's query-run history");

  const noMatch = await app.inject({
    method: 'GET', url: '/api/history?search=nonexistent-term-xyz', headers: authHeaders(tokenA),
  });
  assert.equal(noMatch.statusCode, 200, noMatch.body);
  assert.deepEqual(noMatch.json().history, []);
});
