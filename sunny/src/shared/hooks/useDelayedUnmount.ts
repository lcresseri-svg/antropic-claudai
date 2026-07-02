import { useEffect, useState } from 'react';

/**
 * Keeps a component mounted for `durationMs` after `open` flips to false, so
 * its exit animation can play before React removes it from the DOM.
 *
 *   const mounted = useDelayedUnmount(open, SHEET_EXIT_MS);
 *   if (!mounted) return null;
 *   …className={open ? 'animate-sheet-up' : 'animate-sheet-down'}
 *
 * - `open: true`  → mounted immediately (no delay on entry).
 * - `open: false` → stays mounted for `durationMs`, then unmounts.
 * Timeouts are cleaned up on re-open and on unmount (StrictMode-safe: the
 * effect is idempotent and its cleanup cancels any pending timer).
 */
export function useDelayedUnmount(open: boolean, durationMs: number): boolean {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), durationMs);
    return () => window.clearTimeout(t);
  }, [open, durationMs]);

  return mounted;
}
