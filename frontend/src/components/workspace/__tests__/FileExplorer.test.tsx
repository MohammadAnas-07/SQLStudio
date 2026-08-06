import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileExplorer } from '../FileExplorer';
import {
  renamedFileGitStatus,
  nestedRenamedFileGitStatus,
  conflictedFileGitStatus,
  conflictedAndModifiedFileGitStatus,
} from '@/test/fixtures/gitStatus';
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

describe('FileExplorer - merge conflicts', () => {
  it('renders a conflicted file with a high-visibility C badge', async () => {
    mockGitStatus({ data: conflictedFileGitStatus });
    mockFilesResponse([
      { name: 'conflict.ts', path: 'conflict.ts', isDir: false },
    ]);
    renderWithClient(<FileExplorer />);

    await screen.findByText('conflict.ts');
    const badge = screen.getByText('C');
    // Filled pill (bg + white text), distinct from the plain colored-letter
    // badges used for every other status.
    expect(badge.className).toContain('bg-red-600');
    expect(badge.className).toContain('text-white');
  });

  it('colors the conflicted filename distinctly from every other status', async () => {
    mockGitStatus({ data: conflictedFileGitStatus });
    mockFilesResponse([
      { name: 'conflict.ts', path: 'conflict.ts', isDir: false },
    ]);
    renderWithClient(<FileExplorer />);

    const name = await screen.findByText('conflict.ts');
    expect(name.className).toContain('text-orange-500');
    expect(name.className).not.toContain('text-green-500'); // Added
    expect(name.className).not.toContain('text-yellow-500'); // Modified
    expect(name.className).not.toContain('text-red-500'); // Deleted
    expect(name.className).not.toContain('text-blue-400'); // Renamed
  });

  it('shows conflict, not Modified, for a file that is both conflicted and modified', async () => {
    mockGitStatus({ data: conflictedAndModifiedFileGitStatus });
    mockFilesResponse([
      { name: 'bothStates.ts', path: 'bothStates.ts', isDir: false },
    ]);
    renderWithClient(<FileExplorer />);

    await screen.findByText('bothStates.ts');
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('M')).not.toBeInTheDocument();
  });

  it('gives an ancestor folder a distinct red warning dot when it contains a conflict', async () => {
    mockGitStatus({
      data: {
        ...conflictedFileGitStatus,
        conflicted: ['src/conflict.ts'],
        files: [{ path: 'src/conflict.ts', index: 'U', working_dir: 'U' }],
      },
    });
    mockFilesResponse([
      {
        name: 'src', path: 'src', isDir: true, children: [
          { name: 'conflict.ts', path: 'src/conflict.ts', isDir: false },
        ],
      },
    ]);
    renderWithClient(<FileExplorer />);

    await screen.findByText('src');
    const srcRow = screen.getByText('src').closest('div');
    expect(srcRow?.querySelector('.bg-red-600')).toBeTruthy();
    expect(srcRow?.querySelector('.bg-blue-500')).toBeFalsy();
  });
});
