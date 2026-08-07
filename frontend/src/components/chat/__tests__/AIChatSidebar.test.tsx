import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIChatSidebar } from '../AIChatSidebar';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

const mockToastError = vi.fn();
vi.mock('@/store/toastStore', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: mockToastError,
    info: vi.fn(),
  }),
}));

const noop = () => {};

// jsdom doesn't implement scrollIntoView, which AIChatSidebar calls in a
// mount/update effect to keep the latest message in view.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}

function renderSidebar() {
  return render(
    <AIChatSidebar onClose={noop} onExecuteQuery={noop} onInsertIntoEditor={noop} />
  );
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  mockToastError.mockReset();
});

describe('AIChatSidebar - history fetch on mount', () => {
  // Regression test for the fetchHistory/useEffect declaration-order fix:
  // fetchHistory is now declared above the effect that calls it (was
  // below), purely to satisfy the react-hooks linter's declaration-order
  // check. This pins down that the effect still only runs once, on
  // mount — not on every re-render — which is the actual behavior the
  // reorder needed to preserve.
  it('fetches history exactly once on mount, and does not re-fetch on a later re-render', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, history: [] }))
    );

    const { rerender } = renderSidebar();

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/api/ai/history');
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);

    // Trigger a re-render (new element instances, same mounted component)
    // the way user interaction normally would, and confirm the mount
    // effect doesn't fire again.
    fireEvent.change(screen.getByPlaceholderText(/ask ai/i), { target: { value: 'SELECT 1' } });
    rerender(<AIChatSidebar onClose={noop} onExecuteQuery={noop} onInsertIntoEditor={noop} />);

    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('AIChatSidebar - clear history', () => {
  it('clears the visible chat when the DELETE request succeeds', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/ai/history' && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ success: true }));
      }
      // Initial history fetch on mount.
      return new Response(JSON.stringify({
        success: true,
        history: [{ id: '1', role: 'user', content: 'hello' }],
      }));
    });

    renderSidebar();

    await screen.findByText('hello');

    fireEvent.click(screen.getByTitle('Clear Chat'));

    await waitFor(() => {
      expect(screen.queryByText('hello')).not.toBeInTheDocument();
    });
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it('leaves the chat intact and surfaces an error when the DELETE request fails', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === '/api/ai/history' && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ success: false, error: 'Database is locked' }));
      }
      return new Response(JSON.stringify({
        success: true,
        history: [{ id: '1', role: 'user', content: 'hello' }],
      }));
    });

    renderSidebar();

    await screen.findByText('hello');

    fireEvent.click(screen.getByTitle('Clear Chat'));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to clear history', 'Database is locked');
    });

    // The chat must remain visible - the UI should not silently pretend
    // the history was cleared when the server-side delete failed.
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
