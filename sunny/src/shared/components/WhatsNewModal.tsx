// "Novità" popup — shows the changes of a release, but ONLY when the admin has
// opted that specific release in (VersionEntry.highlight === true) AND only to
// the admin (preview before rollout). Reuses the premium-popup style of
// PushPromoSheet; the title uses DM Serif Display, like the wordmark.
//
// ── ROLLOUT (future — documented, NOT implemented here) ──────────────────────
//   • To show this to ALL users, simply drop the `isAdmin` check below and mount
//     it with no admin gate; the highlight + "already seen" logic stays as-is.
//   • For multi-user correctness, move the "already seen" flag from localStorage
//     to a per-user Firestore field (e.g. users/{uid}/meta/settings.whatsNewSeen)
//     so it follows the user across devices instead of being per-browser.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { VERSIONS } from '../../appInfo';
import { useEscapeKey } from '../hooks/useEscapeKey';

const seenKey = (version: string) => `sunny_whatsnew_seen_${version}`;

interface Props {
  /** Gate: only the admin sees the popup in this phase. */
  isAdmin: boolean;
}

export function WhatsNewModal({ isAdmin }: Props) {
  // Most recent highlighted release (VERSIONS is newest-first).
  const entry = VERSIONS.find(v => v.highlight);

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isAdmin || !entry) return;
    let alreadySeen = false;
    try { alreadySeen = localStorage.getItem(seenKey(entry.version)) === '1'; } catch { /* ignore */ }
    if (!alreadySeen) setOpen(true);
  }, [isAdmin, entry?.version]);

  const close = () => {
    if (entry) {
      try { localStorage.setItem(seenKey(entry.version), '1'); } catch { /* ignore */ }
    }
    setOpen(false);
  };

  useEscapeKey(close, open);

  if (!open || !entry) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) close(); }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up overflow-hidden">

        <div className="px-6 pt-6 pb-1 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="label-caps text-gold mb-1">Novità · v{entry.version}</p>
            <h3
              className="text-[26px] leading-tight text-primary"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {entry.title}
            </h3>
            <p className="text-[11px] text-secondary mt-1 balance-num">{entry.date}</p>
          </div>
          <button onClick={close} aria-label="Chiudi"
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary text-sm flex-shrink-0">
            ✕
          </button>
        </div>

        <ul className="px-6 pt-4 pb-2 space-y-3">
          {entry.changes.map((c, i) => (
            <li key={i} className="flex gap-3">
              <span className="text-gold flex-shrink-0 mt-0.5">·</span>
              <span className="text-sm text-primary leading-relaxed">{c}</span>
            </li>
          ))}
        </ul>

        <div className="px-6 pt-4 pb-6">
          <button
            onClick={close}
            className="w-full py-3.5 rounded-2xl bg-gold text-bg text-sm font-semibold active:scale-[0.98] transition-transform"
          >
            Ho capito
          </button>
        </div>
      </div>
    </div>
  );
}
