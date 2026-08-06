import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QueryHistory from '../QueryHistory';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <QueryHistory />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function historyResponse(queries: string[]) {
  return new Response(JSON.stringify({
    success: true,
    history: queries.map((query, i) => ({
      id: String(i),
      query,
      status: 'success',
      executionTimeMs: 5,
      createdAt: new Date().toISOString(),
    })),
  }));
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe('QueryHistory - search', () => {
  it('debounces typing before calling the API, and renders the filtered results', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/history') return historyResponse(['SELECT * FROM widgets;', 'SELECT 1;']);
      if (path === '/api/history?search=widgets') return historyResponse(['SELECT * FROM widgets;']);
      return historyResponse([]);
    });

    renderPage();
    await screen.findByText('SELECT * FROM widgets;');
    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);

    const input = screen.getByPlaceholderText('Search queries...');
    fireEvent.change(input, { target: { value: 'w' } });
    fireEvent.change(input, { target: { value: 'wi' } });
    fireEvent.change(input, { target: { value: 'widgets' } });

    expect(vi.mocked(apiFetch)).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(vi.mocked(apiFetch)).toHaveBeenCalledWith('/api/history?search=widgets');
    });

    await waitFor(() => {
      expect(screen.queryByText('SELECT 1;')).not.toBeInTheDocument();
    });
    expect(screen.getByText('SELECT * FROM widgets;')).toBeInTheDocument();

    const searchCalls = vi.mocked(apiFetch).mock.calls.filter(([p]) => String(p).startsWith('/api/history?search='));
    expect(searchCalls).toHaveLength(1);
  });

  it('shows a clear "no results" state instead of a blank list when the search matches nothing', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      if (path === '/api/history') return historyResponse(['SELECT 1;']);
      return historyResponse([]);
    });

    renderPage();
    await screen.findByText('SELECT 1;');

    const input = screen.getByPlaceholderText('Search queries...');
    fireEvent.change(input, { target: { value: 'nonexistent-xyz' } });

    await screen.findByText('No query history matches "nonexistent-xyz".');
  });
});
