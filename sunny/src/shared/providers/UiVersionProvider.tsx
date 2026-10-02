import { createContext, useContext, useLayoutEffect, useMemo, useState, useId, useSyncExternalStore, type ReactNode, type SetStateAction, type Dispatch } from 'react';
import type { UserLike } from '../featureFlags';
import { resolveUiVersion, type UiVersion } from '../uiVersionConfig';
import { createNoticeQueue } from '../uiNoticeQueue';

const UiVersionContext = createContext<UiVersion>('2.0');
const SessionContext = createContext<Map<string,unknown> | null>(null);
const NoticeContext = createContext<ReturnType<typeof createNoticeQueue> | null>(null);
const noSubscription=()=>()=>{};
const emptySnapshot=()=>null;

/** Applied before paint, including portals. No storage, remote config or user preference.
 * The authenticated subtree is keyed by UID in App; account switches discard drafts. */
export function UiVersionProvider({ user, children }: { user: UserLike | null; children: ReactNode }) {
  const version = resolveUiVersion(user);
  const session = useMemo(() => new Map<string,unknown>(), [user?.uid,version]);
  const notices = useMemo(createNoticeQueue,[user?.uid,version]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.uiVersion = version;
    return () => { delete root.dataset.uiVersion; };
  }, [version]);
  return <UiVersionContext.Provider value={version}><SessionContext.Provider value={session}><NoticeContext.Provider value={notices}>{children}</NoticeContext.Provider></SessionContext.Provider></UiVersionContext.Provider>;
}

export const useUiVersion = () => useContext(UiVersionContext);

export function useUiNoticeSlot(open:boolean,priority:number) {
  const version=useUiVersion(), queue=useContext(NoticeContext),id=useId();
  useLayoutEffect(()=>version==='3.0'&&open?queue?.enter(id,priority):undefined,[queue,id,version,open,priority]);
  const winner=useSyncExternalStore(queue?.subscribe??noSubscription,queue?.snapshot??emptySnapshot,emptySnapshot);
  return open && (version!=='3.0'||winner===id);
}

export function useUiNoticeBlock(active:boolean) {
  const version=useUiVersion(),queue=useContext(NoticeContext),id=useId();
  useLayoutEffect(()=>version==='3.0'&&active?queue?.enter(id,null):undefined,[queue,id,version,active]);
}

/** Only UI3 remembers display filters between parent/detail routes, in RAM.
 * The keyed authenticated subtree discards it on account switch or logout. */
export function useUiSessionState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const session=useContext(SessionContext);
  const version=useUiVersion();
  const [value,setValue]=useState<T>(() => version==='3.0' && session?.has(key) ? session.get(key) as T : typeof initial==='function' ? (initial as () => T)() : initial);
  useLayoutEffect(() => { if(version==='3.0') session?.set(key,value); },[session,version,key,value]);
  return [value,setValue];
}
