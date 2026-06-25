import { useState } from 'react';
import { formatCurrency } from '../../utils';

/**
 * Small ⓘ button shown next to an "Uscite" total when investments are counted
 * inside it (see the "Conta gli investimenti nelle uscite" setting). Tapping it
 * opens a tiny popover breaking the total down into spese vs investimenti.
 *
 * Self-contained: a fixed backdrop closes it on outside-tap, and clicks are
 * stopped from bubbling so it works inside clickable cards / group headers.
 */
export function OutflowInfo({ expenses, investments, className = '' }: {
  expenses: number;
  investments: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const stop = (e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); };

  return (
    <span className={`relative inline-flex align-middle ${className}`}>
      <button
        type="button"
        aria-label="Dettaglio uscite"
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
            className="absolute z-50 top-full right-0 mt-1.5 w-44 bg-elevated rounded-xl shadow-float p-3 space-y-2 text-left">
            <Line label="Spese" value={expenses} />
            <Line label="Investimenti" value={investments} valueClass="text-gold" />
          </div>
        </>
      )}
    </span>
  );
}

function Line({ label, value, valueClass = 'text-primary' }: { label: string; value: number; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-secondary">{label}</span>
      <span className={`text-xs font-semibold balance-num ${valueClass}`}>{formatCurrency(value)}</span>
    </div>
  );
}
