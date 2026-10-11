import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/** Native modal supplies focus containment/inert background and Escape behavior.
 * Restore the exact trigger after unmount, including keyboard-opened details. */
export function PlanDialog({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{
    const trigger=document.activeElement as HTMLElement|null;
    ref.current?.showModal();
    return ()=>{ref.current?.close();trigger?.focus();};
  },[]);
  return createPortal(<dialog className="plan-dialog" ref={ref} aria-label={title}
    onCancel={e=>{e.preventDefault();onClose();}}>
    <header><h2>{title}</h2><button type="button" onClick={onClose} aria-label="Chiudi">✕</button></header>
    {children}
  </dialog>,document.body);
}
