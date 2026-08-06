import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceControl } from '../SourceControl';
import {
  renamedFileGitStatus,
  modifiedFileGitStatus,
  conflictedFileGitStatus,
  conflictedAndModifiedFileGitStatus,
  conflictAndRenameGitStatus,
  conflictWithOtherStagedFileGitStatus,
  stagedOnlyFileGitStatus,
  unstagedOnlyFileGitStatus,
  stagedThenModifiedFileGitStatus,
  deletedFileGitStatus,
  stagedDeletedFileGitStatus,
} from '@/test/fixtures/gitStatus';
import { useGitStatus, useGitMutations } from '@/lib/hooks/useGit';
import { usePlatform } from '@/lib/hooks/usePlatform';

const mockStageMutate = vi.fn();
const mockUnstageMutate = vi.fn();
const mockCommitMutate = vi.fn();

vi.mock('@/lib/hooks/useGit', () => ({
  useGitStatus: vi.fn(),
  useGitMutations: vi.fn(),
}));

vi.mock('@/lib/hooks/usePlatform', () => ({
  usePlatform: vi.fn(),
}));

function mockGitStatus(status: unknown) {
  vi.mocked(useGitStatus).mockReturnValue(status as unknown as ReturnType<typeof useGitStatus>);
}

function mockPlatform(platform: unknown) {
  vi.mocked(usePlatform).mockReturnValue(platform as unknown as ReturnType<typeof usePlatform>);
}

interface MutationState {
  isPending?: boolean;
  variables?: string | string[] | undefined;
}

// Defaults to nothing pending, so existing tests that don't care about
// loading state don't need to opt into this.
function mockGitMutations(overrides?: { stage?: MutationState; unstage?: MutationState }) {
  vi.mocked(useGitMutations).mockReturnValue({
    stage: { mutate: mockStageMutate, isPending: false, variables: undefined, ...overrides?.stage },
    unstage: { mutate: mockUnstageMutate, isPending: false, variables: undefined, ...overrides?.unstage },
    commit: { mutate: mockCommitMutate, isPending: false },
  } as unknown as ReturnType<typeof useGitMutations>);
}

// Default every test to a resolved, non-Windows platform so existing tests
// that don't care about the shortcut hint aren't left with usePlatform()
// returning undefined (which would throw destructuring `.data` below).
beforeEach(() => {
  mockPlatform({ data: { isWindows: false } });
  mockGitMutations();
});

describe('SourceControl - renamed files', () => {
  beforeEach(() => {
    mockGitStatus({ data: renamedFileGitStatus, isLoading: false });
  });

  it('lists the renamed file under Staged Changes (simple-git omits it from `staged`)', () => {
    render(<SourceControl />);
    expect(screen.getByText('Staged Changes')).toBeInTheDocument();
    expect(screen.getByTitle('oldName.ts → newName.ts')).toBeInTheDocument();
  });

  it('displays "oldname → newname" for the renamed file, VS Code style', () => {
    render(<SourceControl />);
    const row = screen.getByTitle('oldName.ts → newName.ts');
    expect(row.textContent).toContain('oldName.ts');
    expect(row.textContent).toContain('newName.ts');
  });

  it('shows an R badge, colored distinctly from Added/Modified/Deleted', () => {
    render(<SourceControl />);
    const row = screen.getByTitle('oldName.ts → newName.ts');
    const badge = within(row).getByText('R');
    expect(badge.className).toContain('text-blue-400');
    expect(badge.className).not.toContain('text-green-500'); // Added
    expect(badge.className).not.toContain('text-yellow-500'); // Modified
    expect(badge.className).not.toContain('text-red-500'); // Deleted
  });

  it('does not duplicate the renamed file into the unstaged Changes section', () => {
    render(<SourceControl />);
    expect(screen.queryByText('Changes')).not.toBeInTheDocument();
  });
});

describe('SourceControl - non-renamed control', () => {
  it('does not show an R badge for a plain modification', () => {
    mockGitStatus({ data: modifiedFileGitStatus, isLoading: false });
    render(<SourceControl />);
    expect(screen.queryByText('R')).not.toBeInTheDocument();
    expect(screen.getByText('M')).toBeInTheDocument();
  });
});

describe('SourceControl - merge conflicts', () => {
  it('renders a dedicated Merge Conflicts section with a C badge', () => {
    mockGitStatus({ data: conflictedFileGitStatus, isLoading: false });
    render(<SourceControl />);
    expect(screen.getByText('Merge Conflicts')).toBeInTheDocument();
    expect(screen.getByText('conflict.ts')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('gives the conflict badge a high-visibility, filled style distinct from every other status', () => {
    mockGitStatus({ data: conflictedFileGitStatus, isLoading: false });
    render(<SourceControl />);
    const badge = screen.getByText('C');
    // Filled pill (bg + white text), not just a colored letter like the other badges.
    expect(badge.className).toContain('bg-red-600');
    expect(badge.className).toContain('text-white');
  });

  it('shows a warning banner telling the user to resolve conflicts before committing', () => {
    mockGitStatus({ data: conflictedFileGitStatus, isLoading: false });
    render(<SourceControl />);
    expect(screen.getByText(/unresolved merge conflict/i)).toBeInTheDocument();
    expect(screen.getByText(/resolve it before committing/i)).toBeInTheDocument();
  });

  it('does not show the warning banner when there are no conflicts', () => {
    mockGitStatus({ data: modifiedFileGitStatus, isLoading: false });
    render(<SourceControl />);
    expect(screen.queryByText(/unresolved merge conflict/i)).not.toBeInTheDocument();
  });

  it('shows conflict, not Modified, for a file that is both conflicted and modified', () => {
    mockGitStatus({ data: conflictedAndModifiedFileGitStatus, isLoading: false });
    render(<SourceControl />);

    // Conflict section owns the file...
    const conflictSection = screen.getByText('Merge Conflicts').closest('div')?.parentElement;
    expect(conflictSection).not.toBeNull();
    expect(within(conflictSection as HTMLElement).getByText('bothStates.ts')).toBeInTheDocument();

    // ...and there is exactly one badge for it: 'C', never 'M'.
    expect(screen.getByText('C')).toBeInTheDocument();
    expect(screen.queryByText('M')).not.toBeInTheDocument();

    // It must not also appear under the plain "Changes" section.
    expect(screen.queryByText('Changes')).not.toBeInTheDocument();
  });

  it('keeps an unrelated renamed file in Staged Changes alongside a separate conflict', () => {
    mockGitStatus({ data: conflictAndRenameGitStatus, isLoading: false });
    render(<SourceControl />);

    expect(screen.getByText('Merge Conflicts')).toBeInTheDocument();
    expect(screen.getByText('conflict.ts')).toBeInTheDocument();

    expect(screen.getByText('Staged Changes')).toBeInTheDocument();
    expect(screen.getByTitle('oldName.ts → newName.ts')).toBeInTheDocument();
  });
});

describe('SourceControl - commit confirmation when conflicts are present', () => {
  beforeEach(() => {
    mockStageMutate.mockClear();
    mockUnstageMutate.mockClear();
    mockCommitMutate.mockClear();
  });

  function typeCommitMessageAndClickCommit(message = 'my commit message') {
    fireEvent.change(screen.getByPlaceholderText(/message/i), { target: { value: message } });
    fireEvent.click(screen.getByRole('button', { name: /^commit$/i }));
  }

  it('warns instead of committing immediately when a conflict is present', () => {
    mockGitStatus({ data: conflictWithOtherStagedFileGitStatus, isLoading: false });
    render(<SourceControl />);

    typeCommitMessageAndClickCommit();

    expect(screen.getByText('Unresolved merge conflicts')).toBeInTheDocument();
    const dialogMessage = screen.getByText(/still has unresolved merge conflicts/i);
    expect(dialogMessage.textContent).toContain('conflict.ts');
    expect(mockCommitMutate).not.toHaveBeenCalled();
  });

  it('proceeds with the commit only after the user confirms', () => {
    mockGitStatus({ data: conflictWithOtherStagedFileGitStatus, isLoading: false });
    render(<SourceControl />);

    typeCommitMessageAndClickCommit('my commit message');
    expect(mockCommitMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /commit anyway/i }));

    expect(mockCommitMutate).toHaveBeenCalledTimes(1);
    expect(mockCommitMutate).toHaveBeenCalledWith('my commit message', expect.anything());
  });

  it('does not commit if the user cancels the warning', () => {
    mockGitStatus({ data: conflictWithOtherStagedFileGitStatus, isLoading: false });
    render(<SourceControl />);

    typeCommitMessageAndClickCommit();
    expect(screen.getByText('Unresolved merge conflicts')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(mockCommitMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Unresolved merge conflicts')).not.toBeInTheDocument();
  });

  it('does not block the commit outright — the button stays enabled with conflicts present', () => {
    mockGitStatus({ data: conflictWithOtherStagedFileGitStatus, isLoading: false });
    render(<SourceControl />);

    fireEvent.change(screen.getByPlaceholderText(/message/i), { target: { value: 'my commit message' } });
    expect(screen.getByRole('button', { name: /^commit$/i })).not.toBeDisabled();
  });

  it('commits directly, with no confirmation dialog, when there are no conflicts', () => {
    mockGitStatus({ data: renamedFileGitStatus, isLoading: false });
    render(<SourceControl />);

    typeCommitMessageAndClickCommit();

    expect(screen.queryByText('Unresolved merge conflicts')).not.toBeInTheDocument();
    expect(mockCommitMutate).toHaveBeenCalledTimes(1);
  });
});

describe('SourceControl - section-aware status (index vs working_dir)', () => {
  it('shows A in Staged Changes for a file staged as Added with nothing further pending', () => {
    mockGitStatus({ data: stagedOnlyFileGitStatus, isLoading: false });
    render(<SourceControl />);

    const stagedSection = screen.getByText('Staged Changes').closest('div')?.parentElement as HTMLElement;
    expect(within(stagedSection).getByText('staged.ts')).toBeInTheDocument();
    expect(within(stagedSection).getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('Changes')).not.toBeInTheDocument();
  });

  it('shows M in Changes for a file modified in the working tree and never staged', () => {
    mockGitStatus({ data: unstagedOnlyFileGitStatus, isLoading: false });
    render(<SourceControl />);

    const changesSection = screen.getByText('Changes').closest('div')?.parentElement as HTMLElement;
    expect(within(changesSection).getByText('unstaged.ts')).toBeInTheDocument();
    expect(within(changesSection).getByText('M')).toBeInTheDocument();
    expect(screen.queryByText('Staged Changes')).not.toBeInTheDocument();
  });

  it('shows A in Staged Changes and M in Changes for the same file staged then further edited', () => {
    mockGitStatus({ data: stagedThenModifiedFileGitStatus, isLoading: false });
    render(<SourceControl />);

    const stagedSection = screen.getByText('Staged Changes').closest('div')?.parentElement as HTMLElement;
    const changesSection = screen.getByText('Changes').closest('div')?.parentElement as HTMLElement;

    // Same path, present in both sections...
    expect(within(stagedSection).getByText('combo.ts')).toBeInTheDocument();
    expect(within(changesSection).getByText('combo.ts')).toBeInTheDocument();

    // ...but with different badges: index ('A') in Staged, working_dir ('M') in Changes.
    const stagedBadge = within(stagedSection).getByText('A');
    expect(stagedBadge.className).toContain('text-green-500');

    const changesBadge = within(changesSection).getByText('M');
    expect(changesBadge.className).toContain('text-yellow-500');

    // Never the wrong badge in the wrong section.
    expect(within(stagedSection).queryByText('M')).not.toBeInTheDocument();
    expect(within(changesSection).queryByText('A')).not.toBeInTheDocument();
  });
});

describe('SourceControl - clicking a deleted file', () => {
  const onFileSelect = vi.fn();
  const onDeletedFileSelect = vi.fn();

  beforeEach(() => {
    onFileSelect.mockClear();
    onDeletedFileSelect.mockClear();
  });

  it('routes an unstaged deleted file to onDeletedFileSelect, never onFileSelect', () => {
    mockGitStatus({ data: deletedFileGitStatus, isLoading: false });
    render(<SourceControl onFileSelect={onFileSelect} onDeletedFileSelect={onDeletedFileSelect} />);

    fireEvent.click(screen.getByText('gone.sql'));

    expect(onDeletedFileSelect).toHaveBeenCalledWith('gone.sql');
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('routes a staged deletion to onDeletedFileSelect too', () => {
    mockGitStatus({ data: stagedDeletedFileGitStatus, isLoading: false });
    render(<SourceControl onFileSelect={onFileSelect} onDeletedFileSelect={onDeletedFileSelect} />);

    fireEvent.click(screen.getByText('gone-staged.sql'));

    expect(onDeletedFileSelect).toHaveBeenCalledWith('gone-staged.sql');
    expect(onFileSelect).not.toHaveBeenCalled();
  });

  it('still routes a non-deleted file to onFileSelect exactly as before', () => {
    mockGitStatus({ data: modifiedFileGitStatus, isLoading: false });
    render(<SourceControl onFileSelect={onFileSelect} onDeletedFileSelect={onDeletedFileSelect} />);

    fireEvent.click(screen.getByText('other.ts'));

    expect(onFileSelect).toHaveBeenCalledWith('other.ts');
    expect(onDeletedFileSelect).not.toHaveBeenCalled();
  });

  it('does not fall back to onFileSelect for a deleted file when onDeletedFileSelect is not wired up', () => {
    mockGitStatus({ data: deletedFileGitStatus, isLoading: false });
    render(<SourceControl onFileSelect={onFileSelect} />);

    expect(() => fireEvent.click(screen.getByText('gone.sql'))).not.toThrow();
    expect(onFileSelect).not.toHaveBeenCalled();
  });
});

describe('SourceControl - commit shortcut hint reflects the server platform', () => {
  beforeEach(() => {
    mockStageMutate.mockClear();
    mockUnstageMutate.mockClear();
    mockCommitMutate.mockClear();
    // Something staged, so the Ctrl/Cmd+Enter keybinding test below is
    // actually able to trigger a commit.
    mockGitStatus({ data: stagedOnlyFileGitStatus, isLoading: false });
  });

  it('shows Cmd+Enter when the server platform is not Windows', () => {
    mockPlatform({ data: { isWindows: false } });
    render(<SourceControl />);

    expect(screen.getByPlaceholderText('Message (Cmd+Enter to commit)')).toBeInTheDocument();
  });

  it('shows Ctrl+Enter when the server platform is Windows', () => {
    mockPlatform({ data: { isWindows: true } });
    render(<SourceControl />);

    expect(screen.getByPlaceholderText('Message (Ctrl+Enter to commit)')).toBeInTheDocument();
  });

  it('falls back to Cmd+Enter while the platform check is still loading, without crashing', () => {
    mockPlatform({ data: undefined, isLoading: true });
    render(<SourceControl />);

    expect(screen.getByPlaceholderText('Message (Cmd+Enter to commit)')).toBeInTheDocument();
  });

  it('accepts both Ctrl+Enter and Cmd+Enter to commit regardless of the displayed hint', () => {
    mockPlatform({ data: { isWindows: true } });
    render(<SourceControl />);

    const textarea = screen.getByPlaceholderText('Message (Ctrl+Enter to commit)');
    fireEvent.change(textarea, { target: { value: 'msg' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(mockCommitMutate).toHaveBeenCalledTimes(1);
  });
});

describe('SourceControl - untracked vs added contrast', () => {
  it('gives Untracked a different hue from Added, not just a lighter shade of the same green', () => {
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
      isLoading: false,
    });
    render(<SourceControl />);

    const untracked = screen.getByText('untracked.sql');
    const added = screen.getByText('added.sql');

    expect(untracked.className).toContain('text-cyan-400');
    expect(added.className).toContain('text-green-500');
    expect(untracked.className).not.toContain('green');
  });
});

describe('SourceControl - per-button stage/unstage loading state', () => {
  const twoStagedTwoUnstagedGitStatus = {
    not_added: [],
    conflicted: [],
    created: ['staged-a.sql', 'staged-b.sql'],
    deleted: [],
    modified: ['unstaged-a.sql', 'unstaged-b.sql'],
    renamed: [],
    files: [
      { path: 'staged-a.sql', index: 'A', working_dir: ' ' },
      { path: 'staged-b.sql', index: 'A', working_dir: ' ' },
      { path: 'unstaged-a.sql', index: ' ', working_dir: 'M' },
      { path: 'unstaged-b.sql', index: ' ', working_dir: 'M' },
    ],
    staged: ['staged-a.sql', 'staged-b.sql'],
    ahead: 0,
    behind: 0,
    current: 'main',
    tracking: null,
    isClean: () => false,
  };

  function rowFor(fileName: string): HTMLElement {
    return screen.getByText(fileName).closest('div')?.parentElement as HTMLElement;
  }

  beforeEach(() => {
    mockGitStatus({ data: twoStagedTwoUnstagedGitStatus, isLoading: false });
  });

  it('disables and spins only the Stage button that was clicked, not sibling rows', () => {
    mockGitMutations({ stage: { isPending: true, variables: 'unstaged-a.sql' } });
    render(<SourceControl />);

    const pendingButton = within(rowFor('unstaged-a.sql')).getByTitle('Stage Changes');
    expect(pendingButton).toBeDisabled();
    expect(pendingButton.querySelector('.animate-spin')).toBeTruthy();

    const otherButton = within(rowFor('unstaged-b.sql')).getByTitle('Stage Changes');
    expect(otherButton).not.toBeDisabled();
    expect(otherButton.querySelector('.animate-spin')).toBeFalsy();
  });

  it('disables and spins only the Unstage button that was clicked, not sibling rows', () => {
    mockGitMutations({ unstage: { isPending: true, variables: 'staged-a.sql' } });
    render(<SourceControl />);

    const pendingButton = within(rowFor('staged-a.sql')).getByTitle('Unstage Changes');
    expect(pendingButton).toBeDisabled();
    expect(pendingButton.querySelector('.animate-spin')).toBeTruthy();

    const otherButton = within(rowFor('staged-b.sql')).getByTitle('Unstage Changes');
    expect(otherButton).not.toBeDisabled();
    expect(otherButton.querySelector('.animate-spin')).toBeFalsy();
  });

  it('does not disable the Stage button for an unrelated file while Unstage is pending elsewhere', () => {
    mockGitMutations({ unstage: { isPending: true, variables: 'staged-a.sql' } });
    render(<SourceControl />);

    const unrelatedStageButton = within(rowFor('unstaged-a.sql')).getByTitle('Stage Changes');
    expect(unrelatedStageButton).not.toBeDisabled();
  });

  it('marks every affected row pending for a bulk "Stage All" / "Unstage All" action', () => {
    mockGitMutations({ stage: { isPending: true, variables: ['unstaged-a.sql', 'unstaged-b.sql'] } });
    render(<SourceControl />);

    expect(within(rowFor('unstaged-a.sql')).getByTitle('Stage Changes')).toBeDisabled();
    expect(within(rowFor('unstaged-b.sql')).getByTitle('Stage Changes')).toBeDisabled();
  });

  it('shows no spinner and enabled buttons by default, with nothing pending', () => {
    render(<SourceControl />);

    expect(within(rowFor('unstaged-a.sql')).getByTitle('Stage Changes')).not.toBeDisabled();
    expect(within(rowFor('staged-a.sql')).getByTitle('Unstage Changes')).not.toBeDisabled();
  });
});
