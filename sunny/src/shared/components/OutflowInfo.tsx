import { useState } from 'react';
import { formatCurrency } from '../../utils';

export interface FlowInfoLine {
  label: string;
  value: number;
  valueClass?: string;
  /** Render as "+/−" signed value instead of plain. */
  signed?: boolean;
}

/**
 * Small ⓘ button opening a tiny popover that breaks a flow total down into its
 * components (e.g. "Uscite" → spese + investimenti dai conti, "Entrate" →
 * entrate ordinarie + apporti esterni + rientri, TFR escluso…).
 *
 * Self-contained: a fixed backdrop closes it on outside-tap, and clicks are
 * stopped from bubbling so it works inside clickable cards / group headers.
 */
export function OutflowInfo({ lines, ariaLabel = 'Dettaglio', className = '' }: {
  lines: FlowInfoLine[];
  ariaLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={e => { stop(e); setOpen(o => !o); }}
        className="text-secondary/60 hover:text-secondary transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={e => { stop(e); setOpen(false); }} />
          <div onClick={stop}
            className="absolute z-50 top-full right-0 mt-1.5 w-52 bg-elevated rounded-xl shadow-float p-3 space-y-2 text-left">
            {lines.map(l => (
              <div key={l.label} className="flex items-center justify-between gap-3">
                <span className="text-xs text-secondary">{l.label}</span>
                <span className={`text-xs font-semibold balance-num ${l.valueClass ?? 'text-primary'}`}>
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
