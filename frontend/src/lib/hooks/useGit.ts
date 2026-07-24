import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/store/toastStore';

export interface GitStatusResult {
  not_added: string[];
  conflicted: string[];
  created: string[];
  deleted: string[];
  modified: string[];
  renamed: Array<{from: string, to: string}>;
  files: { path: string, index: string, working_dir: string }[];
  staged: string[];
  ahead: number;
  behind: number;
  current: string;
  tracking: string | null;
  isClean: () => boolean;
}

export function useGitStatus() {
  return useQuery({
    queryKey: ['git-status'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3000/api/git/status');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.status as GitStatusResult;
    },
    refetchInterval: 3000,
  });
}

export function useGitBranch() {
  return useQuery({
    queryKey: ['git-branch'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3000/api/git/branch');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.branches;
    }
  });
}

export function useGitMutations() {
  const queryClient = useQueryClient();
  const { error, success } = useToast();

  const invalidateGit = () => {
    queryClient.invalidateQueries({ queryKey: ['git-status'] });
    queryClient.invalidateQueries({ queryKey: ['git-branch'] });
  };

  const stage = useMutation({
    mutationFn: async (files: string | string[]) => {
      const res = await fetch('http://localhost:3000/api/git/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: invalidateGit,
    onError: (err: any) => error('Git Stage Failed', err.message)
  });

  const unstage = useMutation({
    mutationFn: async (files: string | string[]) => {
      const res = await fetch('http://localhost:3000/api/git/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: invalidateGit,
    onError: (err: any) => error('Git Unstage Failed', err.message)
  });

  const commit = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch('http://localhost:3000/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      success('Commit Successful', 'Changes have been committed.');
      invalidateGit();
    },
    onError: (err: any) => error('Commit Failed', err.message)
  });

  const checkout = useMutation({
    mutationFn: async ({ branch, create }: { branch: string, create?: boolean }) => {
      const res = await fetch('http://localhost:3000/api/git/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, create })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      success('Branch Changed', 'Successfully switched branch.');
      invalidateGit();
    },
    onError: (err: any) => error('Checkout Failed', err.message)
  });

  return { stage, unstage, commit, checkout };
}
