import { useState, useEffect, useMemo } from 'react';
import { grossOwnShare, Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatDate, capitalize } from '../../utils';
import { refundsFor, summarizeRefunds } from '../../shared/refunds';
import { isRefundableSource, toRefundCents } from '../../shared/multiRefunds';
import { RefundPreview, RefundProgress } from './RefundPreview';
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

  const options = useMemo(() => transactions.filter(t => isRefundableSource(t) && grossOwnShare(t) >= 0.005)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0)), [transactions]);

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

  const expense = options.find(t => t.id === selectedId);
  const summary = expense
    ? summarizeRefunds(expense, refundsFor(transactions, expense.id), editing?.id)
    : null;

  const amountN = parseNum(amount);
  const received = amountN > 0 && amountN <= 1_000_000_000 ? toRefundCents(amountN) : 0;
  const remaining = summary ? Math.max(0, toRefundCents(summary.gross) - toRefundCents(summary.refunded)) : 0;
  const covered = Math.min(remaining, received);
  const gain = received - covered;
  const afterRefund = (remaining - covered) / 100;
  const valid = !!expense && received > 0 && !!account && !!date;

  const save = async () => {
    if (!valid || !expense || saving) return;
    setSaving(true); setSaveError(false);
    try {
      await onSave({
        type: 'refund',
        description: `Storno · ${expense.description || getCat(expense.category).label}`,
        amount: received / 100,
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
    <SheetShell draftSignature={JSON.stringify([selectedId,amount,date,account,notes])} saving={saving} open={open} title={editing ? 'Modifica storno' : 'Registra storno'} onClose={onClose}>
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
                <RefundProgress gross={summary.gross} remaining={afterRefund} />
                Spesa residua {formatCurrency(summary.remaining)}
                {summary.refunded > 0
                  ? ` · già stornati ${formatCurrency(summary.refunded)}`
                  : ' · nessuno storno precedente'}
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

          {summary && received > 0 && (
            <RefundPreview gross={summary.gross} refunded={summary.refunded} covered={covered / 100}
              remaining={afterRefund} gain={gain / 100}>
              {formatCurrency(received / 100)} su {getAcc(account).label} il {formatDate(date)}.
              {' '}Lo storno riduce la spesa nel mese in cui l'hai fatta.
              {gain > 0 && ' L’entrata conta alla data di accredito.'}
            </RefundPreview>
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
