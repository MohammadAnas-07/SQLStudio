import { Search, Save, Play, Folder, MoreVertical, Share2, Trash, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useToast } from '@/store/toastStore';
import { apiFetch } from '@/lib/api';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';

// The special "All" / "Uncategorized" filter values below are UI-only —
// they never get sent to the backend as real folder ids except for the
// literal string 'uncategorized', which the API treats as "folderId is
// null" (see GET /api/saved-queries in queries.routes.ts).
const ALL_FILTER = 'all';
const UNCATEGORIZED_FILTER = 'uncategorized';

export default function SavedQueries() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const [queryToDelete, setQueryToDelete] = useState<any | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<any | null>(null);
  // An id, not the item itself — the item is looked up live from `saved`
  // each render, so the modal reflects the real current shareToken (e.g.
  // after a rotate) instead of a stale snapshot from when it was opened.
  const [shareQueryId, setShareQueryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [folderFilter, setFolderFilter] = useState(ALL_FILTER);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const { data: foldersData } = useQuery({
    queryKey: ['folders'],
    queryFn: async () => {
      const res = await apiFetch('/api/folders');
      const json = await res.json();
      return json.success ? json.folders : [];
    }
  });
  const folders = foldersData || [];

  const { data, isLoading } = useQuery({
    queryKey: ['savedQueries', debouncedSearch, folderFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (folderFilter !== ALL_FILTER) params.set('folderId', folderFilter);
      const qs = params.toString();
      const res = await apiFetch(`/api/saved-queries${qs ? `?${qs}` : ''}`);
      const json = await res.json();
      return json.success ? json.savedQueries : [];
    }
  });
  const saved = data || [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/saved-queries/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedQueries'] });
      success('Query deleted', 'The saved query was deleted successfully.');
    },
    onError: (err: any) => {
      error('Failed to delete query', err.message);
    }
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiFetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.folder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      success('Folder created');
      setNewFolderName('');
      setIsNewFolderOpen(false);
    },
    onError: (err: any) => {
      error('Failed to create folder', err.message);
    }
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/folders/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      // Query cards' folderId changed server-side (moved to Uncategorized),
      // so the list needs refetching regardless of the current filter.
      queryClient.invalidateQueries({ queryKey: ['savedQueries'] });
      if (folderFilter === id) setFolderFilter(ALL_FILTER);
      success('Folder deleted', 'Its queries were moved to Uncategorized, not deleted.');
    },
    onError: (err: any) => {
      error('Failed to delete folder', err.message);
    }
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, folderId }: { id: string; folderId: string | null }) => {
      const res = await apiFetch(`/api/saved-queries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json.savedQuery;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedQueries'] });
    },
    onError: (err: any) => {
      error('Failed to move query', err.message);
    }
  });

  const shareUrl = (token: string) => `${window.location.origin}/share/${token}`;
  const queryToShare = shareQueryId ? saved.find((q: any) => q.id === shareQueryId) : null;

  const toggleShareMutation = useMutation({
    mutationFn: async ({ id, enable }: { id: string; enable: boolean }) => {
      const res = await apiFetch(`/api/saved-queries/${id}/share`, { method: enable ? 'POST' : 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      return json as { shareToken?: string };
    },
    onSuccess: async (data, { enable }) => {
      queryClient.invalidateQueries({ queryKey: ['savedQueries'] });
      if (enable && data.shareToken) {
        const url = shareUrl(data.shareToken);
        try {
          await navigator.clipboard.writeText(url);
          success('Share link copied', url);
        } catch {
          // Clipboard access can be denied (permissions, non-secure
          // context) — the link is still visible/selectable in the modal,
          // so this isn't fatal, just less convenient.
          success('Sharing enabled', url);
        }
      } else {
        success('Sharing disabled', 'The previous link no longer works.');
      }
    },
    onError: (err: any) => {
      error('Failed to update sharing', err.message);
    }
  });

  const folderName = (folderId: string | null) =>
    folderId ? folders.find((f: any) => f.id === folderId)?.name ?? 'Uncategorized' : 'Uncategorized';

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Saved Queries</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and organize your frequently used queries.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search saved queries..."
              className="w-full bg-canvas-soft border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary-deep h-10" onClick={() => setIsNewFolderOpen(true)}>
            <Save size={16} className="mr-2" />
            New Folder
          </Button>
        </div>
      </div>

      {/* Folder-based filtering: "All" and "Uncategorized" are always
          present; real folders come from GET /api/folders. */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <button
          onClick={() => setFolderFilter(ALL_FILTER)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            folderFilter === ALL_FILTER
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-canvas-soft text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFolderFilter(UNCATEGORIZED_FILTER)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            folderFilter === UNCATEGORIZED_FILTER
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-canvas-soft text-muted-foreground border-border hover:text-foreground'
          }`}
        >
          Uncategorized
        </button>
        {folders.map((f: any) => (
          <div
            key={f.id}
            className={`group flex items-center gap-1 text-xs pl-3 pr-1.5 py-1.5 rounded-full border transition-colors ${
              folderFilter === f.id
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-canvas-soft text-muted-foreground border-border hover:text-foreground'
            }`}
          >
            <button onClick={() => setFolderFilter(f.id)}>{f.name}</button>
            <button
              onClick={() => setFolderToDelete(f)}
              title="Delete folder"
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-0.5 rounded-full"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {saved.length > 0 ? saved.map((item: any) => (
          <div key={item.id} className="bg-canvas-soft border border-border rounded-xl p-5 hover:border-primary/50 transition-colors group flex flex-col h-[280px]">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 max-w-[80%]">
                <div className="p-2 bg-primary/10 text-primary rounded-lg shrink-0">
                  <Save size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-medium text-foreground truncate">{item.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Folder size={12} className="text-muted-foreground shrink-0" />
                    <select
                      value={item.folderId || ''}
                      onChange={(e) => moveMutation.mutate({ id: item.id, folderId: e.target.value || null })}
                      title={`Folder: ${folderName(item.folderId)}`}
                      className="text-xs text-muted-foreground bg-transparent border-none outline-none truncate max-w-[130px] cursor-pointer hover:text-foreground"
                    >
                      <option value="">Uncategorized</option>
                      {folders.map((f: any) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <button className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors opacity-0 group-hover:opacity-100">
                <MoreVertical size={16} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4 line-clamp-2 min-h-[40px]">
              {item.description || 'No description provided'}
            </p>

            <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Updated {new Date(item.updatedAt).toLocaleDateString()}
              </span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded tooltip-trigger transition-colors"
                  data-tooltip="Run"
                  onClick={() => navigate('/workspace', { state: { query: item.query } })}
                >
                  <Play size={14} />
                </button>
                <button
                  className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded tooltip-trigger transition-colors"
                  data-tooltip="Share"
                  aria-label="Share"
                  onClick={() => setShareQueryId(item.id)}
                >
                  <Share2 size={14} />
                </button>
                <button
                  className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded tooltip-trigger transition-colors"
                  data-tooltip="Delete"
                  onClick={() => setQueryToDelete(item)}
                >
                  <Trash size={14} />
                </button>
              </div>
            </div>
          </div>
        )) : (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            {debouncedSearch
              ? `No saved queries match "${debouncedSearch}".`
              : folderFilter !== ALL_FILTER
                ? 'No saved queries in this folder.'
                : 'No saved queries yet. Run a query in the workspace and click "Save".'}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!queryToDelete}
        onClose={() => setQueryToDelete(null)}
        onConfirm={() => {
          if (queryToDelete) {
            deleteMutation.mutate(queryToDelete.id);
          }
        }}
        title="Delete Query"
        message={`Are you sure you want to delete "${queryToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={!!folderToDelete}
        onClose={() => setFolderToDelete(null)}
        onConfirm={() => {
          if (folderToDelete) {
            deleteFolderMutation.mutate(folderToDelete.id);
          }
        }}
        title="Delete Folder"
        message={`Delete "${folderToDelete?.name}"? Queries inside it will be moved to Uncategorized, not deleted.`}
        confirmText="Delete Folder"
        cancelText="Cancel"
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={isNewFolderOpen}
        onClose={() => { setIsNewFolderOpen(false); setNewFolderName(''); }}
        onConfirm={() => {
          const trimmed = newFolderName.trim();
          if (trimmed) createFolderMutation.mutate(trimmed);
        }}
        title="New Folder"
        message={
          <input
            autoFocus
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const trimmed = newFolderName.trim();
                if (trimmed) createFolderMutation.mutate(trimmed);
              }
            }}
            placeholder="Folder name"
            className="w-full bg-canvas-soft border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        }
        confirmText="Create"
        cancelText="Cancel"
        confirmDisabled={!newFolderName.trim()}
      />

      <ConfirmModal
        isOpen={!!shareQueryId}
        onClose={() => setShareQueryId(null)}
        onConfirm={() => {
          if (queryToShare) {
            toggleShareMutation.mutate({ id: queryToShare.id, enable: !queryToShare.shareToken });
          }
        }}
        title="Share Query"
        message={
          queryToShare?.shareToken ? (
            <div className="space-y-3">
              <p>
                Anyone with this link can view <strong>{queryToShare.name}</strong>'s name and SQL text — read-only.
                They cannot run it, and they cannot see your database or any results.
              </p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={shareUrl(queryToShare.shareToken)}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 min-w-0 bg-canvas-soft border border-border rounded-md px-3 py-2 text-xs text-foreground"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl(queryToShare.shareToken));
                      success('Link copied');
                    } catch {
                      error('Could not copy automatically', 'Select the link text and copy it manually.');
                    }
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          ) : (
            <p>
              Enable sharing to get a public link to <strong>{queryToShare?.name}</strong>. Anyone with the link can
              view its name and SQL text — read-only. They cannot run it, and they cannot see your database or any
              results.
            </p>
          )
        }
        confirmText={queryToShare?.shareToken ? 'Disable Sharing' : 'Enable Sharing'}
        cancelText={queryToShare?.shareToken ? 'Close' : 'Cancel'}
        isDestructive={!!queryToShare?.shareToken}
      />
    </div>
  );
}
