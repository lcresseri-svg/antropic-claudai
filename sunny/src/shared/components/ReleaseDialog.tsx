// Popup "Novità" — componente PRESENTAZIONALE unico.
//
// Prima esistevano due scaffold quasi identici (WhatsNewModal e ReleaseNotice):
// stessa struttura, stessa lista puntata, stesso CTA. Qui c'è la sola
// presentazione; la logica del "già visto" resta nei due wrapper, che sono
// diversi per davvero (per-versione in localStorage vs per-utente per avviso).
//
// Il problema che risolve: cinque righe puntate con lo stesso peso si leggono
// come un changelog e non dicono cosa fare dopo. Quindi al massimo tre voci in
// evidenza (icona + titoletto + spiegazione), il resto collassato dietro
// "Altre N modifiche", e un CTA che porta dove la novità si vede.
//
// Senza `items` il componente ricade sulla vecchia lista puntata (`bullets`):
// le release già pubblicate non cambiano aspetto.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { formatDateFull } from '../../utils';

export interface ReleaseHighlight {
  icon: string;
  title: string;
  detail: string;
}

interface Props {
  open: boolean;
  /** Mostrata nella pill: "Novità · v2.0.0". Senza versione resta "Novità". */
  version?: string;
  /** YYYY-MM-GG, accanto alla pill. */
  date?: string;
  title: string;
  subtitle?: string;
  /** Voci in evidenza: le prime tre con icona, il resto dietro "Altre N". */
  items?: ReleaseHighlight[];
  /** Fallback per le release senza `items`: la lista puntata di sempre. */
  bullets?: string[];
  /** CTA pieno: chiude e naviga. Senza, resta solo "Ho capito". */
  primaryAction?: { label: string; to: string };
  /** Chiamata da backdrop, ✕, Esc e da entrambe le azioni. */
  onClose: () => void;
}

/** Quante voci restano in evidenza prima di collassare il resto. */
const FEATURED = 3;

export function ReleaseDialog({
  open, version, date, title, subtitle, items, bullets, primaryAction, onClose,
}: Props) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  useEscapeKey(onClose, open);

  if (!open) return null;

  const featured = items?.slice(0, FEATURED) ?? [];
  const rest = items?.slice(FEATURED) ?? [];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-[26px] shadow-elev-2 animate-sheet-up
                      overflow-hidden max-h-[88dvh] overflow-y-auto scrollbar-hide"
        style={{ borderTop: '1px solid var(--hero-border-top)' }}>

        {/* Testa: superficie calda + bordo alto oro */}
        <div className="px-[22px] pt-[22px] pb-5" style={{ background: 'var(--accent-surface)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="label-caps text-gold bg-gold/[0.12] border border-gold/[0.22] rounded-full px-2.5 py-1">
                  Novità{version ? ` · v${version}` : ''}
                </span>
                {date && <span className="balance-num text-[11px] text-tertiary">{formatDateFull(date)}</span>}
              </div>
              <h3 className="text-[28px] leading-[1.15] text-primary [text-wrap:pretty]"
                style={{ fontFamily: "'DM Serif Display', serif" }}>
                {title}
              </h3>
              {subtitle && (
                <p className="mt-2.5 text-[13.5px] text-secondary leading-[1.55]">{subtitle}</p>
              )}
            </div>
            <button type="button" onClick={onClose} aria-label="Chiudi"
              className="w-8 h-8 rounded-full bg-primary/[0.06] flex items-center justify-center text-secondary text-sm flex-none">
              ✕
            </button>
          </div>
        </div>

        {/* Corpo: voci in evidenza, oppure la lista puntata delle vecchie release */}
        {featured.length > 0 ? (
          <div className="px-[22px] pt-1">
            {featured.map((it, i) => (
              <div key={it.title}
                className={`flex gap-3.5 py-4 ${i < featured.length - 1 ? 'border-b border-divider' : ''}`}>
                <span className="w-[34px] h-[34px] rounded-xl bg-gold/[0.16] flex items-center justify-center text-[15px] flex-none">
                  {it.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-primary">{it.title}</p>
                  <p className="mt-1 text-[12.5px] text-secondary leading-[1.5]">{it.detail}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="px-[22px] pt-4 pb-1 space-y-3">
            {(bullets ?? []).map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-gold flex-none mt-0.5">·</span>
                <span className="text-sm text-primary leading-relaxed">{b}</span>
              </li>
            ))}
          </ul>
        )}

        {rest.length > 0 && (
          <div className="mx-[22px] mt-1 rounded-2xl bg-primary/[0.04] overflow-hidden">
            <button type="button" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}
              className="w-full flex items-center justify-between px-3.5 py-3">
              <span className="text-[12.5px] text-secondary">Altre {rest.length} modifiche</span>
              <span className="text-[12px] font-semibold text-gold">
                {expanded ? 'Nascondi ⌃' : 'Mostra ⌄'}
              </span>
            </button>
            {expanded && (
              <div className="px-3.5 pb-3 space-y-3">
                {rest.map(it => (
                  <div key={it.title} className="pl-1">
                    <p className="text-[13.5px] font-semibold text-primary">{it.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-secondary leading-[1.5]">{it.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Con un CTA che porta da qualche parte, "Ho capito" diventa l'azione
            secondaria; senza, resta lui il bottone pieno — come è sempre stato
            per le release annunciate a lista puntata. */}
        <div className="px-[22px] pt-[18px] pb-[22px] flex flex-col gap-2.5">
          {primaryAction ? (
            <>
              <button type="button"
                onClick={() => { onClose(); navigate(primaryAction.to); }}
                className="w-full rounded-[18px] cta-gold-fill py-3.5 text-[14.5px] font-semibold
                           active:scale-[0.98] transition-transform">
                {primaryAction.label}
              </button>
              <button type="button" onClick={onClose}
                className="w-full py-2.5 text-[13.5px] font-medium text-secondary">
                Ho capito
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose}
              className="w-full rounded-[18px] cta-gold-fill py-3.5 text-[14.5px] font-semibold
                         active:scale-[0.98] transition-transform">
              Ho capito
            </button>
          )}
          <button type="button"
            onClick={() => { onClose(); navigate('/settings?section=versioni'); }}
            className="w-full text-[11.5px] text-tertiary">
            Tutte le novità nel registro versioni
          </button>
        </div>
      </div>
    </div>
  );
}
