import { useEffect, useState } from 'react';

// Returns `value`, but only updates after it's stayed unchanged for
// `delayMs` — used to keep search-as-you-type inputs from firing a request
// on every keystroke.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
