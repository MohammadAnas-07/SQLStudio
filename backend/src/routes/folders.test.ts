import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { FastifyInstance } from 'fastify';

// Exercises folder CRUD (create/rename/delete/list) and moving a saved
// query into/out of a folder, all scoped to the requesting user.
//
// The delete-folder path gets the most scrutiny here: deleting a folder
// must move its queries to "Uncategorized" (folderId: null) and must
// NEVER cascade-delete the saved queries themselves — that's real user
// data with no undo.
//
// Runs against its own dedicated SQLite file (never the dev metadata.db),
// same setup pattern as dataIsolation.test.ts / search.test.ts.
// DATABASE_URL must be set before any module that constructs PrismaClient
// is imported.
const BACKEND_ROOT = path.resolve(__dirname, '../..');
const TEST_DB_PATH = path.join(BACKEND_ROOT, 'prisma', 'test-folders.db');
process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.JWT_SECRET = 'test-secret-for-folders-tests';

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
  const { foldersRoutes } = await import('./folders.routes');

  app = Fastify();
  configureAuth(app);
  await authRoutes(app);
  await queriesRoutes(app);
  await foldersRoutes(app);
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

async function createFolder(token: string, name: string) {
  const res = await app.inject({
    method: 'POST', url: '/api/folders', headers: authHeaders(token), payload: { name },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().folder.id as string;
}

async function saveQuery(token: string, name: string, query = 'SELECT 1;') {
  const res = await app.inject({
    method: 'POST', url: '/api/saved-queries', headers: authHeaders(token), payload: { name, query },
  });
  assert.equal(res.statusCode, 200, res.body);
  return res.json().savedQuery.id as string;
}

test('folder CRUD is scoped to the requesting user', async () => {
  const tokenA = await registerUser(`alice-${Date.now()}@example.com`);
  const tokenB = await registerUser(`bob-${Date.now()}@example.com`);

  const folderAId = await createFolder(tokenA, 'Reports');
  await createFolder(tokenB, "Bob's Folder");

  // A only sees their own folder.
  const listA = await app.inject({ method: 'GET', url: '/api/folders', headers: authHeaders(tokenA) });
  const foldersA: Array<{ name: string }> = listA.json().folders;
  assert.equal(foldersA.length, 1);
  assert.equal(foldersA[0].name, 'Reports');

  // B cannot rename A's folder.
  const renameAttempt = await app.inject({
    method: 'PATCH', url: `/api/folders/${folderAId}`, headers: authHeaders(tokenB), payload: { name: 'Hijacked' },
  });
  assert.equal(renameAttempt.statusCode, 404, renameAttempt.body);

  // A can rename their own folder.
  const rename = await app.inject({
    method: 'PATCH', url: `/api/folders/${folderAId}`, headers: authHeaders(tokenA), payload: { name: 'Quarterly Reports' },
  });
  assert.equal(rename.statusCode, 200, rename.body);
  assert.equal(rename.json().folder.name, 'Quarterly Reports');

  // B cannot delete A's folder.
  const deleteAttempt = await app.inject({
    method: 'DELETE', url: `/api/folders/${folderAId}`, headers: authHeaders(tokenB),
  });
  assert.equal(deleteAttempt.statusCode, 404, deleteAttempt.body);
  const stillThere = await prisma.folder.findUnique({ where: { id: folderAId } });
  assert.ok(stillThere, "A's folder was deleted by B — IDOR present");
});

test('deleting a folder moves its queries to Uncategorized instead of deleting them', async () => {
  const token = await registerUser(`carol-${Date.now()}@example.com`);
  const folderId = await createFolder(token, 'Scratch');

  const queryInFolderId = await saveQuery(token, 'Inside Folder');
  const queryOutsideId = await saveQuery(token, 'Never Foldered');

  const move = await app.inject({
    method: 'PATCH', url: `/api/saved-queries/${queryInFolderId}`, headers: authHeaders(token), payload: { folderId },
  });
  assert.equal(move.statusCode, 200, move.body);
  assert.equal(move.json().savedQuery.folderId, folderId);

  const del = await app.inject({ method: 'DELETE', url: `/api/folders/${folderId}`, headers: authHeaders(token) });
  assert.equal(del.statusCode, 200, del.body);

  // The folder itself is gone.
  const foldersAfter = await app.inject({ method: 'GET', url: '/api/folders', headers: authHeaders(token) });
  assert.deepEqual(foldersAfter.json().folders, []);

  // Both saved queries still exist — the one that was in the deleted
  // folder must NOT have been cascade-deleted.
  const allQueries = await app.inject({ method: 'GET', url: '/api/saved-queries', headers: authHeaders(token) });
  const names: string[] = allQueries.json().savedQueries.map((q: { name: string }) => q.name);
  assert.ok(names.includes('Inside Folder'), 'saved query was cascade-deleted along with its folder');
  assert.ok(names.includes('Never Foldered'));

  // The query that was in the deleted folder now has folderId: null
  // (Uncategorized), not a dangling reference to the deleted folder.
  const movedQuery = allQueries.json().savedQueries.find((q: { id: string }) => q.id === queryInFolderId);
  assert.equal(movedQuery.folderId, null);

  // The query that was never in a folder is untouched.
  const untouchedQuery = allQueries.json().savedQueries.find((q: { id: string }) => q.id === queryOutsideId);
  assert.equal(untouchedQuery.folderId, null);

  // Filtering by folderId=uncategorized picks up the freshly-orphaned query.
  const uncategorized = await app.inject({
    method: 'GET', url: '/api/saved-queries?folderId=uncategorized', headers: authHeaders(token),
  });
  const uncategorizedNames: string[] = uncategorized.json().savedQueries.map((q: { name: string }) => q.name);
  assert.ok(uncategorizedNames.includes('Inside Folder'));
  assert.ok(uncategorizedNames.includes('Never Foldered'));
});

test('GET /api/saved-queries?folderId= filters to that folder, scoped to the requesting user', async () => {
  const tokenA = await registerUser(`dave-${Date.now()}@example.com`);
  const tokenB = await registerUser(`erin-${Date.now()}@example.com`);

  const folderId = await createFolder(tokenA, 'Work');
  const inFolderId = await saveQuery(tokenA, 'In Work');
  await saveQuery(tokenA, 'Not In Work');
  await app.inject({
    method: 'PATCH', url: `/api/saved-queries/${inFolderId}`, headers: authHeaders(tokenA), payload: { folderId },
  });

  const filtered = await app.inject({
    method: 'GET', url: `/api/saved-queries?folderId=${folderId}`, headers: authHeaders(tokenA),
  });
  const filteredResults: Array<{ name: string }> = filtered.json().savedQueries;
  assert.equal(filteredResults.length, 1);
  assert.equal(filteredResults[0].name, 'In Work');

  // B querying A's folder id gets nothing — filtering must stay scoped to
  // the requester even though the folder id itself is a valid, existing id.
  const bAttempt = await app.inject({
    method: 'GET', url: `/api/saved-queries?folderId=${folderId}`, headers: authHeaders(tokenB),
  });
  assert.equal(bAttempt.statusCode, 200, bAttempt.body);
  assert.deepEqual(bAttempt.json().savedQueries, []);
});

test('a user cannot move their query into another user\'s folder', async () => {
  const tokenA = await registerUser(`frank-${Date.now()}@example.com`);
  const tokenB = await registerUser(`grace-${Date.now()}@example.com`);

  const bFolderId = await createFolder(tokenB, "Grace's Folder");
  const aQueryId = await saveQuery(tokenA, "Frank's Query");

  const attempt = await app.inject({
    method: 'PATCH', url: `/api/saved-queries/${aQueryId}`, headers: authHeaders(tokenA), payload: { folderId: bFolderId },
  });
  assert.equal(attempt.statusCode, 404, attempt.body);

  const stillUnfoldered = await prisma.savedQuery.findUnique({ where: { id: aQueryId } });
  assert.equal(stillUnfoldered?.folderId, null);
});
