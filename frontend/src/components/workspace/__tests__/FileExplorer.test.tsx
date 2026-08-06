import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileExplorer } from '../FileExplorer';
import { renamedFileGitStatus, nestedRenamedFileGitStatus } from '@/test/fixtures/gitStatus';
import { useGitStatus } from '@/lib/hooks/useGit';
import { apiFetch } from '@/lib/api';

vi.mock('@/lib/hooks/useGit', () => ({
  useGitStatus: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

interface MockFileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: MockFileNode[];
}

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockFilesResponse(files: MockFileNode[]) {
  vi.mocked(apiFetch).mockResolvedValue(
    new Response(JSON.stringify({ success: true, files }))
  );
}

function mockGitStatus(status: unknown) {
  vi.mocked(useGitStatus).mockReturnValue(status as unknown as ReturnType<typeof useGitStatus>);
}

describe('FileExplorer - renamed files', () => {
  beforeEach(() => {
    mockGitStatus({ data: renamedFileGitStatus });
  });

  it('renders the renamed file at its new path with an R badge', async () => {
    mockFilesResponse([
      { name: 'newName.ts', path: 'newName.ts', isDir: false },
    ]);
    renderWithClient(<FileExplorer />);

    expect(await screen.findByText('newName.ts')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('does not render the old path as a separate, untouched-looking entry', async () => {
    mockFilesResponse([
      { name: 'newName.ts', path: 'newName.ts', isDir: false },
    ]);
    renderWithClient(<FileExplorer />);

    await screen.findByText('newName.ts');
    expect(screen.queryByText('oldName.ts')).not.toBeInTheDocument();
  });

  it('gives the renamed file a distinct color from Added/Modified/Deleted', async () => {
    mockFilesResponse([
      { name: 'newName.ts', path: 'newName.ts', isDir: false },
    ]);
    renderWithClient(<FileExplorer />);

    const name = await screen.findByText('newName.ts');
    expect(name.className).toContain('text-blue-400');
    const badge = screen.getByText('R');
    expect(badge.className).toContain('text-blue-400');
  });

  it('propagates a change-indicator to ancestor folders of a nested rename', async () => {
    mockGitStatus({ data: nestedRenamedFileGitStatus });
    mockFilesResponse([
      {
        name: 'src', path: 'src', isDir: true, children: [
          {
            name: 'utils', path: 'src/utils', isDir: true, children: [
              { name: 'newName.ts', path: 'src/utils/newName.ts', isDir: false },
            ],
          },
        ],
      },
    ]);
    renderWithClient(<FileExplorer />);

    await screen.findByText('src');
    // Root folder should show the "has changes" dot since a descendant renamed file exists.
    const srcRow = screen.getByText('src').closest('div');
    expect(srcRow?.querySelector('.bg-blue-500')).toBeTruthy();
  });
});
