import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder, File as FileIcon, FolderPlus, FilePlus, Edit2, Trash2, ChevronRight, ChevronDown, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useGitStatus } from '@/lib/hooks/useGit';
import { apiFetch } from '@/lib/api';

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

export function FileExplorer({ onFileSelect }: { onFileSelect?: (path: string) => void }) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, path: string, isDir: boolean } | null>(null);
  const queryClient = useQueryClient();
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const { data: filesData, isLoading } = useQuery({
    queryKey: ['files'],
    queryFn: async () => {
      const res = await apiFetch('/api/files');
      return res.json() as Promise<{ success: boolean; files: FileNode[] }>;
    },
    // Tightened from 2000ms to line up with useGitStatus's 1000ms (see the
    // comment there for the measured cost/trade-off) — walking the file
    // tree for a workspace of comparable size measured at ~18ms/call,
    // cheaper than git status, so it isn't the limiting factor here.
    refetchInterval: 1000
  });

  const { data: gitStatus } = useGitStatus();

  // Compute file statuses map
  const fileStatuses = React.useMemo(() => {
    const map: Record<string, { letter: string, color: string, renamedFrom?: string, conflict?: boolean, isFolderEntry?: boolean }> = {};
    if (!gitStatus) return map;

    // Strip trailing slash that git sometimes adds for untracked directories
    const conflictedPaths = new Set((gitStatus.conflicted || []).map(p => p.replace(/\/$/, '')));

    gitStatus.files.forEach(f => {
      const normalizedPath = f.path.replace(/\/$/, '');
      // Conflicts are handled last (below) using the typed `conflicted` field
      // so they always win — skip them here regardless of their raw codes.
      if (conflictedPaths.has(normalizedPath)) return;
      // Renames are handled below using the typed `renamed` field, which has
      // clean from/to paths instead of the raw NUL-joined path/index codes.
      if (f.index === 'R' || f.working_dir === 'R') return;

      let letter = '';
      let color = '';

      if (f.index === '?' && f.working_dir === '?') {
        // Untracked gets its own hue (cyan), not a lighter shade of Added's
        // green — the two were too close to tell apart without reading the
        // letter badge.
        letter = 'U'; color = 'text-cyan-400';
      } else if (f.index === 'A' || f.working_dir === 'A') {
        letter = 'A'; color = 'text-green-500';
      } else if (f.index === 'M' || f.working_dir === 'M') {
        letter = 'M'; color = 'text-yellow-500';
      } else if (f.index === 'D' || f.working_dir === 'D') {
        letter = 'D'; color = 'text-red-500';
      }
      if (letter) {
        // A trailing slash on the raw path means git collapsed a whole
        // untracked directory into one line (e.g. "?? new-folder/") instead
        // of listing its files individually — this entry's path IS a
        // folder, not a file, and the folder-level indicator logic below
        // needs to know that to mark it directly rather than treating it as
        // a file whose parent should be marked.
        map[normalizedPath] = { letter, color, isFolderEntry: f.path.endsWith('/') };
      }
    });

    // Renamed files: reflect the file at its NEW path with a distinct badge/color.
    (gitStatus.renamed || []).forEach(r => {
      const normalizedPath = r.to.replace(/\/$/, '');
      if (conflictedPaths.has(normalizedPath)) return;
      map[normalizedPath] = { letter: 'R', color: 'text-blue-400', renamedFrom: r.from };
    });

    // Unresolved merge conflicts always win, overriding any Added/Modified/
    // Deleted/Renamed classification computed above — a conflicted file must
    // never look like an ordinary change.
    conflictedPaths.forEach(path => {
      map[path] = { letter: 'C', color: 'text-orange-500', conflict: true };
    });

    return map;
  }, [gitStatus]);

  // Aggregate change counts per folder (has changed children) — treats a
  // folder git collapsed into one line (isFolderEntry, e.g. a whole new
  // untracked directory) the same as a folder git listed via N individual
  // changed files underneath it: either way, the folder itself and every
  // ancestor above it get counted. A collapsed folder-entry counts as 1
  // (git didn't enumerate its contents, so 1 changed item — the folder
  // itself — is all we actually know); a normal file entry counts as 1
  // changed file under every ancestor folder, same as VS Code's per-folder
  // change count.
  const folderStatuses = React.useMemo(() => {
    const map: Record<string, number> = {};
    Object.entries(fileStatuses).forEach(([entryPath, info]) => {
      if (info.isFolderEntry) {
        map[entryPath] = (map[entryPath] || 0) + 1;
      }
      const parts = entryPath.split('/');
      parts.pop(); // remove the last segment (file name, or the folder's own name for a folder entry)
      while (parts.length > 0) {
        const folderPath = parts.join('/');
        map[folderPath] = (map[folderPath] || 0) + 1;
        parts.pop();
      }
    });
    return map;
  }, [fileStatuses]);

  // Folders that contain an unresolved conflict get a distinct warning dot
  // instead of the generic "has changes" dot.
  const folderConflictStatuses = React.useMemo(() => {
    const map: Record<string, boolean> = {};
    Object.entries(fileStatuses).forEach(([filePath, info]) => {
      if (!info.conflict) return;
      const parts = filePath.split('/');
      parts.pop();
      while (parts.length > 0) {
        map[parts.join('/')] = true;
        parts.pop();
      }
    });
    return map;
  }, [fileStatuses]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const handleContextMenu = (e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  };

  const fileMutation = useMutation({
    mutationFn: async ({ action, ...payload }: { action: 'create' | 'rename' | 'delete', path?: string, type?: 'file' | 'folder', oldPath?: string, newPath?: string }) => {
      let res;
      if (action === 'create') {
        res = await apiFetch('/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else if (action === 'rename') {
        res = await apiFetch('/api/files', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else if (action === 'delete') {
        res = await apiFetch(`/api/files?path=${encodeURIComponent(payload.path || '')}`, {
          method: 'DELETE'
        });
      }
      
      const data = await res?.json();
      if (!data?.success) throw new Error(data?.error || 'Operation failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['git-status'] });
      setContextMenu(null);
    },
    onError: (err: Error) => {
      alert(`Error: ${err.message}`);
      setContextMenu(null);
    }
  });

  const handleCreate = (type: 'file' | 'folder') => {
    if (!contextMenu) return;
    const parentPath = contextMenu.isDir ? contextMenu.path : contextMenu.path.split('/').slice(0, -1).join('/');
    const name = prompt(`Enter ${type} name:`);
    if (!name) return;
    
    const targetPath = parentPath ? `${parentPath}/${name}` : name;
    fileMutation.mutate({ action: 'create', path: targetPath, type });
  };

  const handleRename = () => {
    if (!contextMenu) return;
    const currentName = contextMenu.path.split('/').pop() || '';
    const newName = prompt('Enter new name:', currentName);
    if (!newName || newName === currentName) return;
    
    const parentPath = contextMenu.path.split('/').slice(0, -1).join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    
    fileMutation.mutate({ action: 'rename', oldPath: contextMenu.path, newPath });
  };

  const handleDelete = () => {
    if (!contextMenu) return;
    if (confirm(`Are you sure you want to delete ${contextMenu.path}?`)) {
      fileMutation.mutate({ action: 'delete', path: contextMenu.path });
    }
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      let gitStatusInfo = fileStatuses[node.path];
      if (!gitStatusInfo) {
        // If an ancestor is untracked, treat this node as untracked too
        let parentPath = node.path;
        while(parentPath.includes('/')) {
          parentPath = parentPath.split('/').slice(0, -1).join('/');
          if (fileStatuses[parentPath]?.letter === 'U') {
             gitStatusInfo = { letter: 'U', color: 'text-cyan-400' };
             break;
          }
        }
      }
      const folderChangeCount = folderStatuses[node.path] || 0;
      const folderHasChanges = node.isDir && folderChangeCount > 0;
      const folderHasConflict = node.isDir && folderConflictStatuses[node.path];

      const rowTitle = gitStatusInfo?.conflict
        ? 'Unresolved merge conflict'
        : gitStatusInfo?.renamedFrom
          ? `Renamed from ${gitStatusInfo.renamedFrom}`
          : undefined;

      return (
        <div key={node.path}>
          <div
            className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:bg-canvas-night-soft hover:text-foreground cursor-pointer rounded-sm group"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => {
              if (node.isDir) {
                toggleFolder(node.path);
              } else if (onFileSelect) {
                onFileSelect(node.path);
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, node.path, node.isDir)}
            title={rowTitle}
          >
            <div className="shrink-0 w-4 flex items-center justify-center">
              {node.isDir ? (
                expandedFolders[node.path] ? <ChevronDown size={14} /> : <ChevronRight size={14} />
              ) : <span className="w-3.5" />}
            </div>
            {node.isDir ? (
              <Folder size={14} className="text-primary-soft shrink-0" />
            ) : (
              <FileIcon size={14} className="text-muted-foreground shrink-0" />
            )}
            <span className={`truncate flex-1 ${gitStatusInfo ? gitStatusInfo.color : ''} ${gitStatusInfo?.conflict ? 'font-bold' : ''}`}>{node.name}</span>

            {/* Git Badges */}
            {node.isDir && folderHasChanges && (
              <div
                className="flex items-center gap-1 mr-1 shrink-0"
                title={folderHasConflict ? 'Contains unresolved merge conflicts' : `${folderChangeCount} changed ${folderChangeCount === 1 ? 'item' : 'items'}`}
              >
                <span className="text-[10px] text-muted-foreground font-medium tabular-nums leading-none">
                  {folderChangeCount}
                </span>
                <div className={`w-2 h-2 rounded-full shrink-0 ${folderHasConflict ? 'bg-red-600 ring-2 ring-red-400/60' : 'bg-blue-500'}`} />
              </div>
            )}
            {!node.isDir && gitStatusInfo && (
              gitStatusInfo.conflict ? (
                <span
                  className="flex items-center gap-0.5 text-[10px] font-bold text-white bg-red-600 rounded px-1 py-0.5 shrink-0 mr-1"
                  title="Unresolved merge conflict"
                >
                  <AlertTriangle size={10} /> C
                </span>
              ) : (
                <span className={`text-[10px] font-bold ${gitStatusInfo.color} shrink-0 pr-1`}>{gitStatusInfo.letter}</span>
              )
            )}
          </div>
          {node.isDir && expandedFolders[node.path] && node.children && (
            <div>{renderTree(node.children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full bg-canvas-soft relative select-none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground tracking-wider">EXPLORER</span>
        <button 
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['files'] });
            queryClient.invalidateQueries({ queryKey: ['git-status'] });
          }}
          className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-canvas-night-soft transition-colors"
          title="Refresh Explorer"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
        </button>
      </div>
      <div 
        className="flex-1 overflow-auto p-2 min-h-[100px]"
        onContextMenu={(e) => {
          // If clicked in empty space, context menu for root
          if (e.target === e.currentTarget) {
            handleContextMenu(e, '', true);
          }
        }}
      >
        {isLoading ? (
           <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>
        ) : (
          renderTree(filesData?.files || [])
        )}
      </div>

      {contextMenu && (
        <div 
          ref={contextMenuRef}
          className="fixed z-50 bg-canvas border border-border shadow-lg rounded-md py-1 min-w-[160px] text-sm text-foreground"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="px-2 py-1 flex gap-2 items-center hover:bg-canvas-night cursor-pointer" onClick={() => handleCreate('file')}>
            <FilePlus size={14} className="text-muted-foreground" /> New File
          </div>
          <div className="px-2 py-1 flex gap-2 items-center hover:bg-canvas-night cursor-pointer" onClick={() => handleCreate('folder')}>
            <FolderPlus size={14} className="text-muted-foreground" /> New Folder
          </div>
          {contextMenu.path !== '' && (
            <>
              <div className="h-px bg-border my-1" />
              <div className="px-2 py-1 flex gap-2 items-center hover:bg-canvas-night cursor-pointer" onClick={handleRename}>
                <Edit2 size={14} className="text-muted-foreground" /> Rename
              </div>
              <div className="px-2 py-1 flex gap-2 items-center hover:bg-red-500/20 text-red-400 cursor-pointer" onClick={handleDelete}>
                <Trash2 size={14} /> Delete
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
