import { useId, useLayoutEffect, useRef } from 'react';
import './discard-confirmation.css';
import { lockPageScroll } from '../useScrollLock';

/** A nested native modal participates in the top layer even inside PlanDialog.
 * Kept in the editor DOM: opening it never replaces or resizes the form. */
export function DiscardConfirmation({onContinue,onDiscard,description='Le modifiche non salvate andranno perse.'}:{onContinue:()=>void;onDiscard:()=>void;description?:string}) {
  return <ConfirmationDialog title="Scartare le modifiche?" description={description} cancelLabel="Continua a modificare" confirmLabel="Scarta modifiche" onCancel={onContinue} onConfirm={onDiscard}/>;
}
export function ConfirmationDialog({title,description,cancelLabel='Annulla',confirmLabel,onCancel,onConfirm,busy=false}:{title:string;description:string;cancelLabel?:string;confirmLabel:string;onCancel:()=>void;onConfirm:()=>void;busy?:boolean}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(), descriptionId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement as HTMLElement | null;
    const positions: [HTMLElement, number, number][] = [];
    for (let el = dialog.parentElement; el; el = el.parentElement) positions.push([el, el.scrollTop, el.scrollLeft]);
    const restore = () => positions.forEach(([el, top, left]) => { el.scrollTop = top; el.scrollLeft = left; });
    const unlock=lockPageScroll();
    dialog.showModal();
    dialog.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
    restore();
    return () => {
      dialog.close();
      unlock();
      const target = trigger?.isConnected ? trigger : dialog.parentElement?.querySelector<HTMLElement>('button,input');
      target?.focus({ preventScroll: true });
      restore();
    };
  }, []);
  return <dialog ref={ref} className="sunny-discard" data-discard-confirmation role="alertdialog"
    onKeyDown={e=>e.stopPropagation()} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={e => { e.preventDefault(); e.stopPropagation(); if(!busy)onCancel(); }}
    onClick={e => { if (e.target === e.currentTarget) { const r=e.currentTarget.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) if(!busy)onCancel(); } }}>
    <h2 id={titleId}>{title}</h2>
    <p id={descriptionId}>{description}</p>
    <div><button type="button" autoFocus disabled={busy} onClick={onCancel}>{cancelLabel}</button>
      <button type="button" disabled={busy} onClick={onConfirm}>{busy?'Operazione in corso…':confirmLabel}</button></div>
  </dialog>;
}
