import { create } from 'zustand';
import { apiFetch, getToken, setToken, clearToken } from '@/lib/api';

interface AuthUser {
  id: string;
  email: string;
  name?: string | null;
}

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: !!getToken(),
  login: async (email, password) => {
    const res = await apiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Login failed');
    setToken(data.token);
    set({ user: data.user, isAuthenticated: true });
  },
  register: async (email, password, name) => {
    const res = await apiFetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Registration failed');
    setToken(data.token);
    set({ user: data.user, isAuthenticated: true });
  },
  logout: () => {
    clearToken();
    set({ user: null, isAuthenticated: false });
  },
}));
