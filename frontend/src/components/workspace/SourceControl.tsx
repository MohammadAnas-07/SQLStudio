import React, { useState } from 'react';
import { useGitStatus, useGitMutations } from '@/lib/hooks/useGit';
import { File as FileIcon, Plus, Minus, Loader2, Check } from 'lucide-react';

export function SourceControl({ onFileSelect }: { onFileSelect?: (path: string) => void }) {
  const { data: gitStatus, isLoading } = useGitStatus();
  const { stage, unstage, commit } = useGitMutations();
  const [commitMessage, setCommitMessage] = useState('');

  if (isLoading) {
    return <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>;
  }

  const stagedFiles = gitStatus?.staged || [];
  const hasStaged = stagedFiles.length > 0;
  
  // Untracked, modified, deleted (unstaged)
  const unstagedFiles = (gitStatus?.files || []).filter(f => {
    // If it's only staged (index = A/M/D, working_dir = ' '), skip
    if (f.working_dir === ' ' && f.index !== ' ' && f.index !== '?') return false;
    return true;
  });

  const getFileIconAndColor = (f: { index: string, working_dir: string }) => {
    let letter = '';
    let color = '';
    if (f.index === '?' && f.working_dir === '?') {
      letter = 'U'; color = 'text-green-400';
    } else if (f.index === 'A' || f.working_dir === 'A') {
      letter = 'A'; color = 'text-green-500';
    } else if (f.index === 'M' || f.working_dir === 'M') {
      letter = 'M'; color = 'text-yellow-500';
    } else if (f.index === 'D' || f.working_dir === 'D') {
      letter = 'D'; color = 'text-red-500';
    }
    return { letter, color };
  };

  const handleCommit = () => {
    if (!commitMessage.trim() || !hasStaged) return;
    commit.mutate(commitMessage, {
      onSuccess: () => setCommitMessage('')
    });
  };

  const renderFile = (filePath: string, isStaged: boolean) => {
    const fileData = gitStatus?.files.find(f => f.path === filePath);
    const { letter, color } = fileData ? getFileIconAndColor(fileData) : { letter: '', color: '' };
    const fileName = filePath.split('/').pop() || filePath;
    const folderPath = filePath.split('/').slice(0, -1).join('/');
    
    return (
      <div 
        key={filePath}
        className="flex items-center gap-2 px-2 py-1 hover:bg-canvas-night-soft cursor-pointer group text-sm"
        onClick={() => {
          if (onFileSelect && !filePath.endsWith('/')) {
            onFileSelect(filePath);
          }
        }}
      >
        <FileIcon size={14} className="text-muted-foreground shrink-0" />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden leading-tight">
          <span className={`truncate ${color}`}>{fileName}</span>
          {folderPath && <span className="text-[10px] text-muted-foreground truncate">{folderPath}</span>}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {isStaged ? (
            <button 
              className="p-1 hover:bg-canvas-night rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); unstage.mutate(filePath); }}
              title="Unstage Changes"
            >
              <Minus size={14} />
            </button>
          ) : (
            <button 
              className="p-1 hover:bg-canvas-night rounded text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); stage.mutate(filePath); }}
              title="Stage Changes"
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <span className={`text-[10px] font-bold ${color} w-3 text-center shrink-0`}>{letter}</span>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-canvas-soft select-none overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-1">
          SOURCE CONTROL <span className="bg-canvas-night px-1.5 py-0.5 rounded text-[10px] ml-1">{stagedFiles.length + unstagedFiles.length}</span>
        </span>
      </div>

      <div className="p-3 border-b border-border shrink-0 flex flex-col gap-2">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Message (Cmd+Enter to commit)"
          className="w-full bg-canvas border border-border rounded p-2 text-sm text-foreground focus:outline-none focus:border-primary resize-none h-20"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleCommit();
            }
          }}
        />
        <button
          onClick={handleCommit}
          disabled={!hasStaged || !commitMessage.trim() || commit.isPending}
          className="w-full bg-primary text-primary-foreground py-1.5 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex justify-center items-center gap-2 transition-colors"
        >
          {commit.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Commit
        </button>
      </div>

      <div className="flex-1 overflow-auto py-2 flex flex-col gap-4">
        {stagedFiles.length > 0 && (
          <div>
            <div className="px-3 py-1 flex justify-between items-center group">
              <span className="text-xs font-bold text-foreground">Staged Changes</span>
              <button 
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5 rounded transition-opacity"
                onClick={() => unstage.mutate(stagedFiles)}
                title="Unstage All Changes"
              >
                <Minus size={14} />
              </button>
            </div>
            <div className="mt-1">
              {stagedFiles.map(f => renderFile(f, true))}
            </div>
          </div>
        )}

        {unstagedFiles.length > 0 && (
          <div>
            <div className="px-3 py-1 flex justify-between items-center group">
              <span className="text-xs font-bold text-foreground">Changes</span>
              <button 
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground p-0.5 rounded transition-opacity"
                onClick={() => stage.mutate(unstagedFiles.map(f => f.path))}
                title="Stage All Changes"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="mt-1">
              {unstagedFiles.map(f => renderFile(f.path, false))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
