// One-shot release notice shown on app entry: bottom sheet on mobile, centered
// card on desktop. Shown once per user per notice id (see releaseNoticeStorage);
// mounted in the authenticated shell only, and only after the initial data
// load, so it never covers the loading state. Dismissible (backdrop, ✕, Esc,
// CTA). Reusable: ship a future notice by changing RELEASE_NOTICE_ID and the
// texts. NB: keep it the ONLY release popup — the WhatsNewModal fires only for
// VERSIONS entries flagged `highlight`, so a release announced here must NOT
// set that flag (never two popups).

import { useState, useEffect } from 'react';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { RELEASE_NOTICE_ID, hasSeenReleaseNotice, markReleaseNoticeSeen } from './releaseNoticeStorage';

const BULLETS = [
  'Il TFR non conta più nel flusso di cassa: resta nel capitale investito e nel patrimonio.',
  'I versamenti senza conto (es. contributi del datore) contano come entrate del flusso.',
  'Il controvalore degli investimenti si aggiorna da solo a ogni versamento o disinvestimento.',
  'Puoi distribuire un versamento una tantum su 3, 6 o 12 mesi nelle statistiche — il movimento resta unico.',
  'Nuovo dettaglio degli investimenti: guadagno totale, rendimento annualizzato e storico dei versamenti.',
];

export function ReleaseNotice({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenReleaseNotice(userId, RELEASE_NOTICE_ID)) setOpen(true);
  }, [userId]);

  const dismiss = () => {
    markReleaseNoticeSeen(userId, RELEASE_NOTICE_ID);
    setOpen(false);
  };

  useEscapeKey(dismiss, open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) dismiss(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up overflow-hidden">

        <div className="px-6 pt-6 pb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-caps text-gold mb-1">Novità</p>
            <h3
              className="text-[26px] leading-tight text-primary"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Investimenti e flussi più chiari
            </h3>
            <p className="text-[13px] text-secondary mt-1.5 leading-relaxed">
              Entrate, uscite e investimenti ora seguono i movimenti reali dei tuoi conti.
            </p>
          </div>
          <button onClick={dismiss} aria-label="Chiudi"
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary text-sm flex-shrink-0">
            ✕
          </button>
        </div>

        <ul className="px-6 pt-4 pb-2 space-y-3">
          {BULLETS.map((c, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-gold flex-shrink-0 mt-0.5">·</span>
              <span className="text-sm text-primary leading-relaxed">{c}</span>
            </li>
          ))}
        </ul>

        <div className="px-6 pt-4 pb-6">
          <button
            onClick={dismiss}
            className="w-full py-3.5 rounded-2xl bg-gold text-bg text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
