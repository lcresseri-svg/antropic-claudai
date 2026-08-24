// "Riordina" — l'utente decide in che ordine vedere i blocchi della home.
//
// Frecce su/giù invece del trascinamento: su una lista di quattro voci il drag
// costa più di quel che rende (e con VoiceOver o una tastiera non è usabile),
// mentre due bottoni funzionano ovunque e dicono da soli cosa fanno.
//
// L'hero non compare in lista: è la risposta alla domanda della schermata e
// resta in cima. La sheet lo dice, invece di lasciarlo intuire.

import { useState, useEffect } from 'react';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import {
  HomeBlockId, HOME_BLOCKS, DEFAULT_HOME_ORDER, moveBlock, isDefaultOrder,
} from './homeOrder';

interface Props {
  open: boolean;
  order: HomeBlockId[];
  onSave: (order: HomeBlockId[]) => void;
  onClose: () => void;
}

const LABEL = new Map(HOME_BLOCKS.map(b => [b.id, b]));

export function ReorderHomeSheet({ open, order, onSave, onClose }: Props) {
  // Bozza locale: si riordina liberamente e si salva alla chiusura, così
  // ogni freccia non è una scrittura su Firestore.
  const [draft, setDraft] = useState<HomeBlockId[]>(order);

  useEffect(() => { if (open) setDraft(order); }, [open, order]);

  const close = () => {
    if (!isDefaultOrder(draft) || !isDefaultOrder(order)) onSave(draft);
    onClose();
  };

  useEscapeKey(close, open);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      role="dialog" aria-modal="true" aria-label="Riordina la home"
      onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up
                      max-h-[85dvh] flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-primary">Riordina la home</h3>
            <p className="text-[11.5px] text-tertiary mt-0.5">
              La liquidità libera resta sempre in cima.
            </p>
          </div>
          <button type="button" aria-label="Chiudi" onClick={close}
            className="w-11 h-11 -mr-2 rounded-full bg-elevated flex items-center justify-center text-secondary text-base active:scale-90 transition-transform flex-none">
            ✕
          </button>
        </div>

        <ul className="px-5 pb-2 overflow-y-auto overscroll-contain">
          {draft.map((id, i) => {
            const meta = LABEL.get(id);
            if (!meta) return null;
            return (
              <li key={id} className="flex items-center gap-3 py-2.5 border-b border-divider last:border-0">
                <span className="balance-num text-[12px] font-semibold text-tertiary w-4 flex-none">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] text-primary truncate">{meta.label}</span>
                  <span className="block text-[11.5px] text-tertiary truncate">{meta.hint}</span>
                </span>
                <span className="flex items-center gap-1 flex-none">
                  <MoveBtn dir="up" disabled={i === 0}
                    label={`Sposta ${meta.label} in su`}
                    onClick={() => setDraft(d => moveBlock(d, id, -1))} />
                  <MoveBtn dir="down" disabled={i === draft.length - 1}
                    label={`Sposta ${meta.label} in giù`}
                    onClick={() => setDraft(d => moveBlock(d, id, 1))} />
                </span>
              </li>
            );
          })}
        </ul>

        <div className="px-5 pt-3 pb-5 shrink-0 space-y-2">
          <button type="button" onClick={close}
            className="w-full py-3 rounded-2xl cta-gold-fill text-sm font-semibold active:scale-[0.98] transition-transform">
            Fatto
          </button>
          {!isDefaultOrder(draft) && (
            <button type="button" onClick={() => setDraft([...DEFAULT_HOME_ORDER])}
              className="w-full py-2.5 text-[13px] font-medium text-secondary">
              Ripristina l'ordine originale
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MoveBtn({ dir, disabled, label, onClick }: {
  dir: 'up' | 'down'; disabled: boolean; label: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label}
      className="w-9 h-9 rounded-xl bg-elevated flex items-center justify-center text-secondary
                 disabled:opacity-30 active:scale-90 transition-transform">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" className={dir === 'up' ? 'rotate-180' : ''}>
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
