import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import os from 'os';
import { resolveAndValidatePath } from './files.routes';

const WORKSPACE_ROOT = path.join(os.homedir(), 'Desktop', 'sql-workspace');

test('resolveAndValidatePath allows a normal path inside the workspace', () => {
  const resolved = resolveAndValidatePath('notes/todo.sql');
  assert.equal(resolved, path.join(WORKSPACE_ROOT, 'notes', 'todo.sql'));
});

test('resolveAndValidatePath allows the workspace root itself', () => {
  const resolved = resolveAndValidatePath('');
  assert.equal(resolved, WORKSPACE_ROOT);
});

test('resolveAndValidatePath rejects a traversal into a sibling directory that merely shares the prefix', () => {
  // "sql-workspace-evil" passes a naive `startsWith(WORKSPACE_ROOT)` check
  // because it shares the WORKSPACE_ROOT string as a prefix, even though it
  // is a completely different, sibling directory.
  assert.throws(
    () => resolveAndValidatePath('../sql-workspace-evil/passwd'),
    /Access denied/
  );
});

test('resolveAndValidatePath rejects a plain ".." escape above the workspace', () => {
  assert.throws(
    () => resolveAndValidatePath('../../etc/passwd'),
    /Access denied/
  );
});
