import { ReactNode, useState } from 'react';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

/**
 * Scaffold delle sheet operative — versa, controvalore, storno, serie.
 *
 * Su telefono è una bottom sheet, su desktop una modale centrata da 520px:
 * l'animazione di salita vale solo dove la sheet sale davvero, sopra `sm`
 * diventa una comparsa in scala, che su un mouse è più corretta.
 */
export function SheetShell({ open, title, subtitle, onClose, children }: {
  open: boolean; title: string; subtitle?: ReactNode; onClose: () => void; children: ReactNode;
}) {
  useEscapeKey(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />
      {/* The card is a fixed mask (header stays put); only the content window
          scrolls, and overscroll-contain keeps the scroll from chaining out. */}
      <div className="relative w-full max-w-sm sm:max-w-[520px] glass-elevated rounded-[26px] shadow-float max-h-[88dvh] overflow-hidden flex flex-col animate-sheet-up sm:animate-scale-in">
        <div className="shrink-0 bg-[var(--modal-hdr-bg)] px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-primary truncate">{title}</h2>
            {subtitle && <p className="text-[11.5px] text-tertiary truncate mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Chiudi"
            className="w-[30px] h-[30px] rounded-full bg-elevated flex items-center justify-center text-secondary flex-none">✕</button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-5 sm:px-7 pb-5 sm:pb-7 space-y-3 sm:space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-2 px-1">{label}</label>
      {children}
    </div>
  );
}

export function EuroInput({ value, onChange, placeholder = '0,00', autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
      <input type="text" inputMode="decimal" placeholder={placeholder} value={value} autoFocus={autoFocus}
        onChange={e => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className="w-full bg-elevated rounded-2xl pl-8 pr-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
    </div>
  );
}

export function Select({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-elevated rounded-2xl px-4 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 appearance-none">
      {options.map(o => <option key={o.value} value={o.value} className="bg-elevated">{o.label}</option>)}
    </select>
  );
}

export const parseNum = (s: string): number => parseFloat(s.replace(',', '.')) || 0;

/**
 * L'importo è il protagonista della sheet, non un campo come gli altri.
 *
 * Prima era un input da 14px in mezzo a categoria, conto e data: la cosa che
 * si sta davvero decidendo aveva lo stesso peso tipografico del conto da cui
 * esce. Qui diventa un blocco a sé con il numero a 34px.
 */
export function AmountBlock({ label, value, onChange, autoFocus, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  autoFocus?: boolean; hint?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] px-4 py-3.5" style={{ background: 'rgb(var(--c-card))' }}>
      <label className="label-caps text-secondary block mb-1.5">{label}</label>
      <div className="flex items-baseline gap-1.5">
        <input type="text" inputMode="decimal" placeholder="0" value={value} autoFocus={autoFocus}
          aria-label={label}
          onChange={e => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          className="flex-1 min-w-0 bg-transparent text-[34px] leading-none font-bold text-primary
                     outline-none balance-num placeholder:text-divider" />
        <span className="text-[20px] font-semibold text-secondary flex-none">€</span>
      </div>
      {hint && <p className="text-[11.5px] text-secondary mt-2 leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * Riga di un'opzione che quasi nessuno tocca — commissione, TFR, nota,
 * distribuzione statistica. Chiusa mostra il valore corrente, così si sa cosa
 * c'è dentro senza aprirla; aperta è il campo di sempre.
 */
export function OptionRow({ label, value, children, defaultOpen }: {
  label: string; value: string; children: ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-divider last:border-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="row-tap w-full flex items-center justify-between gap-3 px-3.5 text-left">
        <span className="text-[13.5px] text-primary">{label}</span>
        <span className="flex items-center gap-1.5 flex-none">
          <span className="text-[12.5px] text-secondary">{value}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round"
            className={`text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  );
}

/** Contenitore delle opzioni rare. */
export function OptionList({ children }: { children: ReactNode }) {
  return <div className="glass-card rounded-[18px] overflow-hidden">{children}</div>;
}

/**
 * Cosa cambia davvero premendo il CTA.
 *
 * Una sheet che scrive su conti, capitale investito e liquidità libera non può
 * chiedere conferma senza dire quali: il costo di sbagliare è un movimento da
 * cercare e cancellare a mano.
 */
export function EffectCard({ children }: { children: ReactNode }) {
  return (
    <div className="accent-card rounded-[18px] p-3.5">
      <p className="label-caps text-gold mb-1.5">Cosa succede al salvataggio</p>
      <p className="text-[13px] text-secondary leading-[1.6]">{children}</p>
    </div>
  );
}
