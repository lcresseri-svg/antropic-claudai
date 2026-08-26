import { useState, useEffect } from 'react';
import { CategoryDef } from '../../types';
import { formatCurrency, formatDate } from '../../utils';
import { SheetShell, AmountBlock, EffectCard, parseNum } from './SheetShell';

interface Props {
  open: boolean;
  category: CategoryDef | null;
  deposited: number; // versato netto della categoria
  onSave: (value: number) => void;
  onClose: () => void;
}

/**
 * Controvalore di una posizione.
 *
 * La plus/minusvalenza latente sale a numero grande: è il motivo per cui si
 * apre questa sheet. E la nota di chiusura dice l'unica cosa che si può
 * fraintendere — aggiornare il controvalore non è un movimento: cambia il
 * patrimonio, non la liquidità né le uscite del mese.
 */
export function SetCurrentValueSheet({ open, category, deposited, onSave, onClose }: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue(category?.currentValue != null ? String(category.currentValue) : '');
  }, [open, category]);

  if (!category) return null;
  const parsed = parseNum(value);
  const touched = parsed > 0 || value !== '';
  const delta = touched ? parsed - deposited : null;
  const pct = delta != null && deposited > 0 ? (delta / deposited) * 100 : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (parsed < 0) return;
    onSave(parsed);
    onClose();
  };

  return (
    <SheetShell open={open} onClose={onClose}
      title={`Controvalore · ${category.label}`}
      subtitle={category.lastValueUpdate
        ? `Ultimo aggiornamento: ${formatDate(category.lastValueUpdate)}`
        : 'Mai aggiornato'}>
      <form onSubmit={submit} className="space-y-3">
        <AmountBlock label="Controvalore attuale" value={value} onChange={setValue} autoFocus />

        <div className="glass-card rounded-[18px] px-4 py-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-secondary">Versato netto</span>
            <span className="text-[13.5px] font-semibold text-primary balance-num">{formatCurrency(deposited)}</span>
          </div>
          {delta != null && (
            <div className="mt-2.5 pt-2.5 border-t border-divider">
              <p className="label-caps text-secondary mb-1">
                {delta >= 0 ? 'Plus latente' : 'Minus latente'}
              </p>
              <p className={`text-[19px] font-bold balance-num ${delta >= 0 ? 'text-green' : 'text-red'}`}>
                {delta >= 0 ? '+' : '−'}{formatCurrency(Math.abs(delta))}
                {pct != null && (
                  <span className="text-[13px] font-semibold ml-1.5">
                    ({delta >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1).replace('.', ',')}%)
                  </span>
                )}
              </p>
            </div>
          )}
        </div>

        <EffectCard>
          Il patrimonio netto passa a riflettere questo valore. Non è un movimento:{' '}
          <span className="font-semibold text-primary">nessun conto viene toccato</span>, la liquidità
          resta quella di prima e il mese non registra né entrate né uscite.
        </EffectCard>

        <button type="submit"
          className="w-full py-3.5 rounded-2xl cta-gold-fill text-[14px] font-semibold transition-transform active:scale-[0.98]">
          Salva controvalore
        </button>
      </form>
    </SheetShell>
  );
}
