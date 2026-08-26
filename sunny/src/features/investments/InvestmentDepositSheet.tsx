import { useState, useEffect } from 'react';
import { Transaction, RecurrenceRule } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { expandRecurringOnCreate } from '../../shared/recurrence';
import { formatDate, formatCurrency } from '../../utils';
import { buildInvestmentDeposit } from './investmentTransactionBuilder';
import { STATS_SPREAD_MIN, STATS_SPREAD_MAX } from './investmentStatsSpread';
import { SheetShell, Field, EuroInput, Select, AmountBlock, OptionList, OptionRow, EffectCard, parseNum } from './SheetShell';

interface Props {
  open: boolean;
  preselectCategory?: string;
  /** MUST resolve only after the atomic commit (movement + controvalore):
   *  the sheet stays open with a Retry on failure — no partial states. */
  onSave: (txs: Omit<Transaction, 'id'>[]) => Promise<void> | void;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Options for the statistical spread of a one-off deposit. */
export const SPREAD_CHOICES: { value: number | 'none' | 'custom'; label: string }[] = [
  { value: 'none', label: 'Nessuna' },
  { value: 3, label: '3 mesi' },
  { value: 6, label: '6 mesi' },
  { value: 12, label: '12 mesi' },
  { value: 'custom', label: 'Personalizzata' },
];

/** "Versa" — investment deposit form. Same logic as the historical
 *  TransactionModal investment path, via buildInvestmentDeposit. */
export function InvestmentDepositSheet({ open, preselectCategory, onSave, onClose }: Props) {
  const { visibleCategories, visibleAccounts, detailedInvestments } = useSettings();
  const investCats = visibleCategories.filter(c => c.kind === 'investment');

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
  const [spreadChoice, setSpreadChoice] = useState<'none' | 'custom' | number>('none');
  const [spreadCustom, setSpreadCustom] = useState('');
  const [amountError, setAmountError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (!open) return;
    const lastAcc = localStorage.getItem('sunny:lastAccount');
    setCategory(preselectCategory && investCats.some(c => c.id === preselectCategory)
      ? preselectCategory : (investCats[0]?.id ?? ''));
    setAmount(''); setDate(today());
    setAccount((lastAcc && visibleAccounts.some(a => a.id === lastAcc)) ? lastAcc : (visibleAccounts[0]?.id ?? ''));
    setFee(''); setTfr(''); setNotes('');
    setIsRecurring(false); setRecurringFreq('monthly'); setRecurringUntil('');
    setSpreadChoice('none'); setSpreadCustom('');
    setAmountError(false); setSaving(false); setSaveError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selCat = investCats.find(c => c.id === category);
  const isPension = detailedInvestments && selCat?.fundType === 'pension';
  const canNoAccount = detailedInvestments;

  // Statistical spread: one-off deposits only (recurring series are excluded).
  const spreadMonths = ((): number | undefined => {
    if (isRecurring) return undefined;
    if (spreadChoice === 'none') return undefined;
    const n = spreadChoice === 'custom' ? parseInt(spreadCustom, 10) : spreadChoice;
    return Number.isInteger(n) && n >= STATS_SPREAD_MIN && n <= STATS_SPREAD_MAX ? n : undefined;
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // no double submit
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
      statsSpreadMonths: spreadMonths,
    });
    // Past-dated recurring series: materialize overdue occurrences right away.
    const todayISO = today();
    const docs = txs.flatMap(d => expandRecurringOnCreate(d, todayISO));

    setSaving(true);
    setSaveError(false);
    try {
      await onSave(docs);
      if (account) try { localStorage.setItem('sunny:lastAccount', account); } catch { /* ignore */ }
      onClose(); // only after the atomic commit
    } catch {
      // Nothing was saved (atomic or nothing): keep the sheet open, offer Retry.
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const accountLabel = visibleAccounts.find(a => a.id === account)?.label ?? 'il conto';
  // Il CTA porta il gesto per intero: da solo "Versa" non distingue un
  // versamento una tantum da un PAC che parte adesso.
  const ctaLabel = parseNum(amount) > 0
    ? `Versa ${formatCurrency(parseNum(amount))}${isRecurring ? ' al mese' : ''}`
    : 'Versa';

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

        <AmountBlock label="Importo del versamento" autoFocus
          value={amount} onChange={v => { setAmount(v); setAmountError(false); }}
          hint={amountError ? <span className="text-red">Inserisci un importo valido</span> : undefined} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Conto sorgente">
            <Select value={account} onChange={setAccount}
              options={[
                ...(canNoAccount ? [{ value: '', label: '🚫 Senza conto (TFR / datore)' }] : []),
                ...visibleAccounts.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` })),
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

        {/* La lista compare solo se ha almeno una riga: un PAC senza conto e
            senza TFR non deve lasciare una card vuota. */}
        {(isPension || account !== '' || !isRecurring) && (
        <OptionList>
        {isPension && (
          <OptionRow label="Di cui TFR" value={parseNum(tfr) > 0 ? formatCurrency(parseNum(tfr)) : 'nessuno'}>
            <EuroInput value={tfr} onChange={setTfr} />
            <p className="text-[11px] mt-1.5 px-1 text-secondary">Quanta parte di questo versamento proviene dal TFR.</p>
          </OptionRow>
        )}

        {account !== '' && (
          <OptionRow label="Commissione" value={parseNum(fee) > 0 ? formatCurrency(parseNum(fee)) : 'nessuna'}>
            <EuroInput value={fee} onChange={setFee} />
            <p className={`text-[11px] mt-1.5 px-1 ${parseNum(fee) > 0 ? 'text-secondary' : 'invisible'}`}>
              Registrata come spesa separata in "Altro"
            </p>
          </OptionRow>
        )}

        {/* Distribuzione statistica — one-off deposits only */}
        {!isRecurring && (
          <OptionRow label="Distribuzione statistica"
            value={spreadChoice === 'none' ? 'nessuna' : spreadChoice === 'custom' ? `${spreadCustom || '—'} mesi` : `${spreadChoice} mesi`}>
            <div className="grid grid-cols-5 gap-1.5">
              {SPREAD_CHOICES.map(o => (
                <button key={String(o.value)} type="button"
                  onClick={() => setSpreadChoice(o.value as 'none' | 'custom' | number)}
                  className={`py-2 rounded-xl text-[11px] font-semibold transition-colors ${spreadChoice === o.value ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>
                  {o.label}
                </button>
              ))}
            </div>
            {spreadChoice === 'custom' && (
              <div className="mt-2">
                <input type="text" inputMode="numeric" value={spreadCustom} placeholder={`${STATS_SPREAD_MIN}–${STATS_SPREAD_MAX} mesi`}
                  onChange={e => setSpreadCustom(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-elevated rounded-xl px-3 py-2.5 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
              </div>
            )}
            {spreadChoice !== 'none' && (
              <p className="text-[11px] mt-1.5 px-1 text-secondary leading-snug">
                Solo nelle statistiche: il movimento resta unico e conti, saldi e flusso di cassa
                cambiano interamente alla data reale. Le medie e i trend degli investimenti
                ripartiscono l'importo dal mese del versamento in avanti.
              </p>
            )}
          </OptionRow>
        )}
        </OptionList>
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

        <OptionList>
          <OptionRow label="Nota" value={notes.trim() ? 'presente' : 'nessuna'}>
            <input type="text" value={notes} maxLength={80} onChange={e => setNotes(e.target.value)}
              className="w-full bg-elevated rounded-xl px-3.5 py-2.5 text-primary text-sm placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
          </OptionRow>
        </OptionList>

        {/* Cosa cambia davvero premendo il CTA: tre conti diversi, e sbagliare
            costa un movimento da cercare e cancellare a mano. */}
        {parseNum(amount) > 0 && (
          <EffectCard>
            Il capitale investito sale di{' '}
            <span className="font-semibold text-primary">{formatCurrency(parseNum(amount))}</span>.{' '}
            {account === ''
              ? 'Nessun conto viene toccato: è un apporto esterno, quindi la liquidità resta quella di prima.'
              : <>Escono <span className="font-semibold text-primary">{formatCurrency(Math.max(0, parseNum(amount) - parseNum(tfr)))}</span> da {accountLabel}, quindi la liquidità libera scende di altrettanto.</>}
            {parseNum(fee) > 0 && <> La commissione di <span className="font-semibold text-primary">{formatCurrency(parseNum(fee))}</span> è registrata a parte come spesa.</>}
          </EffectCard>
        )}

        {saveError && (
          <p className="text-xs text-red px-1 leading-snug">
            Salvataggio non riuscito: nessun dato è stato scritto (movimento e controvalore
            si aggiornano insieme). Controlla la connessione e riprova.
          </p>
        )}

        <button type="submit" disabled={saving}
          className="w-full py-3.5 rounded-2xl cta-gold-fill text-[14px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-60">
          {saving ? 'Salvataggio…' : saveError ? 'Riprova' : ctaLabel}
        </button>
      </form>
    </SheetShell>
  );
}
