import React, { useState } from 'react';
import { useGitStatus, useGitMutations } from '@/lib/hooks/useGit';
import { File as FileIcon, Plus, Minus, Loader2, Check, AlertTriangle } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

export function SourceControl({ onFileSelect }: { onFileSelect?: (path: string) => void }) {
  const { data: gitStatus, isLoading } = useGitStatus();
  const { stage, unstage, commit } = useGitMutations();
  const [commitMessage, setCommitMessage] = useState('');
  const [showConflictWarning, setShowConflictWarning] = useState(false);

  if (isLoading) {
    return <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" size={20} /></div>;
  }

  // Unresolved merge conflicts take visual priority over every other status.
  // Use the typed `conflicted` field (already populated by the backend) so
  // these files get their own section instead of hiding inside
  // Staged/Changes looking like an ordinary Added/Modified file.
  const conflictedFiles = gitStatus?.conflicted || [];
  const conflictedPaths = new Set(conflictedFiles);
  const hasConflicts = conflictedFiles.length > 0;

  // simple-git doesn't add renamed entries to `staged`, even though a rename
  // reported by `git status` is staged in the index. Use the typed `renamed`
  // field (clean from/to paths) rather than re-deriving them from raw codes.
  const renamedFiles = gitStatus?.renamed || [];
  const renamedToPaths = new Set(renamedFiles.map(r => r.to));

  const stagedFiles = [...(gitStatus?.staged || []), ...renamedFiles.map(r => r.to)]
    .filter(path => !conflictedPaths.has(path));
  const hasStaged = stagedFiles.length > 0;

  // Untracked, modified, deleted (unstaged). Conflicted files are rendered
  // via their own Merge Conflicts section, and renamed files via
  // stagedFiles/renamedFiles above, so exclude both here to avoid duplicates.
  const unstagedFiles = (gitStatus?.files || []).filter(f => {
    if (conflictedPaths.has(f.path)) return false;
    if (renamedToPaths.has(f.path)) return false;
    // If it's only staged (index = A/M/D, working_dir = ' '), skip
    if (f.working_dir === ' ' && f.index !== ' ' && f.index !== '?') return false;
    return true;
  });

  const getFileIconAndColor = (f: { index: string, working_dir: string }) => {
    let letter = '';
    let color = '';
    // Fallback safety net: recognize git's raw unmerged codes (UU/AU/UA/DD/DU/UD)
    // even if a path was somehow missing from the typed `conflicted` array.
    // The typed array (checked via `conflictedPaths` in renderFile) is the
    // primary source of truth and always takes priority over this.
    if (f.index === 'U' || f.working_dir === 'U' || (f.index === 'A' && f.working_dir === 'A') || (f.index === 'D' && f.working_dir === 'D')) {
      letter = 'C'; color = 'text-orange-500';
    } else if (f.index === '?' && f.working_dir === '?') {
      letter = 'U'; color = 'text-green-400';
    } else if (f.index === 'R' || f.working_dir === 'R') {
      letter = 'R'; color = 'text-blue-400';
    } else if (f.index === 'A' || f.working_dir === 'A') {
      letter = 'A'; color = 'text-green-500';
    } else if (f.index === 'M' || f.working_dir === 'M') {
      letter = 'M'; color = 'text-yellow-500';
    } else if (f.index === 'D' || f.working_dir === 'D') {
      letter = 'D'; color = 'text-red-500';
    }
    return { letter, color };
  };

  const performCommit = () => {
    commit.mutate(commitMessage, {
      onSuccess: () => setCommitMessage('')
    });
  };

  const handleCommit = () => {
    if (!commitMessage.trim() || !hasStaged) return;
    // Warn, don't block — matches VS Code: committing while conflicts exist
    // is allowed, but only after the user explicitly confirms.
    if (hasConflicts) {
      setShowConflictWarning(true);
      return;
    }
    performCommit();
  };

  const conflictWarningMessage = conflictedFiles.length === 1
    ? `"${conflictedFiles[0]}" still has unresolved merge conflicts. Commit anyway?`
    : `${conflictedFiles.length} files still have unresolved merge conflicts: ${conflictedFiles.join(', ')}. Commit anyway?`;

  const renderFile = (filePath: string, isStaged: boolean) => {
    // Conflict status is checked first and wins over everything else — a
    // conflicted file might also technically show as modified, but the
    // conflict badge must be what the user sees.
    const isConflicted = conflictedPaths.has(filePath);
    // Prefer the typed `renamed` entry (clean from/to) over re-deriving it
    // from the raw NUL-joined path/index codes in `files`.
    const renameInfo = !isConflicted ? renamedFiles.find(r => r.to === filePath) : undefined;
    const fileData = gitStatus?.files.find(f => f.path === filePath);
    const { letter, color } = isConflicted
      ? { letter: 'C', color: 'text-orange-500' }
      : renameInfo
        ? { letter: 'R', color: 'text-blue-400' }
        : (fileData ? getFileIconAndColor(fileData) : { letter: '', color: '' });
    const fileName = filePath.split('/').pop() || filePath;
    const folderPath = filePath.split('/').slice(0, -1).join('/');
    const oldName = renameInfo ? (renameInfo.from.split('/').pop() || renameInfo.from) : null;

    return (
      <div
        key={filePath}
        className="flex items-center gap-2 px-2 py-1 hover:bg-canvas-night-soft cursor-pointer group text-sm"
        onClick={() => {
          if (onFileSelect && !filePath.endsWith('/')) {
            onFileSelect(filePath);
          }
        }}
        title={isConflicted ? 'Unresolved merge conflict' : renameInfo ? `${renameInfo.from} → ${renameInfo.to}` : undefined}
      >
        <FileIcon size={14} className="text-muted-foreground shrink-0" />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden leading-tight">
          <span className={`truncate ${color} ${isConflicted ? 'font-bold' : ''}`}>
            {oldName ? <>{oldName} <span className="text-muted-foreground">&rarr;</span> {fileName}</> : fileName}
          </span>
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
        {isConflicted ? (
          <span
            className="flex items-center gap-0.5 text-[10px] font-bold text-white bg-red-600 rounded px-1 py-0.5 shrink-0"
            title="Unresolved merge conflict"
          >
            <AlertTriangle size={10} /> C
          </span>
        ) : (
          <span className={`text-[10px] font-bold ${color} w-3 text-center shrink-0`}>{letter}</span>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-canvas-soft select-none overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-1">
          SOURCE CONTROL <span className="bg-canvas-night px-1.5 py-0.5 rounded text-[10px] ml-1">{stagedFiles.length + unstagedFiles.length + conflictedFiles.length}</span>
        </span>
      </div>

      <div className="p-3 border-b border-border shrink-0 flex flex-col gap-2">
        {hasConflicts && (
          <div className="flex items-start gap-2 bg-red-600/15 border border-red-600/40 rounded p-2 text-xs text-red-500">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {conflictedFiles.length} unresolved merge {conflictedFiles.length === 1 ? 'conflict' : 'conflicts'}. Resolve {conflictedFiles.length === 1 ? 'it' : 'them'} before committing.
            </span>
          </div>
        )}
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
        {hasConflicts && (
          <div>
            <div className="px-3 py-1 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-red-500 shrink-0" />
              <span className="text-xs font-bold text-red-500">Merge Conflicts</span>
              <span className="bg-red-600 text-white px-1.5 py-0.5 rounded text-[10px]">{conflictedFiles.length}</span>
            </div>
            <div className="mt-1">
              {conflictedFiles.map(f => renderFile(f, false))}
            </div>
          </div>
        )}

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

      <ConfirmModal
        isOpen={showConflictWarning}
        onClose={() => setShowConflictWarning(false)}
        onConfirm={performCommit}
        title="Unresolved merge conflicts"
        message={conflictWarningMessage}
        confirmText="Commit Anyway"
        cancelText="Cancel"
        isDestructive
      />
    </div>
  );
}
