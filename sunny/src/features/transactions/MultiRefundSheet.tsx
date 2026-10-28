import { useEffect, useMemo, useState } from 'react';
import type { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatDate } from '../../utils';
import {
  allocateRefundReceipt, MAX_REFUND_SOURCES, refundGroupIdOf, type RefundReceiptDraft,
} from '../../shared/multiRefunds';
import { SheetShell, Field, Select, AmountBlock, OptionList, OptionRow, parseNum } from '../investments/SheetShell';

export interface MultiRefundSheetProps {
  open: boolean;
  transactions: Transaction[];
  expenseIds: string[];
  editingGroupId?: string;
  loadingSources?: boolean;
  sourceError?: string;
  onSave: (draft: RefundReceiptDraft) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
  onClose: () => void;
}
const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/** One real receipt, with proportional costs in their original categories/months. */
export function MultiRefundSheet({ open, transactions, expenseIds, editingGroupId, loadingSources = false, sourceError = '', onSave, onDelete, onClose }: MultiRefundSheetProps) {
  const { visibleAccounts, getCat, getAcc } = useSettings();
  const [receiptId, setReceiptId] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [account, setAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const rows = editingGroupId ? transactions.filter(t => refundGroupIdOf(t) === editingGroupId) : [];
    const first = rows[0];
    setReceiptId(editingGroupId ?? crypto.randomUUID());
    setAmount(rows.length ? String(rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100) : '');
    setDate(first?.date ?? today());
    setAccount(first?.account ?? visibleAccounts[0]?.id ?? '');
    setNotes(first?.notes ?? '');
    setSaving(false); setSaveError(''); setConfirmDelete(false);
    // Snapshot updates must not reset an unsaved amount/date or the retry ID.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingGroupId]);

  const sources = expenseIds.map(id => transactions.find(t => t.id === id)).filter((t): t is Transaction => !!t);
  const amountN = parseNum(amount);
  const preview = useMemo(() => {
    try {
      if (sources.length !== expenseIds.length) throw new Error('Una spesa non è più disponibile. Aggiorna la selezione.');
      if (!expenseIds.length || expenseIds.length > MAX_REFUND_SOURCES) throw new Error(`Puoi rimborsare fino a ${MAX_REFUND_SOURCES} spese insieme.`);
      // A one-cent preview also validates the selection before an amount exists.
      return { allocation: allocateRefundReceipt(sources, transactions, amountN > 0 ? amountN : 0.01, editingGroupId), error: '' };
    } catch (error) {
      return { allocation: null, error: error instanceof Error ? error.message : 'Selezione non valida.' };
    }
  }, [transactions, expenseIds, amountN, editingGroupId]);
  const valid = !loadingSources && !sourceError && !!receiptId && !!preview.allocation && amountN >= 0.01 && !!date && !!account;
  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setSaveError('');
    try {
      await onSave({ receiptId, expenseIds: [...expenseIds], amount: amountN, date, account, notes: notes.trim() || undefined });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Salvataggio non riuscito. Controlla la connessione e riprova.');
    } finally { setSaving(false); }
  };
  const remove = async () => {
    if (!onDelete || saving) return;
    setSaving(true); setSaveError('');
    try { await onDelete(); onClose(); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Eliminazione non riuscita. Riprova.'); }
    finally { setSaving(false); }
  };
  if (!open) return null;
  const allocation = preview.allocation;
  return (
    <SheetShell open={open} title={editingGroupId ? 'Modifica rimborso multiplo' : 'Rimborso di più spese'}
      subtitle={`${expenseIds.length} spese selezionate`} onClose={onClose} saving={saving}
      draftSignature={JSON.stringify([receiptId,expenseIds,amount,date,account,notes])}>
      <Field label="Spese da rimborsare">
        <ul className="bg-elevated rounded-2xl px-4 divide-y divide-divider max-h-48 overflow-y-auto">
          {sources.map(source => {
            const row = allocation?.allocations.find(a => a.expenseId === source.id);
            return <li key={source.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] text-primary truncate">{source.description || getCat(source.category).label}</p>
                <p className="text-[11px] text-secondary">{formatDate(source.date)} · {getCat(source.category).label}</p>
                {row && amountN > 0 && <p className="text-[11px] text-secondary">
                  Coperti {formatCurrency(row.allocatedCents / 100)} · residuo {formatCurrency(row.remainingCents / 100)}
                </p>}
              </div>
              <span className="text-[12px] text-secondary whitespace-nowrap balance-num">{formatCurrency((row?.availableCents ?? 0) / 100)}</span>
            </li>;
          })}
        </ul>
      </Field>
      {loadingSources && <p role="status" className="text-[12px] text-secondary px-1">Caricamento ricevuta…</p>}
      {(sourceError || (!loadingSources && preview.error)) && <p role="alert" className="text-[12px] text-red px-1">{sourceError || preview.error}</p>}
      <AmountBlock label="Totale ricevuto" value={amount} onChange={setAmount}
        hint={allocation ? <>Costi ancora rimborsabili {formatCurrency(allocation.availableCents / 100)}. Puoi inserire anche un importo inferiore o superiore.</> : undefined} />
      <Field label="Data di accredito">
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-2xl px-4 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40" />
      </Field>
      <Field label="Conto di accredito">
        <Select value={account} onChange={setAccount} options={visibleAccounts.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} />
      </Field>
      <OptionList><OptionRow label="Nota" value={notes.trim() ? 'presente' : 'nessuna'}>
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} maxLength={200} placeholder="Es. rimborso trasferta…"
          className="w-full bg-elevated rounded-xl px-3.5 py-2.5 text-primary text-sm placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
      </OptionRow></OptionList>
      {allocation && amountN > 0 && <div className="bg-card rounded-2xl px-4 py-3.5 space-y-2">
        <p className="label-caps text-secondary">Dopo il rimborso</p>
        <PreviewRow label="Costi coperti" amount={allocation.refundedCents / 100} />
        <PreviewRow label="Costi residui" amount={allocation.remainingCents / 100} />
        {allocation.gainCents > 0 && <PreviewRow label="Guadagno" amount={allocation.gainCents / 100} />}
        <p className="text-[11px] text-secondary/70 leading-snug pt-1">
          {formatCurrency(amountN)} su {getAcc(account).label} il {formatDate(date)}.
          {' '}I costi residui restano proporzionalmente nelle categorie e nei mesi delle spese originali.
          {allocation.gainCents > 0 && ' Il guadagno è un’entrata alla data di accredito.'}
        </p>
      </div>}
      {saveError && <p role="alert" className="text-[12px] text-red px-1">{saveError}</p>}
      <button type="button" onClick={save} disabled={!valid || saving}
        className="w-full py-3.5 rounded-2xl cta-gold-fill text-[14px] font-semibold disabled:opacity-40 transition-opacity">
        {saving ? 'Salvataggio…' : saveError ? 'Riprova' : editingGroupId ? 'Salva modifiche' : 'Registra rimborso'}
      </button>
      {editingGroupId && onDelete && <div className="space-y-2">
        {confirmDelete && <p className="text-[12px] text-secondary px-1">Eliminando l’intera ricevuta, tutte le spese tornano al costo precedente al rimborso.</p>}
        <button type="button" disabled={saving} onClick={() => confirmDelete ? void remove() : setConfirmDelete(true)}
          className="w-full py-3 rounded-2xl text-red bg-red/10 text-[13px] font-semibold disabled:opacity-40">
          {confirmDelete ? 'Conferma eliminazione ricevuta' : 'Elimina ricevuta'}
        </button>
        {confirmDelete && <button type="button" disabled={saving} onClick={() => setConfirmDelete(false)} className="w-full py-2 text-[12px] text-secondary">Annulla eliminazione</button>}
      </div>}
    </SheetShell>
  );
}
function PreviewRow({ label, amount }: { label: string; amount: number }) {
  return <div className="flex items-baseline justify-between gap-3">
    <span className="text-[12px] text-secondary">{label}</span>
    <span className="text-[13px] font-semibold text-primary balance-num">{formatCurrency(amount)}</span>
  </div>;
}
