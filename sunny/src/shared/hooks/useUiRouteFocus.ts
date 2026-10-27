import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useUiVersion, useUiNavigationMemory } from '../providers/UiVersionProvider';

/** Presentation-only memory, owned by the keyed authenticated shell. No storage
 * and no user settings. Known parent routes restore their trigger and scroll. */
export function useUiRouteFocus() {
  const { pathname, search, key } = useLocation();
  const navigationType=useNavigationType();
  const memory=useUiNavigationMemory();
  const previous=useRef<{key:string;url:string}|null>(null);
  const identity=`${key}:${pathname}${search}`;
  const version = useUiVersion();
  const legacyPath=useRef<string|null>(null);
  const visits = useRef(new Map<string, { top: number; label?: string; href?: string; text?: string }>());
  useLayoutEffect(() => {
    if(navigationType==='PUSH' && previous.current && previous.current.key!==key) memory?.set(`origin:${key}`,previous.current.url);
    previous.current={key,url:pathname+search};
    const scroller = document.getElementById('app-scroll');
    const main = document.getElementById('page-content');
    if (!scroller || !main) return;
    const focusRoot=main.closest('.app-content')??main;
    const isPageTrigger=(el:HTMLElement)=>main.contains(el)||!!el.closest('.app-header-actions')||el.matches('.app-header-action');
    if (version !== '3.0') { if(legacyPath.current!==pathname){scroller.scrollTo(0,0); window.scrollTo(0,0);legacyPath.current=pathname;} return; }
    legacyPath.current=null;
    // POP restores the exact entry; an explicit parent link can create a new
    // entry, so also retain the latest snapshot of the exact URL (query included).
    const previousVisit=visits.current.get(identity)??visits.current.get(`url:${pathname}${search}`);
    const saved=previousVisit?{...previousVisit}:undefined;
    const state = saved ?? { top: 0 };
    visits.current.set(identity,state);
    visits.current.set(`url:${pathname}${search}`,state);
    let frame = 0;
    let restored = false;
    const restore = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (main.querySelector('[aria-label="Caricamento"]')) return;
        scroller.scrollTop = saved?.top ?? 0;
        if (!restored) {
          const target = saved && Array.from(focusRoot.querySelectorAll<HTMLElement>('button,a')).find(el =>
            isPageTrigger(el) && el.getClientRects().length && (saved.href ? el.getAttribute('href') === saved.href : saved.label ? el.getAttribute('aria-label') === saved.label : saved.text && el.textContent === saved.text));
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
      if (isPageTrigger(el) && el.matches('button,a')) {
        state.label=el.getAttribute('aria-label')??undefined; state.href=el.getAttribute('href')??undefined; state.text=el.textContent??undefined;
      }
    };
    scroller.addEventListener('scroll',onScroll); focusRoot.addEventListener('focusin',onFocus as EventListener);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); scroller.removeEventListener('scroll',onScroll); focusRoot.removeEventListener('focusin',onFocus as EventListener); };
  },[identity,version,memory,navigationType]);
}
