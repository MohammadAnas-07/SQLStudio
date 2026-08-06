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
  singleLineNewFolderGitStatus,
  folderWithModifiedChildrenGitStatus,
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

describe('FileExplorer - folder-level indicator consistency', () => {
  it('shows the "has changes" dot for a whole new folder git collapsed into one line', async () => {
    mockGitStatus({ data: singleLineNewFolderGitStatus });
    mockFilesResponse([
      { name: 'new-folder', path: 'new-folder', isDir: true, children: [] },
    ]);
    renderWithClient(<FileExplorer />);

    const folderName = await screen.findByText('new-folder');
    // The folder name itself is already colored, per existing behavior —
    // this test is about the dot, which is the part that was missing.
    expect(folderName.className).toContain('text-cyan-400');
    const folderRow = folderName.closest('div');
    expect(folderRow?.querySelector('.bg-blue-500')).toBeTruthy();
  });

  it('shows the same dot for a folder git reported via individually-modified children', async () => {
    mockGitStatus({ data: folderWithModifiedChildrenGitStatus });
    mockFilesResponse([
      {
        name: 'existing-folder', path: 'existing-folder', isDir: true, children: [
          { name: 'a.sql', path: 'existing-folder/a.sql', isDir: false },
          { name: 'b.sql', path: 'existing-folder/b.sql', isDir: false },
        ],
      },
    ]);
    renderWithClient(<FileExplorer />);

    const folderName = await screen.findByText('existing-folder');
    const folderRow = folderName.closest('div');
    expect(folderRow?.querySelector('.bg-blue-500')).toBeTruthy();
  });

  it('gives both structurally different cases the same visible indicator, not just one of them', async () => {
    // Single-line collapsed folder
    mockGitStatus({ data: singleLineNewFolderGitStatus });
    mockFilesResponse([
      { name: 'new-folder', path: 'new-folder', isDir: true, children: [] },
    ]);
    const collapsedRender = renderWithClient(<FileExplorer />);
    const collapsedFolderRow = (await collapsedRender.findByText('new-folder')).closest('div');
    const collapsedHasDot = !!collapsedFolderRow?.querySelector('.bg-blue-500');
    collapsedRender.unmount();

    // Folder with individually-listed modified children
    mockGitStatus({ data: folderWithModifiedChildrenGitStatus });
    mockFilesResponse([
      {
        name: 'existing-folder', path: 'existing-folder', isDir: true, children: [
          { name: 'a.sql', path: 'existing-folder/a.sql', isDir: false },
          { name: 'b.sql', path: 'existing-folder/b.sql', isDir: false },
        ],
      },
    ]);
    const perFileRender = renderWithClient(<FileExplorer />);
    const perFileFolderRow = (await perFileRender.findByText('existing-folder')).closest('div');
    const perFileHasDot = !!perFileFolderRow?.querySelector('.bg-blue-500');

    expect(collapsedHasDot).toBe(true);
    expect(perFileHasDot).toBe(true);
    expect(collapsedHasDot).toBe(perFileHasDot);
  });
});

describe('FileExplorer - untracked vs added contrast', () => {
  it('gives Untracked a different hue from Added, not just a lighter shade of the same green', async () => {
    mockGitStatus({
      data: {
        not_added: ['untracked.sql'],
        conflicted: [],
        created: ['added.sql'],
        deleted: [],
        modified: [],
        renamed: [],
        files: [
          { path: 'untracked.sql', index: '?', working_dir: '?' },
          { path: 'added.sql', index: 'A', working_dir: ' ' },
        ],
        staged: ['added.sql'],
        ahead: 0,
        behind: 0,
        current: 'main',
        tracking: null,
        isClean: () => false,
      },
    });
    mockFilesResponse([
      { name: 'untracked.sql', path: 'untracked.sql', isDir: false },
      { name: 'added.sql', path: 'added.sql', isDir: false },
    ]);
    renderWithClient(<FileExplorer />);

    const untracked = await screen.findByText('untracked.sql');
    const added = await screen.findByText('added.sql');

    expect(untracked.className).toContain('text-cyan-400');
    expect(added.className).toContain('text-green-500');
    expect(untracked.className).not.toContain('green');
  });
});

describe('FileExplorer - folder change count badge', () => {
  it('shows a count of 1 for a whole new folder git collapsed into one line', async () => {
    mockGitStatus({ data: singleLineNewFolderGitStatus });
    mockFilesResponse([
      { name: 'new-folder', path: 'new-folder', isDir: true, children: [] },
    ]);
    renderWithClient(<FileExplorer />);

    const folderName = await screen.findByText('new-folder');
    const folderRow = folderName.closest('div');
    expect(folderRow).toHaveTextContent('1');
  });

  it('shows a count of 2 for a folder with two individually-modified children', async () => {
    mockGitStatus({ data: folderWithModifiedChildrenGitStatus });
    mockFilesResponse([
      {
        name: 'existing-folder', path: 'existing-folder', isDir: true, children: [
          { name: 'a.sql', path: 'existing-folder/a.sql', isDir: false },
          { name: 'b.sql', path: 'existing-folder/b.sql', isDir: false },
        ],
      },
    ]);
    renderWithClient(<FileExplorer />);

    const folderName = await screen.findByText('existing-folder');
    const folderRow = folderName.closest('div');
    expect(folderRow).toHaveTextContent('2');
  });

  it('aggregates the count up through every ancestor folder, not just the immediate parent', async () => {
    mockGitStatus({
      data: {
        not_added: [],
        conflicted: [],
        created: [],
        deleted: [],
        modified: ['src/utils/a.sql', 'src/utils/b.sql'],
        renamed: [],
        files: [
          { path: 'src/utils/a.sql', index: ' ', working_dir: 'M' },
          { path: 'src/utils/b.sql', index: ' ', working_dir: 'M' },
        ],
        staged: [],
        ahead: 0,
        behind: 0,
        current: 'main',
        tracking: null,
        isClean: () => false,
      },
    });
    mockFilesResponse([
      {
        name: 'src', path: 'src', isDir: true, children: [
          {
            name: 'utils', path: 'src/utils', isDir: true, children: [
              { name: 'a.sql', path: 'src/utils/a.sql', isDir: false },
              { name: 'b.sql', path: 'src/utils/b.sql', isDir: false },
            ],
          },
        ],
      },
    ]);
    renderWithClient(<FileExplorer />);

    const srcRow = (await screen.findByText('src')).closest('div');
    expect(srcRow).toHaveTextContent('2');
  });
});
