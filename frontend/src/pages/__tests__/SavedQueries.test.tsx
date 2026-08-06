import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SavedQueries from '../SavedQueries';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SavedQueries />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body));
}

function savedQueriesResponse(items: Array<{ name: string; id?: string; folderId?: string | null }>) {
  return ok({
    success: true,
    savedQueries: items.map((item, i) => ({
      id: item.id ?? String(i),
      name: item.name,
      description: '',
      query: 'SELECT 1;',
      folderId: item.folderId ?? null,
      updatedAt: new Date().toISOString(),
    })),
  });
}

function foldersResponse(folders: Array<{ id: string; name: string }>) {
  return ok({ success: true, folders });
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe('SavedQueries - search', () => {
  it('debounces typing before calling the API, and calls it with the search param', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/folders') return foldersResponse([]);
      if (path === '/api/saved-queries') return savedQueriesResponse([{ name: 'Top Customers' }, { name: 'Orders' }]);
      if (path === '/api/saved-queries?search=top') return savedQueriesResponse([{ name: 'Top Customers' }]);
      return savedQueriesResponse([]);
    });

    renderPage();
    await screen.findByText('Top Customers');

    const savedQueriesCalls = () => vi.mocked(apiFetch).mock.calls.filter(([p]) => String(p).startsWith('/api/saved-queries'));
    expect(savedQueriesCalls()).toHaveLength(1);

    const input = screen.getByPlaceholderText('Search saved queries...');
    fireEvent.change(input, { target: { value: 't' } });
    fireEvent.change(input, { target: { value: 'to' } });
    fireEvent.change(input, { target: { value: 'top' } });

    // Still just the one initial call immediately after typing — the
    // debounce should be holding the request back.
    expect(savedQueriesCalls()).toHaveLength(1);

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/saved-queries?search=top');
    });

    await waitFor(() => {
      expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Top Customers')).toBeInTheDocument();

    // Only one request fired for the debounced term, not one per keystroke.
    expect(savedQueriesCalls()).toHaveLength(2);
  });

  it('shows a clear "no results" state instead of a blank list when the search matches nothing', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/folders') return foldersResponse([]);
      if (path === '/api/saved-queries') return savedQueriesResponse([{ name: 'Orders' }]);
      return savedQueriesResponse([]);
    });

    renderPage();
    await screen.findByText('Orders');

    const input = screen.getByPlaceholderText('Search saved queries...');
    fireEvent.change(input, { target: { value: 'nonexistent-xyz' } });

    await screen.findByText('No saved queries match "nonexistent-xyz".');
  });
});

describe('SavedQueries - folders', () => {
  it('creates a folder via the New Folder button', async () => {
    let foldersState = [{ id: 'f1', name: 'Reports' }];
    vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/folders' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        foldersState = [...foldersState, { id: 'f2', name: body.name }];
        return ok({ success: true, folder: { id: 'f2', name: body.name } });
      }
      if (path === '/api/folders') return foldersResponse(foldersState);
      if (path.startsWith('/api/saved-queries')) return savedQueriesResponse([{ name: 'Orders' }]);
      return ok({ success: true });
    });

    renderPage();
    await screen.findByText('Orders');
    expect(screen.getByRole('button', { name: 'Reports' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /New Folder/i }));
    const input = await screen.findByPlaceholderText('Folder name');
    fireEvent.change(input, { target: { value: 'Analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/folders', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Analytics' }),
      }));
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Analytics' })).toBeInTheDocument();
    });
  });

  it('does not allow creating a folder with a blank name', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/folders') return foldersResponse([]);
      if (path.startsWith('/api/saved-queries')) return savedQueriesResponse([{ name: 'Orders' }]);
      return ok({ success: true });
    });

    renderPage();
    await screen.findByText('Orders');

    fireEvent.click(screen.getByRole('button', { name: /New Folder/i }));
    await screen.findByPlaceholderText('Folder name');

    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
    expect(vi.mocked(apiFetch)).not.toHaveBeenCalledWith('/api/folders', expect.objectContaining({ method: 'POST' }));
  });

  it('moves a saved query into a folder via the folder select on its card', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/folders') return foldersResponse([{ id: 'f1', name: 'Reports' }]);
      if (path === '/api/saved-queries/q1' && init?.method === 'PATCH') {
        const body = JSON.parse(init.body as string);
        return ok({ success: true, savedQuery: { id: 'q1', name: 'Orders', folderId: body.folderId } });
      }
      if (path.startsWith('/api/saved-queries')) return savedQueriesResponse([{ id: 'q1', name: 'Orders', folderId: null }]);
      return ok({ success: true });
    });

    renderPage();
    await screen.findByText('Orders');

    const card = screen.getByText('Orders').closest('div.group') as HTMLElement;
    const select = within(card).getByTitle('Folder: Uncategorized');
    fireEvent.change(select, { target: { value: 'f1' } });

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/saved-queries/q1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ folderId: 'f1' }),
      }));
    });
  });

  it('filters the list by folder when a folder chip is clicked', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/folders') return foldersResponse([{ id: 'f1', name: 'Reports' }]);
      if (path === '/api/saved-queries') return savedQueriesResponse([{ name: 'In Folder', folderId: 'f1' }, { name: 'Not In Folder', folderId: null }]);
      if (path === '/api/saved-queries?folderId=f1') return savedQueriesResponse([{ name: 'In Folder', folderId: 'f1' }]);
      return savedQueriesResponse([]);
    });

    renderPage();
    await screen.findByText('In Folder');
    expect(screen.getByText('Not In Folder')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reports' }));

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/saved-queries?folderId=f1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Not In Folder')).not.toBeInTheDocument();
    });
    expect(screen.getByText('In Folder')).toBeInTheDocument();
  });
});
