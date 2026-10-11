import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { lockPageScroll } from '../../shared/useScrollLock';

/** Native modal supplies focus containment/inert background and Escape behavior.
 * Restore the exact trigger after unmount, including keyboard-opened details. */
export function PlanDialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const trigger=document.activeElement as HTMLElement|null;
    const unlock=lockPageScroll();
    ref.current?.showModal();
    return ()=>{ref.current?.close();unlock();trigger?.focus();};
  },[]);
  return createPortal(<dialog className="plan-dialog glass-elevated shadow-float" ref={ref} aria-label={title}
    onCancel={e=>{e.preventDefault();onClose();}}>
    <header><h2>{title}</h2><button className="plan-close" type="button" onClick={onClose} aria-label="Chiudi">✕</button></header>
    <div className="plan-dialog-body">{children}</div>
  </dialog>,document.body);
}
