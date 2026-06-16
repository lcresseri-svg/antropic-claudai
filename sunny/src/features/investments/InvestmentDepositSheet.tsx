import { useState, useEffect } from 'react';
import { Transaction, RecurrenceRule } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { expandRecurringOnCreate } from '../../shared/recurrence';
import { formatDate } from '../../utils';
import { buildInvestmentDeposit } from './investmentTransactionBuilder';
import { SheetShell, Field, EuroInput, Select, parseNum } from './SheetShell';

interface Props {
  open: boolean;
  preselectCategory?: string;
  onSave: (txs: Omit<Transaction, 'id'>[]) => void;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** "Versa" — investment deposit form. Same logic as the historical
 *  TransactionModal investment path, via buildInvestmentDeposit. */
export function InvestmentDepositSheet({ open, preselectCategory, onSave, onClose }: Props) {
  const { categories, accounts, detailedInvestments } = useSettings();
  const investCats = categories.filter(c => c.kind === 'investment');

  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [account, setAccount] = useState('');
  const [fee, setFee] = useState('');
  const [tfr, setTfr] = useState('');
  const [notes, setNotes] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFreq, setRecurringFreq] = useState<RecurrenceRule['freq']>('monthly');
  const [recurringUntil, setRecurringUntil] = useState('');
  const [amountError, setAmountError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const lastAcc = localStorage.getItem('sunny:lastAccount');
    setCategory(preselectCategory && investCats.some(c => c.id === preselectCategory)
      ? preselectCategory : (investCats[0]?.id ?? ''));
    setAmount(''); setDate(today());
    setAccount((lastAcc && accounts.some(a => a.id === lastAcc)) ? lastAcc : (accounts[0]?.id ?? ''));
    setFee(''); setTfr(''); setNotes('');
    setIsRecurring(false); setRecurringFreq('monthly'); setRecurringUntil('');
    setAmountError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selCat = investCats.find(c => c.id === category);
  const isPension = detailedInvestments && selCat?.fundType === 'pension';
  const canNoAccount = detailedInvestments;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseNum(amount);
    if (!value || value <= 0) { setAmountError(true); return; }
    if (!category) return;

    const recurring: RecurrenceRule | undefined = isRecurring
      ? { freq: recurringFreq, until: recurringUntil || undefined }
      : undefined;
    const seriesId = isRecurring ? crypto.randomUUID() : undefined;

    const txs = buildInvestmentDeposit({
      category, amount: value, date, account,
      categoryLabel: selCat?.label,
      notes: notes || undefined,
      fee: parseNum(fee) || undefined,
      tfr: isPension ? parseNum(tfr) || undefined : undefined,
      recurring, seriesId,
    });
    // Past-dated recurring series: materialize overdue occurrences right away.
    const todayISO = today();
    onSave(txs.flatMap(d => expandRecurringOnCreate(d, todayISO)));
    if (account) try { localStorage.setItem('sunny:lastAccount', account); } catch { /* ignore */ }
    onClose();
  };

  return (
    <SheetShell open={open} title="Versa" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 sm:space-y-4">
        <Field label="Categoria">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {investCats.map(c => {
              const sel = category === c.id;
              return (
                <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                  className={`w-full px-2 py-2 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 truncate ${sel ? 'shadow-sm' : 'bg-surface text-secondary'}`}
                  style={sel ? { backgroundColor: c.color, color: '#0D0D0D' } : undefined}>
                  <span className="flex-shrink-0">{c.icon}</span>
                  <span className="truncate">{c.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Importo (€)">
          <EuroInput value={amount} onChange={v => { setAmount(v); setAmountError(false); }} autoFocus />
          {amountError && <p className="text-xs mt-1 text-red">Inserisci un importo valido</p>}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Conto sorgente">
            <Select value={account} onChange={setAccount}
              options={[
                ...(canNoAccount ? [{ value: '', label: '🚫 Senza conto (TFR / datore)' }] : []),
                ...accounts.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` })),
              ]} />
          </Field>
          <Field label="Data">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-2xl px-4 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40" />
          </Field>
        </div>

        {canNoAccount && account === '' && (
          <p className="text-[11px] text-secondary -mt-1 px-1 leading-snug">
            Questo versamento non esce da nessun conto: aumenta il capitale investito senza intaccare la liquidità.
          </p>
        )}

        {isPension && (
          <Field label="Di cui TFR (facoltativo)">
            <EuroInput value={tfr} onChange={setTfr} />
            <p className="text-[11px] mt-1.5 px-1 text-secondary">Quanta parte di questo versamento proviene dal TFR.</p>
          </Field>
        )}

        {account !== '' && (
          <Field label="Commissione (opzionale)">
            <EuroInput value={fee} onChange={setFee} />
            <p className={`text-[11px] mt-1.5 px-1 ${parseNum(fee) > 0 ? 'text-secondary' : 'invisible'}`}>
              Registrata come spesa separata in "Altro"
            </p>
          </Field>
        )}

        {/* Ricorrente */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <button type="button" onClick={() => setIsRecurring(r => !r)}
            className="w-full flex items-center justify-between px-4 py-3 text-left">
            <div>
              <p className="text-sm font-medium text-primary">Ricorrente</p>
              <p className="text-xs text-secondary mt-0.5">Si ripete nel tempo — es. un PAC mensile</p>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-3 ${isRecurring ? 'bg-gold' : 'bg-secondary/20'}`}>
              <span className={`absolute left-0 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isRecurring ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>
          {isRecurring && (
            <div className="border-t border-white/[0.06] px-4 pb-4 pt-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-secondary mb-2 block">Frequenza</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setRecurringFreq(f)}
                      className={`py-2 rounded-xl text-xs font-semibold transition-colors ${recurringFreq === f ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>
                      {f === 'daily' ? 'Ogni giorno' : f === 'weekly' ? 'Ogni settimana' : f === 'monthly' ? 'Ogni mese' : 'Ogni anno'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-secondary mb-1.5 block">Fine ricorrenza</label>
                <input type="date" value={recurringUntil} onChange={e => setRecurringUntil(e.target.value)}
                  className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40" />
                {recurringUntil && (
                  <p className="text-[11px] mt-1.5 px-1 text-secondary">Si ripete fino al {formatDate(recurringUntil)}, poi smette</p>
                )}
              </div>
            </div>
          )}
        </div>

        <Field label="Note (opzionale)">
          <input type="text" value={notes} maxLength={80} onChange={e => setNotes(e.target.value)}
            className="w-full bg-elevated rounded-2xl px-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
        </Field>

        <button type="submit"
          className="w-full py-3 rounded-2xl font-semibold transition-transform active:scale-[0.98]"
          style={{ backgroundColor: 'var(--accent-hi)', color: 'var(--accent-on)' }}>
          Versa
        </button>
      </form>
    </SheetShell>
  );
}
