import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  // A plain string still works (existing callers), but this also accepts
  // richer content — e.g. the AI-execute confirmation renders the actual
  // SQL plus a conditional warning banner here, not just prose.
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-canvas border border-border rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          {/* A plain div, not <p> — block-level content (e.g. a <pre> SQL
              preview or a warning banner) isn't valid inside a <p>. */}
          <div className="text-sm text-muted-foreground">{message}</div>
        </div>
        <div className="flex items-center justify-end gap-3 p-4 border-t border-border bg-canvas-soft">
          <Button variant="outline" onClick={onClose}>
            {cancelText}
          </Button>
          <Button
            className={isDestructive ? 'bg-red-500 hover:bg-red-600 text-white' : ''}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
