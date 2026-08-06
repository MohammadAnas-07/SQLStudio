import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface PlatformInfo {
  isWindows: boolean;
}

/**
 * The server's OS, used to pick the right keyboard-shortcut modifier to
 * display (Ctrl vs Cmd). Backed by the same `os.platform() === 'win32'`
 * check the backend already uses to choose the terminal shell — fetched
 * rather than re-derived on the client, so there's a single source of
 * truth instead of a second, possibly-inconsistent OS check (e.g. sniffing
 * navigator.platform/userAgent in the browser).
 */
export function usePlatform() {
  return useQuery({
    queryKey: ['platform'],
    queryFn: async () => {
      const res = await apiFetch('/api/system/platform');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return { isWindows: !!data.isWindows } satisfies PlatformInfo;
    },
    // The server's OS can't change mid-session.
    staleTime: Infinity,
  });
}
