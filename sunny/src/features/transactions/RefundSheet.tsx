// "Registra storno" — bottom sheet coerente con le sheet investimenti
// (SheetShell: stesso scaffold, stessi campi, stesso comportamento di salvataggio).
//
// Uno storno è SEMPRE legato a una spesa: eredita la sua categoria e non ne ha
// una propria. Aumenta il saldo del conto di accredito alla sua data reale, ma
// non è un'entrata; nelle statistiche riduce la spesa originale nel mese in cui
// la spesa è avvenuta (vedi shared/refunds.ts).

import { useState, useEffect, useMemo } from 'react';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatDate, capitalize } from '../../utils';
import { refundsFor, summarizeRefunds, refundableExpenses } from '../../shared/refunds';
import { SheetShell, Field, Select, AmountBlock, OptionList, OptionRow, parseNum } from '../investments/SheetShell';

interface Props {
  open: boolean;
  transactions: Transaction[];
  /** Spesa da stornare. Assente = la sheet la fa scegliere (accesso da "+"). */
  expenseId?: string;
  /** Storno esistente da modificare. */
  editing?: Transaction;
  onSave: (data: Omit<Transaction, 'id'>, editingId?: string) => Promise<void> | void;
  onClose: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function RefundSheet({ open, transactions, expenseId, editing, onSave, onClose }: Props) {
  const { visibleAccounts, getCat, getAcc } = useSettings();

  const [selectedId, setSelectedId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [account, setAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Spese ancora stornabili — più quella in modifica/preselezionata, che deve
  // restare selezionabile anche se già stornata per intero.
  const options = useMemo(() => {
    const list = refundableExpenses(transactions);
    const pinnedId = editing?.refundOf ?? expenseId;
    if (pinnedId && !list.some(t => t.id === pinnedId)) {
      const pinned = transactions.find(t => t.id === pinnedId);
      if (pinned) return [pinned, ...list];
    }
    return list;
  }, [transactions, expenseId, editing]);

  useEffect(() => {
    if (!open) return;
    setSelectedId(editing?.refundOf ?? expenseId ?? options[0]?.id ?? '');
    setAmount(editing ? String(editing.amount) : '');
    setDate(editing?.date ?? today());
    setAccount(editing?.account ?? visibleAccounts[0]?.id ?? '');
    setNotes(editing?.notes ?? '');
    setSaving(false); setSaveError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const expense = transactions.find(t => t.id === selectedId);
  const summary = expense
    ? summarizeRefunds(expense, refundsFor(transactions, expense.id), editing?.id)
    : null;

  const amountN = parseNum(amount);
  // Vincolo chiave: gli storni cumulativi non possono superare la spesa.
  const overLimit = !!summary && amountN > summary.remaining + 0.005;
  const valid = !!expense && amountN > 0 && !overLimit && !!account && !!date;
  const afterRefund = summary ? Math.max(0, summary.remaining - amountN) : 0;

  const save = async () => {
    if (!valid || !expense || saving) return;
    setSaving(true); setSaveError(false);
    try {
      await onSave({
        type: 'refund',
        description: `Storno · ${expense.description || getCat(expense.category).label}`,
        amount: amountN,
        date,
        // Eredita la categoria della spesa: nelle statistiche lo sconto cade
        // sulla categoria giusta senza che lo storno ne abbia una propria.
        category: expense.category,
        account,
        refundOf: expense.id,
        notes: notes.trim() || undefined,
      }, editing?.id);
      onClose();
    } catch {
      setSaveError(true);          // la sheet resta aperta: si può riprovare
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <SheetShell open={open} title={editing ? 'Modifica storno' : 'Registra storno'} onClose={onClose}>
      {options.length === 0 && !expense ? (
        <div className="py-8 text-center">
          <p className="text-3xl mb-3 opacity-50">↩️</p>
          <p className="text-[13px] text-secondary">Nessuna spesa da stornare.</p>
        </div>
      ) : (
        <>
          <Field label="Spesa da stornare">
            {expenseId && !editing && expense ? (
              // Aperta dal dettaglio di una spesa: è già decisa, la si mostra.
              <div className="bg-elevated rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                  style={{ backgroundColor: getCat(expense.category).color + '22' }}>
                  {getCat(expense.category).icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] text-primary truncate">{expense.description || getCat(expense.category).label}</p>
                  <p className="text-[11px] text-secondary">
                    {capitalize(formatDate(expense.date))} · {formatCurrency(summary?.gross ?? 0)}
                  </p>
                </div>
              </div>
            ) : (
              <Select value={selectedId} onChange={setSelectedId}
                options={options.map(t => ({
                  value: t.id,
                  label: `${formatDate(t.date)} · ${t.description || getCat(t.category).label} · ${formatCurrency(t.amount)}`,
                }))} />
            )}
          </Field>

          <AmountBlock label="Importo rimborsato" value={amount} onChange={setAmount} autoFocus
            hint={summary && (
              <>
                <span className="block h-[5px] rounded-full overflow-hidden mb-2"
                  style={{ background: 'rgba(var(--c-primary) / 0.08)' }}>
                  <span className="block h-full rounded-full bg-green"
                    style={{ width: `${Math.min(100, ((summary.refunded + Math.max(0, amountN)) / Math.max(1, summary.gross)) * 100)}%` }} />
                </span>
                Massimo stornabile {formatCurrency(summary.remaining)}
                {summary.refunded > 0
                  ? ` · già stornati ${formatCurrency(summary.refunded)}`
                  : ' · nessuno storno precedente'}
                {overLimit && (
                  <span className="block text-red mt-1">
                    Lo storno non può superare {formatCurrency(summary.remaining)}.
                  </span>
                )}
              </>
            )} />

          <Field label="Data di accredito">
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-2xl px-4 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40" />
            {expense && date < expense.date && (
              <p className="text-[11px] text-secondary/70 px-1 mt-1.5">
                La data è precedente alla spesa: controlla che sia giusta.
              </p>
            )}
          </Field>

          <Field label="Conto di accredito">
            <Select value={account} onChange={setAccount}
              options={visibleAccounts.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} />
          </Field>

          <OptionList>
            <OptionRow label="Nota" value={notes.trim() ? 'presente' : 'nessuna'}>
              <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Es. reso online, rimborso parziale…" maxLength={200}
                className="w-full bg-elevated rounded-xl px-3.5 py-2.5 text-primary text-sm placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
            </OptionRow>
          </OptionList>

          {/* Preview: com'è la spesa dopo lo storno */}
          {summary && amountN > 0 && !overLimit && (
            <div className="bg-card rounded-2xl px-4 py-3.5 space-y-2">
              <p className="label-caps text-secondary">Spesa dopo lo storno</p>
              <PreviewRow label="Spesa originale" value={formatCurrency(summary.gross)} />
              {summary.refunded > 0 && (
                <PreviewRow label="Già stornato" value={`−${formatCurrency(summary.refunded)}`} />
              )}
              <PreviewRow label="Questo storno" value={`−${formatCurrency(amountN)}`} tone="text-green" />
              <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-divider">
                <span className="text-[13px] font-semibold text-primary">Spesa effettiva</span>
                <span className="text-[21px] font-bold text-primary balance-num">{formatCurrency(afterRefund)}</span>
              </div>
              <p className="text-[11px] text-secondary/70 leading-snug pt-1">
                {formatCurrency(amountN)} tornano su {getAcc(account).label} il {formatDate(date)}.
                Nelle statistiche la spesa scende a {formatCurrency(afterRefund)} nel mese in cui l'hai fatta.
              </p>
            </div>
          )}

          {saveError && (
            <p className="text-[12px] px-1" style={{ color: '#E08B8B' }}>
              Salvataggio non riuscito. Controlla la connessione e riprova.
            </p>
          )}

          <button onClick={save} disabled={!valid || saving}
            className="w-full py-3.5 rounded-2xl cta-gold-fill text-[14px] font-semibold disabled:opacity-40 transition-opacity">
            {saving ? 'Salvataggio…' : saveError ? 'Riprova' : editing ? 'Salva modifiche' : 'Registra storno'}
          </button>
        </>
      )}
    </SheetShell>
  );
}

function PreviewRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] text-secondary">{label}</span>
      <span className={`text-[13px] font-semibold balance-num ${tone ?? 'text-primary'}`}>{value}</span>
    </div>
  );
}
