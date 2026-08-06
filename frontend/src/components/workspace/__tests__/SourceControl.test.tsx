import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceControl } from '../SourceControl';
import {
  renamedFileGitStatus,
  modifiedFileGitStatus,
  conflictedFileGitStatus,
  conflictedAndModifiedFileGitStatus,
  conflictAndRenameGitStatus,
} from '@/test/fixtures/gitStatus';
import { useGitStatus } from '@/lib/hooks/useGit';

const mockMutate = vi.fn();

vi.mock('@/lib/hooks/useGit', () => ({
  useGitStatus: vi.fn(),
  useGitMutations: () => ({
    stage: { mutate: mockMutate },
    unstage: { mutate: mockMutate },
    commit: { mutate: mockMutate, isPending: false },
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
