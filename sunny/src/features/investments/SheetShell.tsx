import { ReactNode } from 'react';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

/** Bottom-sheet scaffold shared by the investment sheets — same dark premium
 *  glass style as the transaction modal. */
export function SheetShell({ open, title, onClose, children }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  useEscapeKey(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />
      <div className="relative w-full max-w-sm sm:max-w-lg glass-elevated rounded-3xl shadow-float max-h-[88vh] overflow-y-auto scrollbar-hide animate-sheet-up">
        <div className="sticky top-0 bg-[var(--modal-hdr-bg)] backdrop-blur-xl z-10 px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary">✕</button>
        </div>
        <div className="px-5 sm:px-7 pb-5 sm:pb-7 space-y-3 sm:space-y-4">{children}</div>
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
