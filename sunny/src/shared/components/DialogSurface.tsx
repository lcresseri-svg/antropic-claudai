import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { useUiVersion, useUiNoticeBlock } from '../providers/UiVersionProvider';
import { lockPageScroll } from '../useScrollLock';

const stack: HTMLElement[] = [];
const inertOwners = new Map<HTMLElement, { count: number; original: boolean }>();
const focusables = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]'))
  .filter(el => !el.hasAttribute('disabled') && el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0);

/** Same DOM surface in UI2. UI3 owns focus, background inertness and visible
 * viewport within this scope, never save semantics or a second form instance. */
export const DialogSurface = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & {
  title: string; onDismiss: () => void; onBack?: () => void; kind?: 'editor' | 'detail' | 'import' | 'notice';
}>(function DialogSurface({ title, onDismiss, onBack, kind = 'detail', ...props }, forwardedRef) {
  const version = useUiVersion();
  useUiNoticeBlock(kind!=='notice');
  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useLayoutEffect(() => {
    if (version !== '3.0' || !ref.current) return;
    const dialog = ref.current;
    const overlay = dialog.parentElement!;
    overlay.classList.add('ui-dialog-overlay');
    overlay.dataset.uiDialogKind = kind;
    // Legacy detail shells already label their scrim; UI3 uses the actual
    // content surface as its single scope, not two nested aria-modal dialogs.
    const outerSemantics = ['role','aria-modal','aria-label'].map(name => [name, overlay.getAttribute(name)] as const);
    for (const [name] of outerSemantics) overlay.removeAttribute(name);
    const trigger = document.activeElement as HTMLElement | null;
    const scroller = document.getElementById('app-scroll');
    const scrollTop = scroller?.scrollTop ?? 0;
    const unlock = lockPageScroll();
    stack.push(dialog);
    document.documentElement.dataset.uiModalOpen = 'true';
    const inerted: HTMLElement[] = [];
    for (let node: HTMLElement | null = overlay; node && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement?.children ?? [])) {
        if (!(sibling instanceof HTMLElement) || sibling === node || ['SCRIPT','STYLE','LINK'].includes(sibling.tagName)) continue;
        const ownership = inertOwners.get(sibling) ?? { count: 0, original: sibling.inert };
        ownership.count++; inertOwners.set(sibling, ownership);
        sibling.inert = true; inerted.push(sibling);
      }
    }
    const focusInitial = () => {
      // Titles/close, never autofocus a text field and summon an OS keyboard.
      const target = dialog.querySelector<HTMLElement>('[data-dialog-initial-focus],h2,h3') ?? dialog;
      if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    };
    focusInitial();
    const onKey = (event: KeyboardEvent) => {
      if (stack[stack.length - 1] !== dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); dismiss.current();
      } else if (event.key === 'Tab') {
        const list = focusables(dialog);
        const index = list.indexOf(document.activeElement as HTMLElement);
        if (!list.length) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && index <= 0) { event.preventDefault(); list[list.length - 1].focus(); }
        else if (!event.shiftKey && (index === list.length - 1 || index < 0)) { event.preventDefault(); list[0].focus(); }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (stack[stack.length - 1] === dialog && event.target instanceof Node && !dialog.contains(event.target)) focusInitial();
    };
    const onBackdrop = (event: MouseEvent) => {
      const target=event.target;
      if(stack[stack.length-1]!==dialog) return;
      if(target===overlay || (target instanceof HTMLElement && target.parentElement===overlay && target.classList.contains('absolute') && target.classList.contains('inset-0'))) {
        event.stopImmediatePropagation(); event.stopPropagation(); dismiss.current();
      }
    };
    overlay.addEventListener('click',onBackdrop,true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    let frame = 0;
    const viewport = window.visualViewport;
    const updateViewport = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        overlay.style.setProperty('--ui-visible-height', `${viewport?.height ?? window.innerHeight}px`);
        overlay.style.setProperty('--ui-visible-top', `${viewport?.offsetTop ?? 0}px`);
      });
    };
    updateViewport(); viewport?.addEventListener('resize', updateViewport); viewport?.addEventListener('scroll', updateViewport);
    return () => {
      cancelAnimationFrame(frame); viewport?.removeEventListener('resize', updateViewport); viewport?.removeEventListener('scroll', updateViewport);
      document.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocus);
      overlay.removeEventListener('click',onBackdrop,true);
      stack.splice(stack.indexOf(dialog), 1);
      for (const node of inerted) {
        const ownership = inertOwners.get(node)!;
        if (--ownership.count === 0) { node.inert = ownership.original; inertOwners.delete(node); }
      }
      if (!stack.length) delete document.documentElement.dataset.uiModalOpen;
      unlock();
      if (scroller) scroller.scrollTop = scrollTop;
      for (const [name,value] of outerSemantics) if (value !== null) overlay.setAttribute(name,value);
      const target = trigger?.isConnected && !trigger.closest('[inert]') ? trigger : document.querySelector<HTMLElement>('[aria-label="Aggiungi movimento"],#page-content');
      target?.focus({ preventScroll: true });
    };
  }, [version, kind]);
  return <div {...props} ref={ref} role={version === '3.0' ? 'dialog' : props.role}
    aria-modal={version === '3.0' ? true : props['aria-modal']}
    aria-label={version === '3.0' ? title : props['aria-label']}
    data-ui-dialog={version === '3.0' ? kind : undefined}>
    {version === '3.0' && kind === 'detail' && <div className="ui-dialog-parent"><button type="button" className="ui-back" onClick={onBack ?? onDismiss}>‹ Indietro</button></div>}
    {version === '3.0' && kind === 'editor' && <h2 className="ui-dialog-editor-title">{title}</h2>}
    {props.children}
  </div>;
});
