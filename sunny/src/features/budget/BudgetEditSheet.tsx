import { useState, useEffect } from 'react';
import { CategoryDef } from '../../types';
import { formatCurrency } from '../../utils';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

type Tab = 'savings' | 'income' | 'expenses' | 'investments';

interface Props {
  open: boolean;
  expenseCategories: CategoryDef[];
  incomeCategories: CategoryDef[];
  investmentCategories: CategoryDef[];
  savingsTarget: number;
  categoryBudgets: Record<string, number>;
  incomeBudgets: Record<string, number>;
  investmentBudgets: Record<string, number>;
  defaultTab?: Tab;
  focusCategory?: string | null;
  onSetTarget: (n: number) => void;
  onSetCategory: (catId: string, n: number) => void;
  onSetIncome: (catId: string, n: number) => void;
  onSetInvestment: (catId: string, n: number) => void;
  hasBudget?: boolean;
  onResetAll?: () => void;
  onClose: () => void;
}

const TARGET_PRESETS = [100, 300, 500];
const TABS: { id: Tab; label: string }[] = [
  { id: 'savings',     label: 'Risparmio' },
  { id: 'income',      label: 'Entrate'   },
  { id: 'expenses',    label: 'Uscite'    },
  { id: 'investments', label: 'Investim.' },
];

export function BudgetEditSheet({
  open, expenseCategories, incomeCategories, investmentCategories,
  savingsTarget, categoryBudgets, incomeBudgets, investmentBudgets,
  defaultTab = 'expenses', focusCategory,
  onSetTarget, onSetCategory, onSetIncome, onSetInvestment, hasBudget, onResetAll, onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [customTarget, setCustomTarget] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  // Bumped on reset to remount the uncontrolled inputs so they show the
  // cleared (empty) values instead of their stale defaultValue.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTab(defaultTab);
    setCustomTarget(TARGET_PRESETS.includes(savingsTarget) ? '' : String(savingsTarget));
    setConfirmReset(false);
  }, [open, defaultTab, savingsTarget]);

  useEscapeKey(onClose, open);

  if (!open) return null;

  const isPreset = TARGET_PRESETS.includes(savingsTarget);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl shadow-float animate-sheet-up max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h3 className="text-base font-semibold text-primary">Modifica budget</h3>
          {/* Closing is finicky on iOS: with the number keyboard open, the tap
              first dismisses it and shifts this bottom-anchored sheet, so a normal
              click lands off the moved button. We fire on pointer-down (before the
              shift) and preventDefault so focus isn't stolen mid-tap; a click
              fallback covers any device that doesn't deliver pointer events. */}
          <button type="button" aria-label="Chiudi"
            onPointerDown={e => { e.preventDefault(); onClose(); }}
            onClick={onClose}
            className="w-10 h-10 -mr-1.5 rounded-full bg-elevated flex items-center justify-center text-secondary text-base active:scale-90 transition-transform">✕</button>
        </div>

        {/* Tabs */}
        <div className="px-6 pb-3 shrink-0">
          <div className="flex bg-elevated rounded-2xl p-1 gap-0.5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 rounded-xl text-[11px] font-semibold transition-all ${
                  tab === t.id ? 'bg-card text-primary' : 'text-secondary'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto overscroll-contain scrollbar-hide px-6 pb-6 flex-1">
          {tab === 'savings' && (
            <>
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
              <p className="text-[11px] text-secondary/60 mt-2 px-1">
                Entrate pianificate meno uscite e investimenti.
              </p>
            </>
          )}

          {tab === 'income' && (
            <>
              <p className="label-caps text-secondary mb-1">Entrate mensili previste</p>
              <p className="text-[11px] text-secondary/60 mb-4 px-0.5">Quanto ti aspetti di ricevere per ogni fonte questo mese.</p>
              <CategoryInputList
                key={`inc-${resetKey}`}
                categories={incomeCategories}
                budgets={incomeBudgets}
                focusId={focusCategory ?? null}
                onChange={onSetIncome}
              />
              {incomeCategories.length === 0 && (
                <p className="text-[13px] text-secondary text-center py-8">Nessuna categoria entrate. Aggiungila dalle impostazioni.</p>
              )}
            </>
          )}

          {tab === 'expenses' && (
            <>
              <p className="label-caps text-secondary mb-3">Limite mensile per categoria</p>
              <CategoryInputList
                key={`exp-${resetKey}`}
                categories={expenseCategories}
                budgets={categoryBudgets}
                focusId={focusCategory ?? null}
                onChange={onSetCategory}
              />
            </>
          )}

          {tab === 'investments' && (
            <>
              <p className="label-caps text-secondary mb-1">Investimenti mensili pianificati</p>
              <p className="text-[11px] text-secondary/60 mb-4 px-0.5">Quanto vuoi destinare a ogni tipo di investimento questo mese.</p>
              <CategoryInputList
                key={`inv-${resetKey}`}
                categories={investmentCategories}
                budgets={investmentBudgets}
                focusId={focusCategory ?? null}
                onChange={onSetInvestment}
              />
              {investmentCategories.length === 0 && (
                <p className="text-[13px] text-secondary text-center py-8">Nessuna categoria investimenti. Aggiungila dalle impostazioni.</p>
              )}
            </>
          )}

          <button onClick={onClose}
            className="w-full mt-6 py-3 rounded-xl glass-cta-gold text-sm font-semibold">
            Fine
          </button>

          {hasBudget && onResetAll && (
            confirmReset ? (
              <button
                onClick={() => { onResetAll(); setResetKey(k => k + 1); setConfirmReset(false); }}
                className="w-full mt-2 py-3 rounded-xl text-sm font-semibold text-[#E08B8B] bg-[#E08B8B]/15">
                Conferma: azzera tutto il budget
              </button>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                className="w-full mt-2 py-3 rounded-xl text-sm font-medium text-secondary bg-elevated">
                Azzera budget
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function CategoryInputList({ categories, budgets, focusId, onChange }: {
  categories: CategoryDef[];
  budgets: Record<string, number>;
  focusId: string | null;
  onChange: (id: string, n: number) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {categories.map(c => (
        <li key={c.id}
          className={`flex items-center gap-2.5 rounded-xl px-1 ${focusId === c.id ? 'ring-1 ring-gold/40 bg-elevated py-1' : ''}`}>
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
                onChange(c.id, isNaN(n) ? 0 : n);
              }}
              className="w-full bg-elevated rounded-xl pl-7 pr-3 py-2 text-primary text-sm text-right outline-none balance-num"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
