import type { GitStatusResult } from '@/lib/hooks/useGit';

/**
 * Git status for a single staged rename: `oldName.ts` -> `newName.ts`.
 *
 * Mirrors what simple-git's `git.status()` actually returns for a renamed
 * file (verified against simple-git's status parser):
 *  - `renamed` gets a clean `{ from, to }` entry.
 *  - `files` gets an entry at the NEW path with index `R`.
 *  - `staged` does NOT include the renamed path — simple-git's "R " parser
 *    only pushes to `renamed`, never to `staged`. Consumers must merge
 *    `renamed` in themselves to treat the file as staged.
 */
export const renamedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: [],
  deleted: [],
  modified: [],
  renamed: [{ from: 'oldName.ts', to: 'newName.ts' }],
  files: [
    { path: 'newName.ts', index: 'R', working_dir: ' ' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/** A rename nested inside a folder, to exercise folder-badge propagation. */
export const nestedRenamedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: [],
  deleted: [],
  modified: [],
  renamed: [{ from: 'src/utils/oldName.ts', to: 'src/utils/newName.ts' }],
  files: [
    { path: 'src/utils/newName.ts', index: 'R', working_dir: ' ' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/** A plain modification, used as a control case alongside the rename fixtures. */
export const modifiedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: [],
  deleted: [],
  modified: ['other.ts'],
  renamed: [],
  files: [
    { path: 'other.ts', index: ' ', working_dir: 'M' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/**
 * A single unresolved merge conflict (`git status` raw code "UU").
 * Mirrors simple-git: the path lands in the typed `conflicted` array, and
 * `files` carries the raw "UU" index/working_dir codes.
 */
export const conflictedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: ['conflict.ts'],
  created: [],
  deleted: [],
  modified: [],
  renamed: [],
  files: [
    { path: 'conflict.ts', index: 'U', working_dir: 'U' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/**
 * A file whose raw `files` entry looks like a plain Modified file (" M"),
 * but is also listed in the typed `conflicted` array. Exercises the
 * priority rule: conflict must win over Modified even though the raw
 * status codes alone would suggest "just modified".
 */
export const conflictedAndModifiedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: ['bothStates.ts'],
  created: [],
  deleted: [],
  modified: ['bothStates.ts'],
  renamed: [],
  files: [
    { path: 'bothStates.ts', index: ' ', working_dir: 'M' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/** A conflict alongside an unrelated staged rename, to check both sections render. */
export const conflictAndRenameGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: ['conflict.ts'],
  created: [],
  deleted: [],
  modified: [],
  renamed: [{ from: 'oldName.ts', to: 'newName.ts' }],
  files: [
    { path: 'conflict.ts', index: 'U', working_dir: 'U' },
    { path: 'newName.ts', index: 'R', working_dir: ' ' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};
