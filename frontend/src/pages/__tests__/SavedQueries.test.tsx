import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

function savedQueriesResponse(names: string[]) {
  return new Response(JSON.stringify({
    success: true,
    savedQueries: names.map((name, i) => ({
      id: String(i),
      name,
      description: '',
      query: 'SELECT 1;',
      updatedAt: new Date().toISOString(),
    })),
  }));
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe('SavedQueries - search', () => {
  it('debounces typing before calling the API, and calls it with the search param', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/saved-queries') return savedQueriesResponse(['Top Customers', 'Orders']);
      if (path === '/api/saved-queries?search=top') return savedQueriesResponse(['Top Customers']);
      return savedQueriesResponse([]);
    });

    renderPage();
    await screen.findByText('Top Customers');
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);

    const input = screen.getByPlaceholderText('Search saved queries...');
    fireEvent.change(input, { target: { value: 't' } });
    fireEvent.change(input, { target: { value: 'to' } });
    fireEvent.change(input, { target: { value: 'top' } });

    // Still just the one initial call immediately after typing — the
    // debounce should be holding the request back.
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/saved-queries?search=top');
    });

    await waitFor(() => {
      expect(screen.queryByText('Orders')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Top Customers')).toBeInTheDocument();

    // Only one request fired for the debounced term, not one per keystroke.
    const searchCalls = vi.mocked(apiFetch).mock.calls.filter(([p]) => String(p).startsWith('/api/saved-queries?search='));
    expect(searchCalls).toHaveLength(1);
  });

  it('shows a clear "no results" state instead of a blank list when the search matches nothing', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/saved-queries') return savedQueriesResponse(['Orders']);
      return savedQueriesResponse([]);
    });

    renderPage();
    await screen.findByText('Orders');

    const input = screen.getByPlaceholderText('Search saved queries...');
    fireEvent.change(input, { target: { value: 'nonexistent-xyz' } });

    await screen.findByText('No saved queries match "nonexistent-xyz".');
  });
});
