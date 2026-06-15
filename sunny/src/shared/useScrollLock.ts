import { useEffect } from 'react';

/**
 * Locks page scrolling while a modal/sheet is open.
 *
 * The app body itself never scrolls (overflow:hidden) — the real scroller is
 * the `#app-scroll` container. So we freeze that element (and body, for safety)
 * and restore the previous values on close. Nested locks are safe: each effect
 * restores exactly the value it captured.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    const el = document.getElementById('app-scroll');
    const prevEl = el?.style.overflow ?? '';
    const prevBody = document.body.style.overflow;
    if (el) el.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      if (el) el.style.overflow = prevEl;
      document.body.style.overflow = prevBody;
    };
  }, [active]);
}
