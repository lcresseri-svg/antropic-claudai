import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useUiVersion } from '../providers/UiVersionProvider';

/** Presentation-only memory, owned by the keyed authenticated shell. No storage
 * and no user settings. Known parent routes restore their trigger and scroll. */
export function useUiRouteFocus() {
  const { pathname } = useLocation();
  const version = useUiVersion();
  const visits = useRef(new Map<string, { top: number; label?: string; href?: string; text?: string }>());
  useLayoutEffect(() => {
    const scroller = document.getElementById('app-scroll');
    const main = document.getElementById('page-content');
    if (!scroller || !main) return;
    if (version !== '3.0') { scroller.scrollTo(0,0); window.scrollTo(0,0); return; }
    const saved = visits.current.get(pathname);
    const state = saved ?? { top: 0 };
    visits.current.set(pathname,state);
    let frame = 0;
    let restored = false;
    const restore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (main.querySelector('[aria-label="Caricamento"]')) return;
        scroller.scrollTop = saved?.top ?? 0;
        if (!restored) {
          const target = saved && Array.from(main.querySelectorAll<HTMLElement>('button,a')).find(el =>
            el.getClientRects().length && (saved.href ? el.getAttribute('href') === saved.href : saved.label ? el.getAttribute('aria-label') === saved.label : saved.text && el.textContent === saved.text));
          (target || main).focus({preventScroll:true}); restored = true;
        }
      });
    };
    restore();
    const observer = new MutationObserver(() => { if (!restored) restore(); });
    observer.observe(main,{childList:true,subtree:true});
    const onScroll = () => { if (restored) state.top = scroller.scrollTop; };
    const onFocus = (e: FocusEvent) => {
      const el=e.target as HTMLElement;
      if (main.contains(el) && el.matches('button,a')) {
        state.label=el.getAttribute('aria-label')??undefined; state.href=el.getAttribute('href')??undefined; state.text=el.textContent??undefined;
      }
    };
    scroller.addEventListener('scroll',onScroll); main.addEventListener('focusin',onFocus);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); scroller.removeEventListener('scroll',onScroll); main.removeEventListener('focusin',onFocus); };
  },[pathname,version]);
}
