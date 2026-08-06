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

/**
 * A conflict alongside an unrelated, genuinely staged file. Models the
 * scenario the commit-confirmation dialog guards against: the user has
 * something ready to commit (`other.ts`, staged normally) while a separate
 * file (`conflict.ts`) is still unresolved. Note git itself never lets a
 * truly unmerged path sit in `staged` — simple-git's "UU" parser only
 * pushes to `conflicted` — so this is the closest real shape to "a
 * conflicted file staged alongside other changes".
 */
export const conflictWithOtherStagedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: ['conflict.ts'],
  created: ['other.ts'],
  deleted: [],
  modified: [],
  renamed: [],
  files: [
    { path: 'conflict.ts', index: 'U', working_dir: 'U' },
    { path: 'other.ts', index: 'A', working_dir: ' ' },
  ],
  staged: ['other.ts'],
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

/** A file staged as Added, nothing further pending — raw code "A ". */
export const stagedOnlyFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: ['staged.ts'],
  deleted: [],
  modified: [],
  renamed: [],
  files: [
    { path: 'staged.ts', index: 'A', working_dir: ' ' },
  ],
  staged: ['staged.ts'],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/** A file modified in the working tree only, never staged — raw code " M". */
export const unstagedOnlyFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: [],
  deleted: [],
  modified: ['unstaged.ts'],
  renamed: [],
  files: [
    { path: 'unstaged.ts', index: ' ', working_dir: 'M' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/**
 * A file staged as Added, then further edited on disk before being
 * committed — raw code "AM". Per simple-git's parser this single line
 * pushes the path into `created`, `staged`, AND `modified` simultaneously,
 * so the same path legitimately belongs in both the Staged Changes and
 * Changes sections at once, each reflecting a different half of the code:
 * index ('A') for Staged, working_dir ('M') for unstaged.
 */
export const stagedThenModifiedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: ['combo.ts'],
  deleted: [],
  modified: ['combo.ts'],
  renamed: [],
  files: [
    { path: 'combo.ts', index: 'A', working_dir: 'M' },
  ],
  staged: ['combo.ts'],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/** A file deleted from disk but not yet staged — raw code " D". */
export const deletedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: [],
  deleted: ['gone.sql'],
  modified: [],
  renamed: [],
  files: [
    { path: 'gone.sql', index: ' ', working_dir: 'D' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/** A file deletion that has been staged (e.g. `git rm`) — raw code "D ". */
export const stagedDeletedFileGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: [],
  deleted: ['gone-staged.sql'],
  modified: [],
  renamed: [],
  files: [
    { path: 'gone-staged.sql', index: 'D', working_dir: ' ' },
  ],
  staged: ['gone-staged.sql'],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/**
 * A whole new directory that git collapsed into a single "?? dir/" line
 * (untracked-files=normal mode) rather than listing its files individually.
 * The path in `files` carries a trailing slash — the signal that this
 * entry IS a folder, not a file.
 */
export const singleLineNewFolderGitStatus: GitStatusResult = {
  not_added: ['new-folder/'],
  conflicted: [],
  created: [],
  deleted: [],
  modified: [],
  renamed: [],
  files: [
    { path: 'new-folder/', index: '?', working_dir: '?' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};

/**
 * A folder git reported via N individual per-file lines instead of one
 * collapsed line — the structurally different but visually-equivalent
 * case: `existing-folder` itself never appears as its own entry in
 * `files`, only its two modified children do.
 */
export const folderWithModifiedChildrenGitStatus: GitStatusResult = {
  not_added: [],
  conflicted: [],
  created: [],
  deleted: [],
  modified: ['existing-folder/a.sql', 'existing-folder/b.sql'],
  renamed: [],
  files: [
    { path: 'existing-folder/a.sql', index: ' ', working_dir: 'M' },
    { path: 'existing-folder/b.sql', index: ' ', working_dir: 'M' },
  ],
  staged: [],
  ahead: 0,
  behind: 0,
  current: 'main',
  tracking: null,
  isClean: () => false,
};
