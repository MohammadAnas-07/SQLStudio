import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  title: string;
  message?: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

// Helper hooks
export const useToast = () => {
  const addToast = useToastStore((state) => state.addToast);
  return {
    toast: (props: Omit<Toast, 'id'>) => addToast(props),
    success: (title: string, message?: string) => addToast({ title, message, type: 'success' }),
    error: (title: string, message?: string) => addToast({ title, message, type: 'error' }),
    info: (title: string, message?: string) => addToast({ title, message, type: 'info' }),
  };
};
