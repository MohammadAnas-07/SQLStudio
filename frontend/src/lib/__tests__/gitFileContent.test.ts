import { describe, it, expect, vi } from 'vitest';
import { fetchDeletedFileContent } from '../gitFileContent';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

function mockShowResponse(body: unknown) {
  vi.mocked(apiFetch).mockResolvedValue(new Response(JSON.stringify(body)));
}

describe('fetchDeletedFileContent', () => {
  it('returns ok with the committed content when the file exists in HEAD', async () => {
    mockShowResponse({ success: true, content: 'SELECT 1;', existsInHead: true });

    const result = await fetchDeletedFileContent('deleted.sql');

    expect(result).toEqual({ status: 'ok', content: 'SELECT 1;' });
  });

  it('returns ok with empty content for a file that was committed genuinely empty', async () => {
    mockShowResponse({ success: true, content: '', existsInHead: true });

    const result = await fetchDeletedFileContent('empty.sql');

    expect(result).toEqual({ status: 'ok', content: '' });
  });

  it('returns not-in-head, not a blank diff, when the backend cannot produce prior content', async () => {
    mockShowResponse({ success: true, content: '', existsInHead: false });

    const result = await fetchDeletedFileContent('never-committed.sql');

    expect(result).toEqual({ status: 'not-in-head' });
  });

  it('returns an error with a message when the backend request itself fails', async () => {
    mockShowResponse({ success: false, error: 'git show failed' });

    const result = await fetchDeletedFileContent('broken.sql');

    expect(result).toEqual({ status: 'error', message: 'git show failed' });
  });

  it('returns a fallback error message if the backend fails without an error string', async () => {
    mockShowResponse({ success: false });

    const result = await fetchDeletedFileContent('broken.sql');

    expect(result.status).toBe('error');
    expect(result.status === 'error' && result.message).toBeTruthy();
  });

  it('returns an error when the network request itself throws', async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error('network down'));

    const result = await fetchDeletedFileContent('deleted.sql');

    expect(result).toEqual({ status: 'error', message: 'network down' });
  });
});
