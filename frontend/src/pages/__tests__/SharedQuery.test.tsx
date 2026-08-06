import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SharedQuery from '../SharedQuery';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

function renderAt(token: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/share/${token}`]}>
        <Routes>
          <Route path="/share/:token" element={<SharedQuery />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
});

describe('SharedQuery (public page)', () => {
  it('fetches with no auth-gating concerns and renders the name and SQL, with no run/execute affordance', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string) => {
      expect(path).toBe('/api/public/shared-queries/abc123');
      return new Response(JSON.stringify({ success: true, name: 'Top Customers', query: 'SELECT * FROM customers;' }));
    });

    renderAt('abc123');

    await screen.findByText('Top Customers');
    // The syntax highlighter splits the SQL across multiple <span> tokens,
    // so assert on the containing element's combined text instead of a
    // single text node.
    const codeBlock = document.querySelector('code.language-sql');
    expect(codeBlock?.textContent).toBe('SELECT * FROM customers;');

    // This is a public, unauthenticated, read-only view — there must be no
    // way to execute the SQL from here.
    expect(screen.queryByRole('button', { name: /run/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /execute/i })).not.toBeInTheDocument();
  });

  it('shows a clean "not found" state for an invalid or disabled token, without implying which', async () => {
    vi.mocked(apiFetch).mockImplementation(async () => {
      return new Response(JSON.stringify({ success: false, error: 'Shared query not found' }), { status: 404 });
    });

    renderAt('does-not-exist');

    await screen.findByText('Link not found');
    expect(screen.getByText(/invalid, or the owner has turned off sharing/i)).toBeInTheDocument();
  });
});
