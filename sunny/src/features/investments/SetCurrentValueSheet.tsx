import { useState, useEffect } from 'react';
import { CategoryDef } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { SheetShell, Field, EuroInput, parseNum } from './SheetShell';

interface Props {
  open: boolean;
  category: CategoryDef | null;
  deposited: number; // versato netto della categoria
  onSave: (value: number) => void;
  onClose: () => void;
}

/** Bottom sheet to set/update an investment category's market value. */
export function SetCurrentValueSheet({ open, category, deposited, onSave, onClose }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(category?.currentValue != null ? String(category.currentValue) : '');
  }, [open, category]);

  if (!category) return null;
  const parsed = parseNum(value);
  const delta = parsed > 0 || value !== '' ? parsed - deposited : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed < 0) return;
    onSave(parsed);
    onClose();
  };

  return (
    <SheetShell open={open} title={`Controvalore · ${category.label}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Controvalore attuale (€)">
          <EuroInput value={value} onChange={setValue} autoFocus />
        </Field>

        <div className="bg-elevated rounded-2xl px-4 py-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-secondary">Versato netto</span>
            <span className="font-semibold text-primary balance-num">{formatCurrency(deposited)}</span>
          </div>
          {delta != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-secondary">Plus/minus latente</span>
              <span className="font-semibold balance-num" style={{ color: delta >= 0 ? '#8FB89A' : '#E05555' }}>
                {delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(delta))}
                {deposited > 0 && ` (${delta >= 0 ? '+' : '−'}${Math.abs((delta / deposited) * 100).toFixed(1)}%)`}
              </span>
            </div>
          )}
        </div>

        {category.lastValueUpdate && (
          <p className="text-[11px] text-secondary px-1">Aggiornato il {formatDate(category.lastValueUpdate)}</p>
        )}

        <button type="submit"
          className="w-full py-3 rounded-2xl font-semibold transition-transform active:scale-[0.98]"
          style={{ backgroundColor: 'var(--accent-hi)', color: 'var(--accent-on)' }}>
          Salva controvalore
        </button>
      </form>
    </SheetShell>
  );
}
