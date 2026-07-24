import React, { useState, useRef, useEffect } from 'react';
import { useGitStatus, useGitBranch, useGitMutations } from '@/lib/hooks/useGit';
import { GitBranch as GitBranchIcon, Loader2, Plus } from 'lucide-react';

export function StatusBar() {
  const { data: gitStatus } = useGitStatus();
  const { data: branches, isLoading: branchesLoading } = useGitBranch();
  const { checkout } = useGitMutations();
  const [isOpen, setIsOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsCreating(false);
      }
    };
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  const handleCheckout = (branchName: string) => {
    checkout.mutate({ branch: branchName }, {
      onSuccess: () => setIsOpen(false)
    });
  };

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    checkout.mutate({ branch: newBranchName, create: true }, {
      onSuccess: () => {
        setIsOpen(false);
        setNewBranchName('');
        setIsCreating(false);
      }
    });
  };

  return (
    <div className="h-6 bg-[#007acc] text-white flex items-center px-2 text-[11px] font-medium select-none z-50 shrink-0 relative">
      <div 
        className="flex items-center gap-1.5 px-2 hover:bg-white/20 h-full cursor-pointer transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
      >
        <GitBranchIcon size={12} />
        <span>{gitStatus?.current || 'main'}*</span>
      </div>

      {isOpen && (
        <div 
          ref={menuRef}
          className="absolute bottom-6 left-2 bg-canvas border border-border shadow-lg rounded-md py-1 w-64 text-sm text-foreground overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs font-bold text-muted-foreground border-b border-border">Select Branch</div>
          <div className="max-h-48 overflow-auto">
            {branchesLoading ? (
              <div className="flex justify-center p-4"><Loader2 className="animate-spin text-muted-foreground" size={16} /></div>
            ) : (
              (branches?.all || []).map((branch: string) => (
                <div 
                  key={branch}
                  className={`px-3 py-1.5 flex items-center gap-2 cursor-pointer hover:bg-canvas-night-soft ${gitStatus?.current === branch ? 'text-primary' : ''}`}
                  onClick={() => handleCheckout(branch)}
                >
                  <GitBranchIcon size={14} className={gitStatus?.current === branch ? 'text-primary' : 'text-muted-foreground'} />
                  {branch}
                  {gitStatus?.current === branch && <span className="ml-auto text-[10px]">Active</span>}
                </div>
              ))
            )}
          </div>
          <div className="border-t border-border p-2 bg-canvas-soft">
            {isCreating ? (
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="New branch name"
                  autoFocus
                  className="w-full bg-canvas border border-border rounded p-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateBranch();
                    if (e.key === 'Escape') setIsCreating(false);
                  }}
                />
                <button 
                  onClick={handleCreateBranch}
                  disabled={!newBranchName.trim() || checkout.isPending}
                  className="w-full bg-primary text-primary-foreground py-1 rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50 flex justify-center items-center gap-1"
                >
                  {checkout.isPending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Create Branch
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full py-1"
              >
                <Plus size={14} /> Create new branch...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
