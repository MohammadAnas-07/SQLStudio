import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Folder, File as FileIcon, FolderPlus, FilePlus, Edit2, Trash2, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';

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
      const res = await fetch('http://localhost:3000/api/files');
      return res.json() as Promise<{ success: boolean; files: FileNode[] }>;
    }
  });

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
        res = await fetch('http://localhost:3000/api/files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else if (action === 'rename') {
        res = await fetch('http://localhost:3000/api/files', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else if (action === 'delete') {
        res = await fetch(`http://localhost:3000/api/files?path=${encodeURIComponent(payload.path || '')}`, {
          method: 'DELETE'
        });
      }
      
      const data = await res?.json();
      if (!data?.success) throw new Error(data?.error || 'Operation failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setContextMenu(null);
    },
    onError: (err: any) => {
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
    return nodes.map(node => (
      <div key={node.path}>
        <div 
          className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground hover:bg-canvas-night-soft hover:text-foreground cursor-pointer rounded-sm"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
          onClick={() => {
            if (node.isDir) {
              toggleFolder(node.path);
            } else if (onFileSelect) {
              onFileSelect(node.path);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, node.path, node.isDir)}
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
          <span className="truncate">{node.name}</span>
        </div>
        {node.isDir && expandedFolders[node.path] && node.children && (
          <div>{renderTree(node.children, depth + 1)}</div>
        )}
      </div>
    ));
  };

  return (
    <div className="flex flex-col h-full bg-canvas-soft relative select-none">
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
