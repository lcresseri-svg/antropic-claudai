import { useEffect, useState } from 'react';

/** True while the browser reports no network connection. */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return offline;
}

interface Props {
  /** Firestore listener error message, if any (already user-readable). */
  error: string | null;
}

/**
 * Offline / sync status strip. Firestore keeps working from the IndexedDB
 * cache while offline, so the message is informative, not blocking.
 */
export function SyncStatusBanner({ error }: Props) {
  const offline = useIsOffline();
  if (!offline && !error) return null;
  const isOfflineMsg = offline;
  return (
    <div className="max-w-2xl mx-auto md:max-w-none px-5 md:px-8 pt-2" role="status" aria-live="polite">
      <div className={`rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 border ${
        isOfflineMsg
          ? 'bg-[#E6B95C]/10 border-[#E6B95C]/25'
          : 'bg-[#E08B8B]/12 border-[#E08B8B]/25'
      }`}>
        <span className={`text-sm ${isOfflineMsg ? 'text-[#E6B95C]' : 'text-[#E08B8B]'}`} aria-hidden>
          {isOfflineMsg ? '📡' : '⚠'}
        </span>
        <p className={`text-xs flex-1 ${isOfflineMsg ? 'text-[#E6B95C]' : 'text-[#E08B8B]'}`}>
          {isOfflineMsg
            ? 'Sei offline: i dati mostrati vengono dalla copia locale e le modifiche si sincronizzeranno al ritorno della connessione.'
            : error}
        </p>
      </div>
    </div>
  );
}
