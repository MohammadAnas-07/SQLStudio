import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SQLWorkspace from '../SQLWorkspace';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

// Monaco doesn't run in jsdom (needs real browser canvas/worker APIs) and
// isn't what this test is about — stubbed to plain placeholders.
vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => <div data-testid="monaco-editor-stub" />,
  DiffEditor: () => <div data-testid="monaco-diff-editor-stub" />,
}));

vi.mock('@/components/workspace/FileExplorer', () => ({
  FileExplorer: () => <div data-testid="file-explorer-stub" />,
}));

vi.mock('@/components/workspace/SourceControl', () => ({
  SourceControl: () => <div data-testid="source-control-stub" />,
}));

vi.mock('@/components/workspace/TerminalPanel', () => ({
  TerminalPanel: () => <div data-testid="terminal-panel-stub" />,
}));

// Stubbed down to just its onExecuteQuery callback — that callback is the
// actual integration boundary under test: does SQLWorkspace show a
// confirmation instead of executing immediately when it fires. The real
// AIChatSidebar's own chat UI/network behavior isn't part of this fix.
let mockAiSql = "DELETE FROM users;";
vi.mock('@/components/chat/AIChatSidebar', () => ({
  AIChatSidebar: ({ onExecuteQuery }: { onExecuteQuery: (sql: string) => void }) => (
    <button onClick={() => onExecuteQuery(mockAiSql)}>Mock AI Execute</button>
  ),
}));

function mockApiFetch() {
  vi.mocked(apiFetch).mockImplementation(async (path: string) => {
    if (path === '/api/schema') {
      return new Response(JSON.stringify({ schema: [] }));
    }
    if (path === '/api/query/execute') {
      return new Response(JSON.stringify({
        success: true,
        data: { columns: [], rows: [], rowCount: 0, executionTimeMs: 1, affectedRows: 0 },
      }));
    }
    return new Response(JSON.stringify({ success: true }));
  });
}

function renderWorkspace() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SQLWorkspace />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function openAiChatAndTriggerExecute() {
  fireEvent.click(screen.getByRole('button', { name: /AI Chat/i }));
  const executeButton = await screen.findByRole('button', { name: /Mock AI Execute/i });
  fireEvent.click(executeButton);
}

describe('SQLWorkspace - AI-generated SQL requires confirmation before executing', () => {
  beforeEach(() => {
    mockApiFetch();
    mockAiSql = "DELETE FROM users;";
  });

  it('shows a confirmation dialog with the SQL text instead of executing immediately', async () => {
    renderWorkspace();
    await openAiChatAndTriggerExecute();

    expect(screen.getByText('Run AI-generated SQL?')).toBeInTheDocument();
    expect(screen.getByText(mockAiSql)).toBeInTheDocument();

    // Must not have executed yet — only /api/schema should have been hit so far.
    const calledPaths = vi.mocked(apiFetch).mock.calls.map(call => call[0]);
    expect(calledPaths).not.toContain('/api/query/execute');
  });

  it('does not execute anything if the confirmation is canceled', async () => {
    renderWorkspace();
    await openAiChatAndTriggerExecute();

    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Run AI-generated SQL?')).not.toBeInTheDocument();
    });
    const calledPaths = vi.mocked(apiFetch).mock.calls.map(call => call[0]);
    expect(calledPaths).not.toContain('/api/query/execute');
  });

  it('executes the query only after the user confirms', async () => {
    renderWorkspace();
    await openAiChatAndTriggerExecute();

    fireEvent.click(screen.getByRole('button', { name: /^Run Query$/i }));

    await waitFor(() => {
      const calledPaths = vi.mocked(apiFetch).mock.calls.map(call => call[0]);
      expect(calledPaths).toContain('/api/query/execute');
    });
  });

  it('warns specifically about a DELETE with no WHERE clause', async () => {
    mockAiSql = "DELETE FROM users;";
    renderWorkspace();
    await openAiChatAndTriggerExecute();

    expect(screen.getByText(/no WHERE clause/i)).toBeInTheDocument();
  });

  it('does not show the no-WHERE warning for a properly scoped statement', async () => {
    mockAiSql = "DELETE FROM users WHERE id = 42;";
    renderWorkspace();
    await openAiChatAndTriggerExecute();

    expect(screen.getByText('Run AI-generated SQL?')).toBeInTheDocument();
    expect(screen.queryByText(/no WHERE clause/i)).not.toBeInTheDocument();
  });
});
