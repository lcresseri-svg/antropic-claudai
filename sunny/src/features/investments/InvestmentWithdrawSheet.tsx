import { useState, useEffect } from 'react';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency } from '../../utils';
import { buildInvestmentWithdrawal, WithdrawalResult } from './investmentTransactionBuilder';
import { SheetShell, Field, EuroInput, Select, parseNum } from './SheetShell';

interface Props {
  open: boolean;
  investmentByCategory: Record<string, number>;
  preselectCategory?: string;
  /** Receives the built transactions + the category and entered market value,
   *  so the caller can persist both the txs and the updated currentValue. */
  onSave: (categoryId: string, currentValueEntered: number, result: WithdrawalResult) => void;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** "Disinvesti" — investment withdrawal form (§9: proportional to deposited capital). */
export function InvestmentWithdrawSheet({ open, investmentByCategory, preselectCategory, onSave, onClose }: Props) {
  const { visibleCategories, visibleAccounts } = useSettings();
  // Only (visible) positions with deposited capital can be withdrawn from.
  const investCats = visibleCategories.filter(c => c.kind === 'investment' && (investmentByCategory[c.id] ?? 0) > 0);

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [fee, setFee] = useState('');
  const [feeAccount, setFeeAccount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const selCat = visibleCategories.find(c => c.id === category);
  const deposited = investmentByCategory[category] ?? 0;

  useEffect(() => {
    if (!open) return;
    const first = preselectCategory && investCats.some(c => c.id === preselectCategory)
      ? preselectCategory : (investCats[0]?.id ?? '');
    setCategory(first);
    setAmount(''); setFee(''); setFeeAccount(''); setNotes(''); setError('');
    setDate(today());
    setToAccount(visibleAccounts[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Pre-fill the market value from the category whenever the selection changes.
  useEffect(() => {
    const c = visibleCategories.find(x => x.id === category);
    setCurrentValue(c?.currentValue != null ? String(c.currentValue) : '');
  }, [category, visibleCategories]);

  const amountN = parseNum(amount);
  const cvN = parseNum(currentValue);
  const preview = amountN > 0 && cvN > 0 && deposited > 0
    ? buildInvestmentWithdrawal({
        category, categoryLabel: selCat?.label ?? category,
        amount: amountN, currentValue: cvN, deposited,
        toAccount: toAccount || 'x', date,
      })
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category || deposited <= 0) { setError('Seleziona una categoria con capitale versato.'); return; }
    if (!(cvN > 0)) { setError('Inserisci il controvalore attuale della posizione.'); return; }
    if (!(amountN > 0)) { setError('Inserisci un importo valido.'); return; }
    if (amountN > cvN) { setError('Non puoi disinvestire più del controvalore attuale.'); return; }
    if (!toAccount) { setError('Scegli il conto di destinazione.'); return; }

    const result = buildInvestmentWithdrawal({
      category, categoryLabel: selCat?.label ?? category,
      amount: amountN, currentValue: cvN, deposited,
      toAccount, date,
      fee: parseNum(fee) || undefined,
      feeAccount: feeAccount || undefined,
      notes: notes || undefined,
    });
    onSave(category, cvN, result);
    onClose();
  };

  return (
    <SheetShell open={open} title="Disinvesti" onClose={onClose}>
      {investCats.length === 0 ? (
        <p className="text-sm text-secondary py-6 text-center">Nessuna posizione con capitale versato da disinvestire.</p>
      ) : (
        <form onSubmit={submit} className="space-y-3 sm:space-y-4">
          <Field label="Categoria investimento">
            <Select value={category} onChange={setCategory}
              options={investCats.map(c => ({ value: c.id, label: `${c.icon} ${c.label}` }))} />
            {category && (
              <p className="text-[11px] mt-1.5 px-1 text-secondary">
                Versato {formatCurrency(deposited)}
                {selCat?.currentValue != null && <> · controvalore {formatCurrency(selCat.currentValue)}</>}
              </p>
            )}
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Importo disinvestito (€)">
              <EuroInput value={amount} onChange={v => { setAmount(v); setError(''); }} autoFocus />
            </Field>
            <Field label="Controvalore attuale (€)">
              <EuroInput value={currentValue} onChange={v => { setCurrentValue(v); setError(''); }} />
            </Field>
          </div>

          <Field label="Conto di destinazione">
            <Select value={toAccount} onChange={setToAccount}
              options={visibleAccounts.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Commissione (opzionale)">
              <EuroInput value={fee} onChange={setFee} />
            </Field>
            <Field label="Conto commissione">
              <Select value={feeAccount} onChange={setFeeAccount}
                options={[
                  { value: '', label: 'Stesso conto di destinazione' },
                  ...visibleAccounts.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` })),
                ]} />
            </Field>
          </div>

          <Field label="Data">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-2xl px-4 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40" />
          </Field>

          <Field label="Note (opzionale)">
            <input type="text" value={notes} maxLength={80} onChange={e => setNotes(e.target.value)}
              className="w-full bg-elevated rounded-2xl px-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
          </Field>

          {preview && amountN <= cvN && (
            <div className="bg-elevated rounded-2xl px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">Quota liquidata</span>
                <span className="font-semibold text-primary balance-num">{(preview.quota * 100).toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">Capitale rimborsato</span>
                <span className="font-semibold text-primary balance-num">{formatCurrency(preview.capitaleRimborsato)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">{preview.plusMinus >= 0 ? 'Plusvalenza realizzata' : 'Minusvalenza realizzata'}</span>
                <span className="font-semibold balance-num" style={{ color: preview.plusMinus >= 0 ? '#8FB89A' : '#E05555' }}>
                  {preview.plusMinus >= 0 ? '+' : '−'}{formatCurrency(Math.abs(preview.plusMinus))}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">Nuovo controvalore</span>
                <span className="font-semibold text-primary balance-num">{formatCurrency(preview.newCurrentValue)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red px-1">{error}</p>}

          <button type="submit"
            className="w-full py-3 rounded-2xl font-semibold text-primary transition-transform active:scale-[0.98]"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
            Disinvesti ↓
          </button>
        </form>
      )}
    </SheetShell>
  );
}
