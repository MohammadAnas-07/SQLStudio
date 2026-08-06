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
