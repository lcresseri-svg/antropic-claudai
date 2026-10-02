import { useEffect } from 'react';

const locks = new Map<HTMLElement, { count: number; overflow: string }>();

/** Locks may be acquired by both the calling screen and its dialog surface.
 * Reference counts make cleanup independent of React parent/child order. */
export function lockPageScroll(): () => void {
  const elements = [document.getElementById('app-scroll'), document.body].filter((el): el is HTMLElement => !!el);
  for (const el of elements) {
    const lock = locks.get(el) ?? { count: 0, overflow: el.style.overflow };
    lock.count++; locks.set(el, lock); el.style.overflow = 'hidden';
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const el of elements) {
      const lock = locks.get(el)!;
      if (--lock.count === 0) { el.style.overflow = lock.overflow; locks.delete(el); }
    }
  };
}

/**
 * Locks page scrolling while a modal/sheet is open.
 *
 * The app body itself never scrolls (overflow:hidden) — the real scroller is
 * the `#app-scroll` container. So we freeze that element (and body, for safety)
 * and restore the previous values when the final owner closes.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    return lockPageScroll();
  }, [active]);
}
