// One-shot release notice shown on app entry: bottom sheet on mobile, centered
// card on desktop. Announces the wealth-history screen + smart-series updates
// and deep-links to /wealth-history. Shown once per user per notice id (see
// releaseNoticeStorage); mounted in the authenticated shell only, and only
// after the initial data load, so it never covers the loading state.
// Reusable: ship a future notice by changing RELEASE_NOTICE_ID and the texts.

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { RELEASE_NOTICE_ID, hasSeenReleaseNotice, markReleaseNoticeSeen } from './releaseNoticeStorage';

const BULLETS = [
  'Gli abbonamenti mostrano subito l\'equivalente: quanto costa al mese un canone annuale (e viceversa).',
  'Le rate indicano l\'avanzamento del piano: quante pagate, quante mancano.',
  'Il patrimonio totale ora considera anche gli investimenti, di default.',
  'Nuova schermata "Andamento patrimonio": liquidità e investimenti come serie separate, nel tempo.',
  'Variazioni a colpo d\'occhio su 1 mese, 3 mesi, 6 mesi e 1 anno.',
];

export function ReleaseNotice({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenReleaseNotice(userId, RELEASE_NOTICE_ID)) setOpen(true);
  }, [userId]);

  const dismiss = (goToWealth: boolean) => {
    markReleaseNoticeSeen(userId, RELEASE_NOTICE_ID);
    setOpen(false);
    if (goToWealth) navigate('/wealth-history');
  };

  useEscapeKey(() => dismiss(false), open);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) dismiss(false); }}
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
              Novità in Sunny
            </h3>
            <p className="text-[13px] text-secondary mt-1.5 leading-relaxed">
              Il tuo patrimonio, più leggibile: serie più chiare e una nuova vista nel tempo.
            </p>
          </div>
          <button onClick={() => dismiss(false)} aria-label="Chiudi"
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

        <div className="px-6 pt-4 pb-6 space-y-2">
          <button
            onClick={() => dismiss(true)}
            className="w-full py-3.5 rounded-2xl bg-gold text-bg text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Scopri il patrimonio
          </button>
          <button
            onClick={() => dismiss(false)}
            className="w-full py-3 rounded-2xl bg-card text-secondary font-medium text-sm hover:bg-card-hover transition-colors"
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
