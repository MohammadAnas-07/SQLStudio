import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SourceControl } from '../SourceControl';
import { renamedFileGitStatus, modifiedFileGitStatus } from '@/test/fixtures/gitStatus';
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
