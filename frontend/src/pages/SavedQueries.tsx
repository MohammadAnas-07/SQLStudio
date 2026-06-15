import { Search, Save, Play, Folder, MoreVertical, Share2, Trash, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { useToast } from '@/store/toastStore';

export default function SavedQueries() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error } = useToast();
  const [queryToDelete, setQueryToDelete] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['savedQueries'],
    queryFn: async () => {
      const res = await fetch('http://localhost:3000/api/saved-queries');
      const json = await res.json();
      return json.success ? json.savedQueries : [];
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`http://localhost:3000/api/saved-queries/${id}`, {
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

  const saved = data || [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Saved Queries</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage and organize your frequently used queries.</p>
        </div>
        <div className="flex gap-4">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search saved queries..."
              className="w-full bg-canvas-soft border border-border rounded-md pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
            />
          </div>
          <Button className="bg-primary text-primary-foreground hover:bg-primary-deep h-10">
            <Save size={16} className="mr-2" />
            New Folder
          </Button>
        </div>
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
                  <div className="flex items-center gap-2 mt-1">
                    <Folder size={12} className="text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">My Queries</span>
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
                <button className="p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 rounded tooltip-trigger transition-colors" data-tooltip="Share">
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
            No saved queries yet. Run a query in the workspace and click "Save".
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
    </div>
  );
}
