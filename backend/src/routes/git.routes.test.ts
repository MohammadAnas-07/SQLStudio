import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { resolveHeadContent } from './git.routes';

async function makeTempRepo(): Promise<{ dir: string; git: SimpleGit }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-editor-git-test-'));
  const git = simpleGit({ baseDir: dir });
  await git.init();
  await git.addConfig('user.email', 'test@example.com');
  await git.addConfig('user.name', 'Test');
  return { dir, git };
}

test('resolveHeadContent returns the last committed content and existsInHead=true for a file that was committed then deleted', async () => {
  const { dir, git } = await makeTempRepo();
  try {
    const filePath = 'notes.sql';
    await fs.writeFile(path.join(dir, filePath), 'SELECT 1;');
    await git.add(filePath);
    await git.commit('add notes');
    await fs.unlink(path.join(dir, filePath));

    const result = await resolveHeadContent(git, filePath);

    assert.equal(result.success, true);
    assert.equal(result.success && result.content, 'SELECT 1;');
    assert.equal(result.success && result.existsInHead, true);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('resolveHeadContent returns existsInHead=false for a path that was never committed, in a repo that otherwise has commits', async () => {
  const { dir, git } = await makeTempRepo();
  try {
    await fs.writeFile(path.join(dir, 'other.sql'), 'SELECT 2;');
    await git.add('other.sql');
    await git.commit('unrelated commit');

    const result = await resolveHeadContent(git, 'never-committed.sql');

    assert.equal(result.success, true);
    assert.equal(result.success && result.existsInHead, false);
    assert.equal(result.success && result.content, '');
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('resolveHeadContent returns existsInHead=false when the repo has no commits at all yet', async () => {
  const { dir, git } = await makeTempRepo();
  try {
    const result = await resolveHeadContent(git, 'anything.sql');

    assert.equal(result.success, true);
    assert.equal(result.success && result.existsInHead, false);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
