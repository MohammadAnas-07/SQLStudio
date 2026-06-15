import { useToastStore } from '@/store/toastStore';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 rounded-lg p-4 shadow-lg border min-w-[300px] animate-in slide-in-from-right-8 fade-in duration-300 ${
            toast.type === 'success'
              ? 'bg-green-500/10 border-green-500/20 text-green-500'
              : toast.type === 'error'
              ? 'bg-red-500/10 border-red-500/20 text-red-500'
              : 'bg-canvas-soft border-border text-foreground'
          }`}
        >
          {toast.type === 'success' && <CheckCircle className="mt-0.5" size={18} />}
          {toast.type === 'error' && <AlertCircle className="mt-0.5" size={18} />}
          {toast.type === 'info' && <Info className="mt-0.5 text-blue-500" size={18} />}
          <div className="flex-1">
            <h4 className="text-sm font-semibold">{toast.title}</h4>
            {toast.message && <p className="text-xs opacity-90 mt-1">{toast.message}</p>}
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-current opacity-70 hover:opacity-100 transition-opacity"
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
