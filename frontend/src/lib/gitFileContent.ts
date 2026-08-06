import { apiFetch } from '@/lib/api';

export type DeletedFileContentResult =
  | { status: 'ok'; content: string }
  | { status: 'not-in-head' }
  | { status: 'error'; message: string };

/**
 * Fetches the last committed (HEAD) content for a file that no longer
 * exists on disk, to build a deletion diff (old content vs empty) the same
 * way VS Code shows a deleted file's diff.
 *
 * `/api/git/show` reports `existsInHead: false` for two distinct git error
 * cases (never committed, or the repo has no commits at all) that would
 * otherwise be indistinguishable from "genuinely empty file" — surface
 * that as its own `not-in-head` status so callers can show a clear message
 * instead of a blank diff or a generic failure toast.
 */
export async function fetchDeletedFileContent(path: string): Promise<DeletedFileContentResult> {
  try {
    const res = await apiFetch(`/api/git/show?path=${encodeURIComponent(path)}`);
    const data = await res.json();

    if (!data.success) {
      return { status: 'error', message: data.error || 'Failed to load the file’s last committed version.' };
    }
    if (data.existsInHead === false) {
      return { status: 'not-in-head' };
    }
    return { status: 'ok', content: data.content || '' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : undefined;
    return { status: 'error', message: message || 'Failed to load the file’s last committed version.' };
  }
}
