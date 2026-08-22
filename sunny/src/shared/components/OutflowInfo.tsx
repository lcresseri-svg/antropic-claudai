import { useRef, useState } from 'react';
import { formatCurrency } from '../../utils';

export interface FlowInfoLine {
  label: string;
  value: number;
  valueClass?: string;
  /** Render as "+/−" signed value instead of plain. */
  signed?: boolean;
}

/** Larghezza del pannello (w-52) — serve a decidere da che lato aprirlo. */
export const PANEL_W = 208;
/** Margine minimo dal bordo dello schermo. */
export const EDGE_GAP = 12;

/** Lato di ancoraggio: 'left' = si apre verso destra, 'right' = verso sinistra. */
export type PopoverAnchor = 'left' | 'right';

/**
 * Sceglie da che lato aprire il pannello: verso destra se c'è spazio, altrimenti
 * verso sinistra. Puro e testabile — il ⓘ sta spesso subito prima di un importo
 * allineato a destra, quindi vicino al bordo dello schermo.
 */
export function pickAnchor(iconLeft: number, viewportWidth: number): PopoverAnchor {
  return viewportWidth - iconLeft - EDGE_GAP >= PANEL_W ? 'left' : 'right';
}

/**
 * Small ⓘ button opening a tiny popover that breaks a flow total down into its
 * components (e.g. "Uscite" → spese + investimenti dai conti, "Entrate" →
 * entrate ordinarie + apporti esterni + rientri, TFR escluso…).
 *
 * Self-contained: a fixed backdrop closes it on outside-tap, and clicks are
 * stopped from bubbling so it works inside clickable cards / group headers.
 * The panel opens to the RIGHT by default and flips to the LEFT when there
 * isn't room (the ⓘ often sits just before a right-aligned amount).
 */
export function OutflowInfo({ lines, ariaLabel = 'Dettaglio', className = '' }: {
  lines: FlowInfoLine[];
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // 'left' = pannello ancorato a sinistra (si apre verso destra) e viceversa.
  const [anchor, setAnchor] = useState<PopoverAnchor>('left');
  const btnRef = useRef<HTMLButtonElement>(null);
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };

  // Decide il lato guardando lo spazio reale a destra dell'icona.
  const toggle = () => {
    setOpen(o => {
      if (o) return false;
      const rect = btnRef.current?.getBoundingClientRect();
      if (rect) setAnchor(pickAnchor(rect.left, window.innerWidth));
      return true;
    });
  };

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        onClick={e => { stop(e); toggle(); }}
        className="relative text-secondary/60 hover:text-secondary transition-colors"
      >
        {/* Invisible larger tap target: the visible icon stays 13px (no layout
            shift) but taps within this wider area still land on the ⓘ instead
            of falling through to a card-wide "apri" button underneath it. */}
        <span className="absolute -inset-2.5" aria-hidden="true" />
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {open && (
        <>
          {/* pointer-events-auto esplicito: l'host può disattivare i puntatori
              sul contenuto (le card del mese lo fanno per non far navigare i
              tap), e senza questo il velo non riceverebbe il tap → il popover
              resterebbe aperto finché non si ripreme sull'icona. */}
          <div className="fixed inset-0 z-40 pointer-events-auto" onClick={e => { stop(e); setOpen(false); }} />
          {/* normal-case + tracking-normal: the popover must stay readable even
              when rendered inside a caps/spaced label (never inherit uppercase). */}
          <div onClick={stop}
            className={`absolute z-50 top-full mt-1.5 w-52 max-w-[calc(100vw-2rem)] bg-elevated rounded-xl shadow-float p-3 space-y-2 text-left normal-case tracking-normal font-normal pointer-events-auto ${
              anchor === 'left' ? 'left-0' : 'right-0'
            }`}>
            {lines.map(l => (
              <div key={l.label} className="flex items-center justify-between gap-3">
                <span className="text-xs text-secondary">{l.label}</span>
                <span className={`text-xs font-semibold balance-num whitespace-nowrap ${l.valueClass ?? 'text-primary'}`}>
                  {formatCurrency(l.value, l.signed ? { sign: true } : undefined)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
