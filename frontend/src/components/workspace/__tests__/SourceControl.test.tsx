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
} from '@/test/fixtures/gitStatus';
import { useGitStatus } from '@/lib/hooks/useGit';

const mockMutate = vi.fn();
const mockCommitMutate = vi.fn();

vi.mock('@/lib/hooks/useGit', () => ({
  useGitStatus: vi.fn(),
  useGitMutations: () => ({
    stage: { mutate: mockMutate },
    unstage: { mutate: mockMutate },
    commit: { mutate: mockCommitMutate, isPending: false },
  }),
}));

function mockGitStatus(status: unknown) {
  vi.mocked(useGitStatus).mockReturnValue(status as unknown as ReturnType<typeof useGitStatus>);
}

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
    mockMutate.mockClear();
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
