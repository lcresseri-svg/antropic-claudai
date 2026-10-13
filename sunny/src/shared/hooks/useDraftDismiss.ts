import { useEffect, useRef, useState } from 'react';
/** Explicit editor contract: capture the draft before the first pointer/key/input/change event,
 * after the editor's existing initialization effects have populated defaults. */
export function useDraftDismiss({open,signature,saving=false,onClose}:{open:boolean;signature:string;saving?:boolean;onClose:()=>void}) {
  const initial=useRef<string|null>(null);
  const destination=useRef(onClose);
  destination.current=onClose;
  const pending=useRef<()=>void>(onClose);
  const [confirm,setConfirm]=useState(false);
  useEffect(()=>{if(!open){initial.current=null;setConfirm(false);}},[open]);
  const capture=()=>{if(initial.current===null)initial.current=signature;};
  const requestDismissTo=(action:()=>void)=>{if(saving)return;pending.current=action;if(initial.current!==null&&initial.current!==signature)setConfirm(true);else action();};
  const requestDismiss=()=>requestDismissTo(destination.current);
  return {capture,requestDismiss,requestDismissTo,discard:()=>pending.current(),confirm,continueEditing:()=>setConfirm(false)};
}
