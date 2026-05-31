import { useState, useEffect } from 'react';
import { CategoryDef } from '../../types';
import { formatCurrency } from '../../utils';

interface Props {
  open: boolean;
  categories: CategoryDef[];
  savingsTarget: number;
  budgets: Record<string, number>;
  focusCategory?: string | null;
  onSetTarget: (n: number) => void;
  onSetCategory: (catId: string, n: number) => void;
  onClose: () => void;
}

const TARGET_PRESETS = [100, 300, 500];

export function BudgetEditSheet({
  open, categories, savingsTarget, budgets, focusCategory,
  onSetTarget, onSetCategory, onClose,
}: Props) {
  const [customTarget, setCustomTarget] = useState('');

  useEffect(() => {
    if (open) setCustomTarget(TARGET_PRESETS.includes(savingsTarget) ? '' : String(savingsTarget));
  }, [open, savingsTarget]);

  if (!open) return null;

  const isPreset = TARGET_PRESETS.includes(savingsTarget);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up max-h-[85vh] flex flex-col">

        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <h3 className="text-base font-semibold text-primary">Modifica budget</h3>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary text-sm">✕</button>
        </div>

        <div className="overflow-y-auto scrollbar-hide px-6 pb-6">
          {/* Savings target */}
          <p className="label-caps text-secondary mb-3">Quanto vuoi risparmiare questo mese?</p>
          <div className="flex gap-2 mb-3">
            {TARGET_PRESETS.map(v => (
              <button key={v} onClick={() => { setCustomTarget(''); onSetTarget(v); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                  isPreset && savingsTarget === v ? 'glass-cta-gold' : 'bg-elevated text-secondary'
                }`}>
                {formatCurrency(v)}
              </button>
            ))}
          </div>
          <input
            type="number" inputMode="numeric" placeholder="Personalizzato (€)"
            value={customTarget}
            onChange={e => {
              setCustomTarget(e.target.value);
              const n = parseFloat(e.target.value);
              if (!isNaN(n)) onSetTarget(n);
            }}
            className="w-full bg-elevated rounded-xl px-3.5 py-2.5 text-primary text-sm outline-none balance-num"
          />

          {/* Category budgets */}
          <p className="label-caps text-secondary mt-6 mb-3">Budget per categoria</p>
          <ul className="space-y-2.5">
            {categories.map(c => (
              <li key={c.id}
                className={`flex items-center gap-2.5 rounded-xl px-1 ${focusCategory === c.id ? 'ring-1 ring-gold/40 bg-elevated py-1' : ''}`}>
                <span className="w-7 h-7 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                  style={{ backgroundColor: c.color + '18' }}>{c.icon}</span>
                <span className="text-[13px] text-primary flex-1 truncate">{c.label}</span>
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                  <input
                    type="number" inputMode="numeric" placeholder="0"
                    defaultValue={budgets[c.id] || ''}
                    onChange={e => {
                      const n = parseFloat(e.target.value);
                      onSetCategory(c.id, isNaN(n) ? 0 : n);
                    }}
                    className="w-full bg-elevated rounded-xl pl-7 pr-3 py-2 text-primary text-sm text-right outline-none balance-num"
                  />
                </div>
              </li>
            ))}
          </ul>

          <button onClick={onClose}
            className="w-full mt-6 py-3 rounded-xl glass-cta-gold text-sm font-semibold">
            Fine
          </button>
        </div>
      </div>
    </div>
  );
}
