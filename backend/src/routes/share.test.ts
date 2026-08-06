import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

// Exercises public read-only sharing of a saved query:
//   POST/DELETE /api/saved-queries/:id/share (authenticated, owner-only)
//   GET /api/public/shared-queries/:token (public, rate-limited)
//
// This is the highest-risk endpoint in the app — it's the only one
// reachable with no auth at all — so the tests here lean hard on:
//   1. The public response's actual serialized shape (not just "200 OK")
//      never includes anything beyond {name, query}, even though the
//      underlying SavedQuery row has connectionId/folderId/userId/etc.
//   2. An invalid token and a disabled-sharing token are indistinguishable
//      (same 404, same body).
//   3. Enable/disable require auth and are scoped to the owner; the public
//      view route requires no auth at all.
//   4. The public route is actually rate-limited, not just configured to
//      look like it is.
//
// Runs against its own dedicated SQLite file (never the dev metadata.db),
// same setup pattern as dataIsolation.test.ts / search.test.ts /
// folders.test.ts. DATABASE_URL must be set before any module that
// constructs PrismaClient is imported.
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TEST_DB_PATH = path.join(BACKEND_ROOT, 'prisma', 'test-share.db');
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.JWT_SECRET = 'test-secret-for-share-tests';

function removeTestDbFiles() {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = TEST_DB_PATH + suffix;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}

let app: FastifyInstance;
let prisma: typeof import('../database').prisma;

before(async () => {
  removeTestDbFiles();
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: BACKEND_ROOT,
    env: { ...process.env },
    stdio: 'pipe',
  });

  const database = await import('../database');
  prisma = database.prisma;
  await database.db.waitReady;

  const { configureAuth } = await import('../plugins/auth');
  const { authRoutes } = await import('./auth.routes');
  const { queriesRoutes } = await import('./queries.routes');

  app = Fastify();
  configureAuth(app);
  // Mirrors index.ts: global: false means nothing is rate-limited unless a
  // route opts in via its own config.rateLimit (the public share route).
  await app.register(rateLimit, { global: false });
  await authRoutes(app);
  await queriesRoutes(app);
  await app.ready();
});

after(async () => {
  await app?.close();
  await prisma?.$disconnect();
  const database = await import('../database');
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

async function saveQuery(token: string, name: string, query: string) {
  const res = await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(token), payload: { name, query },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().savedQuery.id as string;
}

test('enabling and disabling sharing requires auth', async () => {
  const token = await registerUser(`no-auth-${Date.now()}@example.com`);
  const queryId = await saveQuery(token, 'Some Query', 'SELECT 1;');

  const enableNoAuth = await app.inject({ method: 'POST', url: `/api/saved-queries/${queryId}/share` });
  assert.equal(enableNoAuth.statusCode, 401, enableNoAuth.body);

  const disableNoAuth = await app.inject({ method: 'DELETE', url: `/api/saved-queries/${queryId}/share` });
  assert.equal(disableNoAuth.statusCode, 401, disableNoAuth.body);
});

test('enabling and disabling sharing is scoped to the owner', async () => {
  const owner = await registerUser(`owner-${Date.now()}@example.com`);
  const other = await registerUser(`other-${Date.now()}@example.com`);
  const queryId = await saveQuery(owner, "Owner's Query", 'SELECT 1;');

  const enableAttempt = await app.inject({
    method: 'POST', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(other),
  });
  assert.equal(enableAttempt.statusCode, 404, enableAttempt.body);

  const stillUnshared = await prisma.savedQuery.findUnique({ where: { id: queryId } });
  assert.equal(stillUnshared?.shareToken, null, "another user was able to enable sharing on someone else's query");

  // Owner enables it, then the other user must not be able to disable it.
  const ownerEnable = await app.inject({
    method: 'POST', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(owner),
  });
  assert.equal(ownerEnable.statusCode, 200, ownerEnable.body);

  const disableAttempt = await app.inject({
    method: 'DELETE', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(other),
  });
  assert.equal(disableAttempt.statusCode, 404, disableAttempt.body);

  const stillShared = await prisma.savedQuery.findUnique({ where: { id: queryId } });
  assert.ok(stillShared?.shareToken, "another user was able to disable sharing on someone else's query");
});

test('the public share-view endpoint requires no auth and returns only {name, query} — never connectionId, folderId, userId, description, or id', async () => {
  const owner = await registerUser(`serialization-${Date.now()}@example.com`);
  const queryId = await saveQuery(owner, 'Revenue Report', 'SELECT * FROM revenue;');

  // Give the row real values in every other field a careless `{
  // ...savedQuery }` spread could leak, so this test is asserting against
  // an actual populated row, not an already-empty one.
  await prisma.savedQuery.update({
    where: { id: queryId },
    data: { description: 'Internal notes nobody outside the team should see' },
  });

  const enable = await app.inject({
    method: 'POST', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(owner),
  });
  assert.equal(enable.statusCode, 200, enable.body);
  const { shareToken } = enable.json();
  assert.ok(shareToken && typeof shareToken === 'string' && shareToken.length >= 32, 'shareToken is missing or looks guessable');

  // No Authorization header at all — this must work for a fully anonymous caller.
  const view = await app.inject({ method: 'GET', url: `/api/public/shared-queries/${shareToken}` });
  assert.equal(view.statusCode, 200, view.body);

  const body = view.json();
  assert.deepEqual(Object.keys(body).sort(), ['name', 'query', 'success'].sort(),
    `public response has extra fields beyond {success, name, query}: ${JSON.stringify(body)}`);
  assert.equal(body.name, 'Revenue Report');
  assert.equal(body.query, 'SELECT * FROM revenue;');
  assert.equal((body as any).connectionId, undefined);
  assert.equal((body as any).folderId, undefined);
  assert.equal((body as any).userId, undefined);
  assert.equal((body as any).description, undefined);
  assert.equal((body as any).id, undefined);
  assert.equal((body as any).shareToken, undefined);
});

test('an invalid token and a disabled-sharing token both produce the same clean 404', async () => {
  const owner = await registerUser(`disable-${Date.now()}@example.com`);
  const queryId = await saveQuery(owner, 'Temp Share', 'SELECT 1;');

  const enable = await app.inject({
    method: 'POST', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(owner),
  });
  const { shareToken } = enable.json();

  // Confirm it's actually reachable before disabling, so the 404 below is
  // meaningfully "disabled", not "was never valid".
  const beforeDisable = await app.inject({ method: 'GET', url: `/api/public/shared-queries/${shareToken}` });
  assert.equal(beforeDisable.statusCode, 200, beforeDisable.body);

  const disable = await app.inject({
    method: 'DELETE', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(owner),
  });
  assert.equal(disable.statusCode, 200, disable.body);

  const afterDisable = await app.inject({ method: 'GET', url: `/api/public/shared-queries/${shareToken}` });
  const neverValid = await app.inject({ method: 'GET', url: '/api/public/shared-queries/this-token-never-existed' });

  assert.equal(afterDisable.statusCode, 404, afterDisable.body);
  assert.equal(neverValid.statusCode, 404, neverValid.body);
  // Not just "both 404" — the exact same body, so there's no way to tell
  // "sharing got turned off" apart from "this link was never real".
  assert.deepEqual(afterDisable.json(), neverValid.json());
});

test('re-enabling sharing rotates the token, immediately invalidating the previous link', async () => {
  const owner = await registerUser(`rotate-${Date.now()}@example.com`);
  const queryId = await saveQuery(owner, 'Rotating Share', 'SELECT 1;');

  const first = await app.inject({
    method: 'POST', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(owner),
  });
  const firstToken = first.json().shareToken as string;

  const second = await app.inject({
    method: 'POST', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(owner),
  });
  const secondToken = second.json().shareToken as string;

  assert.notEqual(firstToken, secondToken, 'enabling sharing again did not rotate the token');

  const oldLink = await app.inject({ method: 'GET', url: `/api/public/shared-queries/${firstToken}` });
  assert.equal(oldLink.statusCode, 404, 'the old share link still works after rotation');

  const newLink = await app.inject({ method: 'GET', url: `/api/public/shared-queries/${secondToken}` });
  assert.equal(newLink.statusCode, 200, newLink.body);
});

test('the public share-view endpoint is rate-limited per caller', async () => {
  const owner = await registerUser(`ratelimit-${Date.now()}@example.com`);
  const queryId = await saveQuery(owner, 'Popular Query', 'SELECT 1;');
  const enable = await app.inject({
    method: 'POST', url: `/api/saved-queries/${queryId}/share`, headers: authHeaders(owner),
  });
  const { shareToken } = enable.json();

  const statusCodes: number[] = [];
  for (let i = 0; i < 25; i++) {
    const res = await app.inject({ method: 'GET', url: `/api/public/shared-queries/${shareToken}` });
    statusCodes.push(res.statusCode);
  }

  assert.ok(statusCodes.some(code => code === 429), `expected at least one 429 among 25 rapid requests, got: ${statusCodes.join(',')}`);
});
