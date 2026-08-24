import { useState, useEffect, useMemo } from 'react';
import { Transaction, TransactionType, TYPE_META, TYPE_ORDER, RecurrenceRule, SeriesMeta, SeriesKind, AccountDef, typeColor, typeOnColor } from '../../types';
import { formatCurrency, formatDate, guessCategory } from '../../utils';
import { Candidate, Recognition, RECOGNITION_THRESHOLD } from './categoryRecognition';
import { useSettings } from '../../shared/providers/settings';
import { expandRecurringOnCreate, shouldExpandOnSave, monthlyEquivalent, nthOccurrenceDate } from '../../shared/recurrence';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { refundsFor, summarizeRefunds } from '../../shared/refunds';
import { useScrollLock } from '../../shared/useScrollLock';

interface Props {
  open: boolean;
  editing?: Transaction | null;
  groupTransfers?: Transaction[];
  seriesEdit?: boolean;
  defaultType?: TransactionType;
  /** Admin-only category recognizer (L1 history + L2 keywords). Absent → the
   *  non-admin path: plain `guessCategory`, behaviour unchanged. */
  recognize?: (description: string, candidates: Candidate[]) => Recognition | null;
  /** Serve al blocco storni (elenco + totale già stornato della spesa aperta). */
  transactions?: Transaction[];
  /** Apre la sheet storno sulla spesa in modifica (o senza spesa, da "+"). */
  onRegisterRefund?: (expenseId?: string) => void;
  /** Apre uno storno esistente nella sua sheet. */
  onEditRefund?: (refund: Transaction) => void;
  onClose: () => void;
  /** For INVESTMENT movements the modal awaits the returned promise (atomic
   *  commit movimento+controvalore): loading state, no double submit, stays
   *  open with Retry on failure. Other types keep the offline-safe
   *  fire-and-forget behaviour. */
  onSave: (deleteIds: string[], create: Omit<Transaction, 'id'>[]) => void | Promise<void>;
}

/** Quante categorie stanno nella riga di chip prima di "altre ›". */
const CHIP_CATS = 6;

interface Reimb { amount: string; account: string }

/** Series choice in the modal: none, or one of the smart-series kinds. */
type ModalSeriesKind = 'none' | SeriesKind;

const r2 = (n: number) => Math.round(n * 100) / 100;

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

export function TransactionModal({ open, editing, groupTransfers = [], seriesEdit = false, defaultType, recognize, transactions = [], onRegisterRefund, onEditRefund, onClose, onSave }: Props) {
  const { categories, accounts, visibleCategories, visibleAccounts, enableInvestments, detailedInvestments, theme, getAcc } = useSettings();
  const [type, setType] = useState<TransactionType>('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [category, setCategory] = useState('');
  const [account, setAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [notes, setNotes] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [reimbursements, setReimbursements] = useState<Reimb[]>([]);
  const [seriesKind, setSeriesKind] = useState<ModalSeriesKind>('none');
  const [recurringFreq, setRecurringFreq] = useState<RecurrenceRule['freq']>('monthly');
  const [recurringUntil, setRecurringUntil] = useState('');
  // Installment plan inputs (kind='installment'): the per-installment amount and
  // the series end are DERIVED from these at submit, never entered directly.
  const [instTotal, setInstTotal] = useState('');
  const [instCount, setInstCount] = useState('');
  const [instFirstDate, setInstFirstDate] = useState(today());
  const [fee, setFee] = useState('');
  const [tfr, setTfr] = useState('');
  // Statistical spread (one-off investment deposits only): 'none' | 3 | 6 | 12 | 'custom'.
  const [spreadChoice, setSpreadChoice] = useState<'none' | 'custom' | number>('none');
  const [spreadCustom, setSpreadCustom] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [amountError, setAmountError] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [showMore, setShowMore] = useState(false);
  // Descrizione e griglia categorie partono chiuse: una spesa tipica si
  // registra senza toccarle.
  const [descOpen, setDescOpen] = useState(false);
  const [catGridOpen, setCatGridOpen] = useState(false);
  // Conto e data si aprono solo se vanno cambiati: il default è "il conto di
  // sempre, oggi".
  const [whenWhereOpen, setWhenWhereOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Quick mode: defaultType set + not editing → hide type selector, collapse date/account
  const quickMode = !editing && !!defaultType && defaultType !== 'transfer';

  // Storni della spesa aperta: elenco, totale stornato e spesa effettiva.
  // Solo su una spesa REALE già registrata (non su template di serie).
  const canRefund = !!editing && editing.type === 'expense' && !editing.projected && !editing.recurring;
  const myRefunds = canRefund ? refundsFor(transactions, editing.id) : [];
  const refundSummary = canRefund ? summarizeRefunds(editing, myRefunds) : null;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      // Shared-expense reconstruction only folds the settlements (transfers): an
      // investment in the group is the fee parent and must not be summed in.
      const groupSettlements = groupTransfers.filter(t => t.type === 'transfer');
      const hasGroup = editing.type === 'expense' && !!editing.groupId && groupSettlements.length > 0;
      const transfersSum = groupSettlements.reduce((s, t) => s + t.amount, 0);
      setType(editing.type); setDescription(editing.description);
      setAmount(String(hasGroup ? editing.amount + transfersSum : editing.amount));
      setDescOpen(!!editing.description);
      setDate(editing.date);
      setCategory(editing.category); setAccount(editing.account);
      setToAccount(editing.toAccount ?? visibleAccounts[1]?.id ?? '');
      setNotes(editing.notes ?? '');
      setIsShared(hasGroup || !!editing.shared);
      setReimbursements(hasGroup
        ? groupSettlements.map(t => ({ amount: String(t.amount), account: t.toAccount ?? '' }))
        : []);
      // Legacy series without seriesMeta open as plain 'recurring'.
      setSeriesKind(editing.recurring ? (editing.seriesMeta?.kind ?? 'recurring') : 'none');
      setRecurringFreq(editing.recurring?.freq ?? 'monthly');
      setRecurringUntil(editing.recurring?.until ?? '');
      const inst = editing.seriesMeta?.installment;
      setInstTotal(inst ? String(inst.totalAmount) : '');
      setInstCount(inst ? String(inst.totalInstallments) : '');
      setInstFirstDate(inst?.firstDate ?? editing.date);
      setFee((editing.type === 'transfer' || editing.type === 'investment')
        ? String(groupTransfers.find(t => t.type === 'expense')?.amount ?? '')
        : '');
      setTfr(editing.tfr !== undefined ? String(editing.tfr) : '');
      const sp = editing.statsSpreadMonths;
      if (sp == null) { setSpreadChoice('none'); setSpreadCustom(''); }
      else if (sp === 3 || sp === 6 || sp === 12) { setSpreadChoice(sp); setSpreadCustom(''); }
      else { setSpreadChoice('custom'); setSpreadCustom(String(sp)); }
    } else {
      const lastAcc = localStorage.getItem('sunny:lastAccount');
      setType(defaultType ?? 'expense'); setDescription(''); setAmount(''); setDate(today());
      setCategory('');
      setAccount((lastAcc && visibleAccounts.some(a => a.id === lastAcc)) ? lastAcc : (visibleAccounts[0]?.id ?? ''));
      setToAccount(visibleAccounts[1]?.id ?? ''); setNotes('');
      setIsShared(false); setReimbursements([]);
      setSeriesKind('none'); setRecurringFreq('monthly'); setRecurringUntil('');
      setInstTotal(''); setInstCount(''); setInstFirstDate(today());
      setFee(''); setTfr('');
      setSpreadChoice('none'); setSpreadCustom('');
    }
    setSaving(false); setSaveError(false);
    setAmountError(false);
    setCategoryTouched(!!editing);
    setConfirmDelete(false);
    setAdvancedOpen(false);
    const hasGroup = !!editing && editing.type === 'expense' && !!editing.groupId
      && groupTransfers.some(t => t.type === 'transfer');
    setShowMore(!!editing && (!!editing.recurring || hasGroup || !!editing.shared));
  }, [open, editing, groupTransfers.length]);

  useScrollLock(open);

  useEscapeKey(onClose, open);

  // Investments are created and managed exclusively from the /investments screen,
  // so the type selector does NOT offer "Investimento" for new transactions. It
  // stays available only when EDITING an existing investment (so its type renders
  // correctly and the edit isn't silently retyped).
  const availableTypes = TYPE_ORDER.filter(t =>
    t !== 'investment' || (enableInvestments && editing?.type === 'investment'),
  );
  // Category chips: only VISIBLE categories of this type — plus, when editing a
  // transaction whose category was archived, that one (so the edit doesn't
  // silently reassign it). New picks never offer archived categories.
  const visibleTypeCats = visibleCategories.filter(c => c.kind === type);
  const editedArchivedCat = categories.find(c => c.id === category && c.archived && c.kind === type);
  const typeCats = editedArchivedCat && !visibleTypeCats.some(c => c.id === editedArchivedCat.id)
    ? [...visibleTypeCats, editedArchivedCat]
    : visibleTypeCats;
  useEffect(() => {
    if (type === 'transfer') return;
    if (!typeCats.some(c => c.id === category)) setCategory(typeCats[0]?.id ?? '');
  }, [type, categories]);

  // Account options for the pickers: visible accounts, plus the account(s) the
  // edited transaction already references (so an archived account stays shown and
  // isn't dropped on edit). New picks exclude archived.
  const accountOptions = ((): AccountDef[] => {
    const seen = new Set(visibleAccounts.map(a => a.id));
    const extras = [account, toAccount]
      .filter(id => id && !seen.has(id))
      .map(id => accounts.find(a => a.id === id))
      .filter((a): a is AccountDef => !!a);
    return [...visibleAccounts, ...extras];
  })();

  // Detailed-investments extras (gated per user): a source-less investment and,
  // for pension funds, the TFR portion of the contribution.
  const canNoAccount = type === 'investment' && detailedInvestments;
  /** Tastierino: la stessa normalizzazione dell'input (cifre e una virgola). */
  const pressKey = (k: string) => {
    setAmountError(false);
    setAmount(prev => {
      if (k === 'back') return prev.slice(0, -1);
      if (k === ',') return prev.includes(',') || prev.includes('.') ? prev : (prev || '0') + ',';
      // Massimo due decimali, come l'importo salvato.
      const sep = prev.search(/[.,]/);
      if (sep >= 0 && prev.length - sep > 2) return prev;
      return prev === '0' ? k : prev + k;
    });
  };

  const selCat = categories.find(c => c.id === category);
  // Chip mostrate senza aprire la griglia: le prime CHIP_CATS più, se sta
  // fuori, quella selezionata — non deve mai sparire dalla riga.
  const chipCats = useMemo(() => {
    const head = typeCats.slice(0, CHIP_CATS);
    const sel = typeCats.find(c => c.id === category);
    return sel && !head.some(c => c.id === sel.id) ? [sel, ...head] : head;
  }, [typeCats, category]);
  const isPensionInvest = type === 'investment' && detailedInvestments && selCat?.fundType === 'pension';

  // An empty account is only valid for a source-less investment; otherwise snap
  // back to a real account (e.g. after switching type away from investment).
  useEffect(() => {
    if (account === '' && !canNoAccount) setAccount(visibleAccounts[0]?.id ?? '');
  }, [account, canNoAccount, visibleAccounts]);

  // Fallback description used when the field is left empty: the selected
  // category label (or the destination account for transfers).
  const defaultDesc = type === 'transfer'
    ? (accounts.find(a => a.id === toAccount)?.label ?? 'Trasferimento')
    : (categories.find(c => c.id === category)?.label ?? '');

  const addReimb = () => {
    const def = visibleAccounts.find(a => a.id !== account)?.id ?? visibleAccounts[0]?.id ?? '';
    setReimbursements(rs => [...rs, { amount: '', account: def }]);
  };
  const updateReimb = (i: number, patch: Partial<Reimb>) =>
    setReimbursements(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeReimb = (i: number) =>
    setReimbursements(rs => rs.filter((_, j) => j !== i));

  const resetKeepContext = () => {
    setDescription(''); setAmount(''); setNotes('');
    setIsShared(false); setReimbursements([]);
    setSeriesKind('none'); setRecurringFreq('monthly'); setRecurringUntil('');
    setInstTotal(''); setInstCount(''); setInstFirstDate(today());
    setFee(''); setTfr('');
    setSpreadChoice('none'); setSpreadCustom('');
    setAmountError(false); setConfirmDelete(false); setShowMore(false);
    setCategoryTouched(true); // keep type, category, account, date
  };

  /**
   * Persist and close. INVESTMENT movements are atomic-or-nothing: await the
   * commit (loading, no double submit) and keep the modal open with a Retry on
   * failure — never a partial state. Everything else keeps the historical
   * offline-safe fire-and-forget path (a batched write resolves on server ack,
   * so awaiting it offline would hang the form for plain expenses).
   */
  const commit = async (deleteIds: string[], create: Omit<Transaction, 'id'>[], keepOpen: boolean) => {
    const involvesInvestment = editing?.type === 'investment'
      || create.some(t => t.type === 'investment')
      || groupTransfers.some(t => t.type === 'investment');
    if (!involvesInvestment) {
      Promise.resolve(onSave(deleteIds, create)).catch(e =>
        console.error('save failed', (e as { code?: string })?.code ?? e));
      if (keepOpen && !editing) { resetKeepContext(); } else { onClose(); }
      return;
    }
    if (saving) return;
    setSaving(true);
    setSaveError(false);
    try {
      await onSave(deleteIds, create);
      if (keepOpen && !editing) { resetKeepContext(); } else { onClose(); }
    } catch {
      setSaveError(true); // nothing was written: stay open, offer Retry
    } finally {
      setSaving(false);
    }
  };

  const doSubmit = (keepOpen: boolean) => {
    const isSeries = seriesKind !== 'none';
    const isInstallment = seriesKind === 'installment';
    // Installment: the per-installment amount and the series end are DERIVED
    // from the plan (totale / numero rate), the main amount field is ignored.
    const instTotalVal = parseFloat(instTotal.replace(',', '.')) || 0;
    const instCountVal = parseInt(instCount, 10) || 0;
    const rataVal = isInstallment && instCountVal > 0 ? r2(instTotalVal / instCountVal) : 0;
    const value = isInstallment ? rataVal : parseFloat(amount.replace(',', '.'));
    if (!value || value <= 0) { setAmountError(true); return; }
    setAmountError(false);

    // The installment plan starts at its own first-installment date.
    const effDate = isInstallment ? instFirstDate : date;

    const recurring: RecurrenceRule | undefined = !isSeries
      ? undefined
      : isInstallment
        ? { freq: recurringFreq, until: nthOccurrenceDate(instFirstDate, recurringFreq, instCountVal) }
        : { freq: recurringFreq, until: recurringUntil || undefined };
    // Stable series id: preserve an existing one (series edits churn the doc id,
    // and single-instance edits must keep their link); otherwise mint one for a
    // brand-new series, falling back to the legacy template's own id.
    const seriesId = editing?.seriesId ?? (isSeries ? (editing?.id ?? crypto.randomUUID()) : undefined);
    // Smart-series metadata: INPUT data only (derived figures are computed at
    // runtime by buildSeriesSummary). Plain 'recurring' keeps whatever meta it
    // already had (usually none — legacy compatibility); a single-occurrence
    // edit (no rule on the doc) preserves the instance's badge meta; turning a
    // TEMPLATE's series off (dissolve) drops the meta.
    const seriesMeta: SeriesMeta | undefined =
      seriesKind === 'subscription'
        ? { kind: 'subscription', createdAt: editing?.seriesMeta?.createdAt ?? Date.now() }
      : isInstallment
        ? { kind: 'installment', createdAt: editing?.seriesMeta?.createdAt ?? Date.now(),
            installment: { totalAmount: r2(instTotalVal), totalInstallments: instCountVal, firstDate: instFirstDate } }
      : seriesKind === 'recurring'
        ? (editing?.seriesMeta?.kind === 'recurring' ? editing.seriesMeta : undefined)
      : (editing?.seriesId && !editing?.recurring ? editing?.seriesMeta : undefined);
    const desc = description.trim() || defaultDesc.trim() || 'Senza nome';
    // Delete only the group members this edit reconstructs: editing an expense
    // recreates its settlements (transfers); editing a transfer/investment recreates
    // its commission (expense). An investment linked to the commission expense
    // being edited is NOT reconstructed and must survive.
    const reconstructed = editing
      ? groupTransfers.filter(t => editing.type === 'expense' ? t.type === 'transfer' : t.type === 'expense')
      : [];
    const deleteIds = editing ? [editing.id, ...reconstructed.map(t => t.id)] : [];

    // A recurring series whose start date is in the past gets its overdue
    // occurrences materialized right away (as realized instances), so it counts
    // as "done" immediately instead of waiting for the nightly Cloud Function.
    // This applies to brand-new series AND to converting a plain one-off
    // (no recurrence, no series link) into a recurring series — otherwise the
    // back-dated months would never be created at save time. Editing an existing
    // series/instance is left untouched (those occurrences already exist).
    const todayISO = new Date().toISOString().slice(0, 10);
    const expandNow = shouldExpandOnSave(editing, isSeries);
    const finalize = (docs: Omit<Transaction, 'id'>[]) =>
      expandNow ? docs.flatMap(d => expandRecurringOnCreate(d, todayISO)) : docs;

    const settlements = (type === 'expense' && isShared)
      ? reimbursements
          .map(r => ({ amount: parseFloat(r.amount.replace(',', '.')), account: r.account }))
          .filter(r => r.amount > 0 && r.account)
      : [];
    const sum = settlements.reduce((s, r) => s + r.amount, 0);

    if (settlements.length > 0) {
      if (sum > value) return;
      const net = value - sum;
      const groupId = editing?.groupId ?? crypto.randomUUID();
      const create: Omit<Transaction, 'id'>[] = [];
      for (const r of settlements) {
        create.push({
          // "Quota" (non "Storno"): è la parte ALTRUI di una spesa condivisa che
          // rientra, un movimento interno fra conti — da non confondere con
          // `type: 'refund'`, lo storno di una spesa (vedi shared/refunds.ts).
          type: 'transfer', description: `Quota · ${desc}`, amount: r.amount, date: effDate,
          category: 'trasferimento', account, toAccount: r.account, groupId,
          // A SHARED series repeats WHOLE: each settlement is its own series,
          // advancing in lockstep with the expense (same rule, same dates), so
          // every month gets its transfer too. The shared groupId + the same-date
          // guard at edit time link each month's expense to that month's quota.
          ...(recurring ? { recurring, seriesId: crypto.randomUUID() } : {}),
        });
      }
      if (net > 0) {
        create.push({
          type: 'expense', description: desc, amount: net, date: effDate,
          category, account, notes: notes.trim() || undefined, groupId, recurring, seriesId, seriesMeta,
        });
      }
      if (account) try { localStorage.setItem('sunny:lastAccount', account); } catch { /* ignore */ }
      void commit(deleteIds, finalize(create), keepOpen);
      return;
    }

    // Commission applies to transfers and investments with a source account
    // (a source-less investment has no account to charge the fee to).
    const feeApplicable = type === 'transfer' || (type === 'investment' && account !== '');
    const feeVal = feeApplicable ? parseFloat(fee.replace(',', '.')) : 0;
    const hasFee = feeVal > 0;
    // Editing a plain expense that belongs to a group (e.g. the commission of an
    // investment) must keep its groupId so the link to the parent survives.
    const groupId = hasFee
      ? (editing?.groupId ?? crypto.randomUUID())
      : (type === 'expense' ? editing?.groupId : undefined);

    // TFR portion of a pension-fund contribution, capped at the amount.
    const tfrRaw = isPensionInvest ? parseFloat(tfr.replace(',', '.')) : NaN;
    const tfrClean = tfrRaw > 0 ? Math.min(tfrRaw, value) : undefined;

    // Statistical spread: one-off investment DEPOSITS only (series excluded).
    const effDirection = type === 'investment' ? (editing?.direction ?? 'in') : undefined;
    const spreadRaw = spreadChoice === 'custom' ? parseInt(spreadCustom, 10) : spreadChoice;
    const spreadClean = type === 'investment' && effDirection !== 'out' && !isSeries
      && typeof spreadRaw === 'number' && Number.isInteger(spreadRaw) && spreadRaw >= 2 && spreadRaw <= 120
      ? spreadRaw : undefined;

    const create: Omit<Transaction, 'id'>[] = [{
      type, description: desc, amount: value, date: effDate,
      category: type === 'transfer' ? 'trasferimento' : category,
      account,
      toAccount: type === 'transfer' ? toAccount : undefined,
      notes: notes.trim() || undefined,
      recurring, seriesId, seriesMeta,
      ...(type === 'investment' && tfrClean ? { tfr: tfrClean } : {}),
      ...(spreadClean ? { statsSpreadMonths: spreadClean } : {}),
      // Investments keep their flow direction on edit ('out' stays a withdrawal);
      // anything created here is a deposit ('in').
      ...(type === 'investment' ? { direction: effDirection } : {}),
      ...(groupId ? { groupId } : {}),
    }];
    if (hasFee) {
      create.push({
        type: 'expense', description: `Commissione · ${desc}`,
        amount: feeVal, date: effDate, category: 'altro', account, groupId: groupId!,
      });
    }
    if (account) try { localStorage.setItem('sunny:lastAccount', account); } catch { /* ignore */ }
    void commit(deleteIds, finalize(create), keepOpen);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    doSubmit(false);
  };

  if (!open) return null;

  const td = today(), yd = yesterday();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />

      {/* Mobile: the card fills the screen (minus a 12px + safe-area margin, so
          the backdrop peeks around the rounded corners and it still reads as a
          card). From `sm` up it stays the compact centered sheet as before.
          The CARD ITSELF never scrolls: it's a fixed mask (header + footer)
          around an internal scrolling window (the form fields). overscroll-contain
          stops the scroll from chaining to the page when the window hits its end. */}
      <div className="relative w-full max-w-none h-full max-h-full sm:max-w-lg sm:h-auto sm:max-h-[88dvh] glass-elevated rounded-3xl shadow-float overflow-hidden flex flex-col animate-sheet-up">
        {/* Testa: ✕ a sinistra, segmented al centro. Il titolo sparisce — con
            il tipo selezionato davanti agli occhi non diceva nulla di nuovo. */}
        <div className="shrink-0 bg-[var(--modal-hdr-bg)] px-5 pt-5 pb-3 flex items-center gap-3">
          <button type="button" onClick={onClose} aria-label="Chiudi"
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary flex-none">✕</button>
          {!quickMode && availableTypes.length > 1 ? (
            <div className="flex-1 min-w-0 grid gap-1 bg-surface rounded-xl p-1"
              style={{ gridTemplateColumns: `repeat(${availableTypes.length}, 1fr)` }}>
              {availableTypes.map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`py-1.5 rounded-lg text-[12px] font-semibold truncate transition-colors ${
                    type === t ? 'bg-primary text-bg' : 'text-secondary'}`}>
                  {TYPE_META[t].label}
                </button>
              ))}
            </div>
          ) : (
            <h2 className="flex-1 text-base font-semibold text-primary text-center">
              {seriesEdit ? 'Modifica serie' : editing ? 'Modifica' : 'Nuova transazione'}
            </h2>
          )}
          <span className="w-8 flex-none" aria-hidden />
        </div>

        <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-5 sm:px-7 pb-4 space-y-3 sm:space-y-4">
          {seriesEdit && (
            <p className="text-[11px] text-secondary bg-elevated rounded-xl px-3 py-2 leading-snug">
              🔁 Stai modificando l'intera serie. Le modifiche valgono per le occorrenze future; le voci già registrate non cambiano.
            </p>
          )}

          {/* Storni della spesa — elenco, totale stornato, spesa effettiva */}
          {canRefund && refundSummary && (
            <div className="bg-card rounded-2xl px-4 py-3.5">
              <div className="flex items-center justify-between mb-1">
                <p className="label-caps text-secondary">Storni</p>
                {refundSummary.refunded > 0 && (
                  <span className="text-[11px] font-semibold text-green balance-num">
                    −{formatCurrency(refundSummary.refunded)}
                  </span>
                )}
              </div>

              {myRefunds.length === 0 ? (
                <p className="text-[12px] text-secondary/70 leading-snug mb-3">
                  Se ti hanno rimborsato questa spesa, registralo: il conto torna su alla data
                  dell'accredito e la spesa scende nelle statistiche.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-divider mb-2">
                    {myRefunds.map(r => (
                      <li key={r.id}>
                        <button type="button" onClick={() => onEditRefund?.(r)}
                          className="w-full flex items-center gap-3 py-2 text-left">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-primary truncate">
                              {r.notes || 'Storno'}
                            </p>
                            <p className="text-[11px] text-secondary">
                              {formatDate(r.date)} · {getAcc(r.account).label}
                            </p>
                          </div>
                          <span className="text-[13px] font-semibold text-green balance-num flex-shrink-0">
                            +{formatCurrency(r.amount)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-divider mb-3">
                    <span className="text-[12px] font-semibold text-primary">Spesa effettiva</span>
                    <span className="text-[15px] font-bold text-primary balance-num">
                      {formatCurrency(refundSummary.net)}
                    </span>
                  </div>
                </>
              )}

              {refundSummary.fullyRefunded ? (
                <p className="text-[11px] text-secondary/70">Spesa stornata per intero.</p>
              ) : (
                <button type="button" onClick={() => onRegisterRefund?.(editing!.id)}
                  className="w-full py-2.5 rounded-xl bg-elevated text-gold text-sm font-medium">
                  Registra storno
                </button>
              )}
            </div>
          )}

          {/* Accesso secondario: "+" → Registra storno → scegli la spesa */}
          {!editing && !quickMode && onRegisterRefund && (
            <button type="button" onClick={() => onRegisterRefund(undefined)}
              className="w-full py-2.5 rounded-xl bg-elevated text-gold text-sm font-medium">
              ↩︎ Registra storno di una spesa
            </button>
          )}

          {/* Amount — su telefono lo scrive il tastierino in fondo, quindi il
              campo è readOnly e la tastiera di sistema non copre la modale.
              Da `sm` in su torna un input normale. */}
          <div className="text-center pt-1">
            <div className="flex items-baseline justify-center gap-1.5">
              <input
                type="text" inputMode="none" readOnly placeholder="0" value={amount}
                aria-label="Importo"
                className={`sm:hidden bg-transparent text-[54px] leading-none font-bold text-right outline-none balance-num placeholder:text-divider transition-colors ${amountError ? 'text-red' : 'text-primary'}`}
                style={{ width: `${Math.max(2, amount.length || 1)}ch` }}
              />
              <input
                type="text" inputMode="decimal" placeholder="0" value={amount}
                aria-label="Importo"
                onChange={e => { setAmount(e.target.value.replace(/[^\d.,]/g, '')); setAmountError(false); }}
                className={`hidden sm:block bg-transparent text-[44px] leading-none font-bold text-center w-52 outline-none balance-num placeholder:text-divider transition-colors ${amountError ? 'text-red' : 'text-primary'}`}
              />
              <span className={`text-[30px] font-semibold ${amountError ? 'text-red' : 'text-secondary'}`}>€</span>
            </div>
            {amountError && (
              <p className="text-xs mt-2 transition-opacity text-red">Inserisci un importo valido</p>
            )}
          </div>

          {/* Description — non è un campo sempre aperto: una spesa tipica si
              registra senza scriverla, e il campo appare al tocco. */}
          {!descOpen ? (
            <button type="button" onClick={() => setDescOpen(true)}
              className="w-full text-center py-2 text-[13px] text-secondary">
              Tocca per scrivere la descrizione
            </button>
          ) : (
          <Field label="Descrizione (facoltativa)">
            <input type="text" autoFocus placeholder={defaultDesc || 'es. Supermercato'} value={description} maxLength={80}
              onChange={e => {
                const v = e.target.value;
                setDescription(v);
                if (!categoryTouched && type !== 'transfer') {
                  // Admin: try the L1+L2 recognizer first, auto-apply only above
                  // the confidence threshold. Non-admin (recognize absent) and any
                  // low-confidence admin result fall back to plain guessCategory.
                  let applied = false;
                  if (recognize) {
                    const r = recognize(v, typeCats);
                    if (r && r.confidence >= RECOGNITION_THRESHOLD) { setCategory(r.categoryId); applied = true; }
                  }
                  if (!applied) {
                    const g = guessCategory(v, typeCats);
                    if (g) setCategory(g);
                  }
                }
              }}
              className="w-full bg-elevated rounded-2xl px-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
          </Field>
          )}

          {/* Category — riga di chip scorrevole; la griglia completa si apre da
              "altre ›". La categoria selezionata è sempre nella riga, anche se
              starebbe oltre le prime. */}
          {type !== 'transfer' && (
            <div>
              {catGridOpen ? (
                <Field label="Categoria">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {typeCats.map(c => {
                      const sel = category === c.id;
                      return (
                        <button key={c.id} type="button"
                          onClick={() => { setCategory(c.id); setCategoryTouched(true); setCatGridOpen(false); }}
                          className={`w-full px-2 py-2 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 truncate ${sel ? 'shadow-sm' : 'bg-surface text-secondary'}`}
                          style={sel ? { backgroundColor: c.color, color: '#0D0D0D' } : undefined}>
                          <span className="flex-shrink-0">{c.icon}</span>
                          <span className="truncate">{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </Field>
              ) : (
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-5 px-5 sm:-mx-7 sm:px-7 py-1">
                  {chipCats.map(c => {
                    const sel = category === c.id;
                    return (
                      <button key={c.id} type="button" onClick={() => { setCategory(c.id); setCategoryTouched(true); }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors flex-none ${
                          sel ? '' : 'bg-surface text-secondary'}`}
                        style={sel ? { backgroundColor: c.color, color: '#0D0D0D' } : undefined}>
                        <span>{c.icon}</span>{c.label}
                      </button>
                    );
                  })}
                  {typeCats.length > chipCats.length && (
                    <button type="button" onClick={() => setCatGridOpen(true)}
                      className="px-3 py-2 rounded-full text-[13px] font-medium whitespace-nowrap bg-surface text-secondary flex-none">
                      altre ›
                    </button>
                  )}
                </div>
              )}
              {/* La categoria l'ha indovinata la descrizione: dirlo evita il
                  sospetto che l'app abbia scelto a caso. */}
              {!categoryTouched && description.trim() !== '' && selCat && (
                <p className="text-[11.5px] text-secondary mt-1.5 px-1">
                  Suggerita da «{description.trim()}»
                </p>
              )}
            </div>
          )}

          {/* Accounts + Date */}
          {type === 'transfer' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Da conto">
                  <Select value={account} onChange={setAccount} options={accountOptions.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} />
                </Field>
                <Field label="A conto">
                  <Select value={toAccount} onChange={setToAccount}
                    options={accountOptions.filter(a => a.id !== account).map(a => ({ value: a.id, label: `${a.icon} ${a.label}` }))} />
                </Field>
              </div>
              <DateField date={date} td={td} yd={yd} setDate={setDate} seriesEdit={seriesEdit} />
            </>
          ) : quickMode ? (
            /* Quick mode: conto + data collapsed under "Dettagli avanzati" */
            <>
              <button type="button" onClick={() => setAdvancedOpen(s => !s)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-secondary">
                Dettagli avanzati
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {advancedOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Conto">
                    <Select value={account} onChange={setAccount}
                      options={[
                        ...(canNoAccount ? [{ value: '', label: '🚫 Senza conto (TFR / datore)' }] : []),
                        ...accountOptions.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` })),
                      ]} />
                  </Field>
                  <DateField date={date} td={td} yd={yd} setDate={setDate} seriesEdit={seriesEdit} />
                </div>
              )}
            </>
          ) : (
            /* Conto e data in UNA riga: il default è "il conto di sempre, oggi",
               e chi non deve cambiarlo non apre nulla. */
            <div>
              <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-base">{account ? getAcc(account).icon : '🚫'}</span>
                  <span className="text-[13.5px] text-primary truncate">
                    {account ? getAcc(account).label : 'Senza conto'}
                  </span>
                </span>
                <span className="w-px self-stretch bg-divider flex-none" />
                <span className="text-[13.5px] text-primary flex-1 min-w-0 truncate">
                  {date === td ? 'Oggi' : date === yd ? 'Ieri' : formatDate(date)}
                </span>
                <button type="button" onClick={() => setWhenWhereOpen(o => !o)}
                  className="text-[12px] font-semibold text-gold flex-none">
                  {whenWhereOpen ? 'Chiudi' : 'Modifica'}
                </button>
              </div>
              {whenWhereOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <Field label="Conto">
                    <Select value={account} onChange={setAccount}
                      options={[
                        ...(canNoAccount ? [{ value: '', label: '🚫 Senza conto (TFR / datore)' }] : []),
                        ...accountOptions.map(a => ({ value: a.id, label: `${a.icon} ${a.label}` })),
                      ]} />
                  </Field>
                  <DateField date={date} td={td} yd={yd} setDate={setDate} seriesEdit={seriesEdit} />
                </div>
              )}
            </div>
          )}

          {canNoAccount && account === '' && (
            <p className="text-[11px] text-secondary -mt-1 px-1 leading-snug">
              Questo versamento non esce da nessun conto: aumenta il capitale investito senza intaccare la liquidità.
            </p>
          )}

          {/* Una sola riga per tutto ciò che è opzionale: serie, spesa condivisa,
              rate, commissione, TFR, distribuzione. Prima erano sei blocchi in
              fila, metà dei quali visibili solo per certi tipi. */}
          <button type="button" onClick={() => setShowMore(s => !s)}
            className="w-full glass-card rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-left">
            <span className="text-[13px] text-secondary">Ricorrente, condivisa, a rate…</span>
            <span className="flex items-center gap-1 text-[12px] font-semibold text-gold flex-none">
              Opzioni
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform ${showMore ? 'rotate-180' : ''}`}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>

          {showMore && (
            <>
          {/* TFR portion — pension-fund investments only */}
          {isPensionInvest && (
            <Field label="Di cui TFR (facoltativo)">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                <input type="text" inputMode="decimal" placeholder="0,00" value={tfr}
                  onChange={e => setTfr(e.target.value.replace(/[^\d.,]/g, ''))}
                  className="w-full bg-elevated rounded-2xl pl-8 pr-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
              </div>
              <p className="text-[11px] mt-1.5 px-1 text-secondary">
                Quanta parte di questo versamento proviene dal TFR.
              </p>
            </Field>
          )}

          {/* Commission — transfers and investments with a source account */}
          {(type === 'transfer' || (type === 'investment' && account !== '')) && (
            <Field label="Commissione (opzionale)">
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                <input type="text" inputMode="decimal" placeholder="0,00" value={fee}
                  onChange={e => setFee(e.target.value.replace(/[^\d.,]/g, ''))}
                  className="w-full bg-elevated rounded-2xl pl-8 pr-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
              </div>
              <p className={`text-[11px] mt-1.5 px-1 ${parseFloat(fee.replace(',', '.')) > 0 ? 'text-secondary' : 'invisible'}`}>
                Registrata come spesa separata in "Altro"
              </p>
            </Field>
          )}

          {/* Distribuzione statistica — one-off investment deposits only */}
          {type === 'investment' && (editing?.direction ?? 'in') !== 'out' && seriesKind === 'none' && (
            <Field label="Distribuzione statistica (opzionale)">
              <div className="grid grid-cols-5 gap-1.5">
                {([['none', 'Nessuna'], [3, '3 mesi'], [6, '6 mesi'], [12, '12 mesi'], ['custom', 'Personal.']] as ['none' | 'custom' | number, string][]).map(([v, lbl]) => (
                  <button key={String(v)} type="button" onClick={() => setSpreadChoice(v)}
                    className={`py-2 rounded-xl text-[11px] font-semibold transition-colors ${spreadChoice === v ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
              {spreadChoice === 'custom' && (
                <input type="text" inputMode="numeric" value={spreadCustom} placeholder="2–120 mesi"
                  onChange={e => setSpreadCustom(e.target.value.replace(/\D/g, ''))}
                  className="mt-2 w-full bg-elevated rounded-xl px-3 py-2.5 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
              )}
              {spreadChoice !== 'none' && (
                <p className="text-[11px] mt-1.5 px-1 text-secondary leading-snug">
                  Solo nelle statistiche: il movimento resta unico, conti e flusso di cassa
                  cambiano interamente alla data reale.
                </p>
              )}
            </Field>
          )}

          {/* Spesa condivisa — quote rimborsate dagli altri (NON gli storni:
              quelli sono `type: 'refund'`, legati alla spesa via refundOf). */}
          {type === 'expense' && (
            <ToggleBlock
              title="Spesa condivisa"
              subtitle="Registra le quote che ti rimborsano — diventano trasferimenti, il resto resta spesa"
              on={isShared}
              onToggle={() => {
                const next = !isShared;
                setIsShared(next);
                if (!next) setReimbursements([]);
                else if (reimbursements.length === 0) addReimb();
              }}>
              {(() => {
                const total = parseFloat(amount.replace(',', '.')) || 0;
                const sum = reimbursements.reduce((s, r) => s + (parseFloat(r.amount.replace(',', '.')) || 0), 0);
                const over = total > 0 && sum > total;
                const net = total - sum;
                return (
                  <div className="space-y-2.5">
                    {reimbursements.map((r, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="relative w-24 flex-shrink-0">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                          <input type="text" inputMode="decimal" placeholder="0" value={r.amount}
                            onChange={e => updateReimb(i, { amount: e.target.value.replace(/[^\d.,]/g, '') })}
                            className="w-full bg-elevated rounded-xl pl-6 pr-2 py-2.5 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
                        </div>
                        <select value={r.account} onChange={e => updateReimb(i, { account: e.target.value })}
                          className="flex-1 min-w-0 bg-elevated rounded-xl px-3 py-2.5 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 appearance-none">
                          {visibleAccounts.map(a => <option key={a.id} value={a.id} className="bg-elevated">{a.icon} {a.label}</option>)}
                        </select>
                        <button type="button" onClick={() => removeReimb(i)}
                          className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary flex-shrink-0">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={addReimb}
                      className="w-full py-2.5 rounded-xl bg-elevated text-gold text-sm font-medium">
                      + Aggiungi quota rimborsata
                    </button>
                    {reimbursements.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <Row label="Totale rimborsato dagli altri" value={formatCurrency(sum)} muted />
                        <Row label="La tua spesa effettiva" value={formatCurrency(net < 0 ? 0 : net)} />
                        {over && <p className="text-xs text-red">Le quote superano il totale</p>}
                      </div>
                    )}
                  </div>
                );
              })()}
            </ToggleBlock>
          )}

          {/* Serie: nessuna / ricorrente / abbonamento / a rate */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3">
              <p className="text-sm font-medium text-primary">Serie</p>
              <p className="text-xs text-secondary mt-0.5">Si ripete nel tempo: ricorrenza, abbonamento o piano a rate</p>
              <div className="grid grid-cols-4 gap-1.5 mt-3">
                {([['none', 'Nessuna'], ['recurring', 'Ricorrente'], ['subscription', 'Abbonam.'], ['installment', 'A rate']] as [ModalSeriesKind, string][]).map(([k, lbl]) => (
                  <button key={k} type="button" onClick={() => setSeriesKind(k)}
                    className={`py-2 rounded-xl text-[11px] font-semibold transition-colors ${seriesKind === k ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {seriesKind !== 'none' && (
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

                {seriesKind !== 'installment' ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-secondary">Fine ricorrenza</label>
                        {recurringUntil && (
                          <button type="button" onClick={() => setRecurringUntil('')}
                            className="text-[11px] font-medium text-gold">
                            Rimuovi
                          </button>
                        )}
                      </div>
                      <input type="date" value={recurringUntil} onChange={e => setRecurringUntil(e.target.value)}
                        className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-xl px-3 py-3.5 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40" />
                      <p className={`text-[11px] mt-1.5 px-1 ${recurringUntil ? 'text-secondary' : 'invisible'}`}>
                        {recurringUntil ? `Si ripete fino al ${formatDate(recurringUntil)}, poi smette` : 'placeholder'}
                      </p>
                    </div>

                    {seriesKind === 'subscription' && (() => {
                      const amt = parseFloat(amount.replace(',', '.')) || 0;
                      const me = monthlyEquivalent(amt, recurringFreq);
                      return (
                        <div className="bg-elevated rounded-xl px-3 py-2.5 space-y-1">
                          <Row label="Equivalente mensile" value={amt > 0 ? formatCurrency(me) : '—'} muted />
                          <Row label="Equivalente annuale" value={amt > 0 ? formatCurrency(me * 12) : '—'} muted />
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  (() => {
                    const tot = parseFloat(instTotal.replace(',', '.')) || 0;
                    const n = parseInt(instCount, 10) || 0;
                    const rata = tot > 0 && n > 0 ? r2(tot / n) : 0;
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-medium text-secondary mb-1.5 block">Totale piano (€)</label>
                            <input type="text" inputMode="decimal" value={instTotal}
                              onChange={e => setInstTotal(e.target.value.replace(/[^\d.,]/g, ''))}
                              placeholder="0,00"
                              className="w-full bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-secondary mb-1.5 block">Numero rate</label>
                            <input type="text" inputMode="numeric" value={instCount}
                              onChange={e => setInstCount(e.target.value.replace(/\D/g, ''))}
                              placeholder="12"
                              className="w-full bg-elevated rounded-xl px-3 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 balance-num" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-secondary mb-1.5 block">Data prima rata</label>
                          <input type="date" value={instFirstDate} onChange={e => setInstFirstDate(e.target.value)}
                            className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-xl px-3 py-3.5 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40" />
                        </div>
                        <div className="bg-elevated rounded-xl px-3 py-2.5 space-y-1">
                          <Row label="Importo rata" value={rata > 0 ? formatCurrency(rata) : '—'} muted />
                          <Row label="Ultima rata"
                            value={n > 0 && instFirstDate ? formatDate(nthOccurrenceDate(instFirstDate, recurringFreq, n)) : '—'} muted />
                        </div>
                        <p className="text-[11px] text-secondary px-1 leading-snug">
                          L'importo della rata e la fine del piano sono calcolati da totale, numero rate e frequenza.
                        </p>
                      </>
                    );
                  })()
                )}
              </div>
            )}
          </div>
            </>
          )}

          {editing && (
            confirmDelete
              ? <button type="button" disabled={saving}
                  onClick={() => void commit([editing.id, ...groupTransfers.map(t => t.id)], [], false)}
                  className="w-full py-3 rounded-2xl font-semibold text-[#E08B8B] text-sm bg-[#E08B8B]/15 disabled:opacity-60">
                  {seriesEdit ? 'Conferma: elimina la serie' : 'Conferma eliminazione'}
                </button>
              : <button type="button" onClick={() => setConfirmDelete(true)}
                  className="w-full py-3 rounded-2xl font-medium text-[#E08B8B] text-sm">
                  {seriesEdit ? 'Elimina serie' : 'Elimina transazione'}
                </button>
          )}
          </div>

          {/* Fixed action bar: part of the card's mask (like the header), the
              form scrolls in the window above it. */}
          <div className="shrink-0 px-5 sm:px-7 pt-3 pb-5 sm:pb-7 bg-[var(--modal-hdr-bg)] space-y-2">
            {saveError && (
              <p className="text-xs text-red px-1 leading-snug">
                Salvataggio non riuscito: nessun dato è stato scritto (movimento e controvalore
                si aggiornano insieme). Controlla la connessione e riprova.
              </p>
            )}
            {/* Telefono: tastierino 4×4 — le cifre stanno dove sta il pollice e
                Salva è dentro la stessa griglia, così una spesa tipica si
                registra senza mai alzare la mano. Da `sm` in su la modale resta
                la sheet centrata di prima e il tastierino sparisce. */}
            <div className="sm:hidden">
              <div className="grid grid-cols-4 grid-rows-4 gap-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0'].map(k => (
                  <KeypadKey key={k} onClick={() => pressKey(k)}>{k}</KeypadKey>
                ))}
                <KeypadKey onClick={() => pressKey('back')} label="Cancella">⌫</KeypadKey>

                <button type="submit" disabled={saving}
                  className="row-span-2 col-start-4 row-start-1 rounded-2xl cta-gold-fill text-[15px] font-semibold
                             active:scale-[0.98] transition-transform disabled:opacity-60">
                  {saving ? '…' : saveError ? 'Riprova' : editing ? 'Salva' : 'Salva'}
                </button>

                {!editing ? (
                  <button type="button" onClick={() => doSubmit(true)} disabled={saving}
                    className="row-span-2 col-start-4 row-start-3 rounded-2xl bg-elevated text-primary text-[15px] font-semibold
                               active:scale-[0.98] transition-transform disabled:opacity-60">
                    +1
                  </button>
                ) : (
                  <span className="row-span-2 col-start-4 row-start-3" aria-hidden />
                )}
              </div>
              {!editing && (
                <p className="text-[12px] text-secondary text-center mt-2">
                  <span className="font-semibold text-primary">+1</span> salva e riapre subito la modale.
                </p>
              )}
            </div>

            {/* Desktop: i bottoni di sempre. */}
            <div className="hidden sm:block space-y-2">
              <button type="submit" disabled={saving}
                className="w-full py-3 rounded-2xl font-semibold transition-transform active:scale-[0.98] disabled:opacity-60"
                style={{ backgroundColor: typeColor(type, theme), color: typeOnColor(theme) }}>
                {saving ? 'Salvataggio…' : saveError ? 'Riprova' : editing ? 'Salva modifiche' : `Aggiungi ${TYPE_META[type].label.toLowerCase()}`}
              </button>

              {!editing && (
                <button type="button" onClick={() => doSubmit(true)} disabled={saving}
                  className="w-full py-2.5 rounded-2xl text-sm font-medium text-secondary bg-elevated active:bg-card-hover transition-colors disabled:opacity-60">
                  Salva e aggiungi un'altra
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleBlock({ title, subtitle, on, onToggle, children }: {
  title: string; subtitle: string; on: boolean;
  onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <div>
          <p className="text-sm font-medium text-primary">{title}</p>
          <p className="text-xs text-secondary mt-0.5">{subtitle}</p>
        </div>
        <div className={`w-11 h-6 rounded-full transition-colors relative flex-shrink-0 ml-3 ${on ? 'bg-gold' : 'bg-secondary/20'}`}>
          <span className={`absolute left-0 top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </div>
      </button>
      {on && <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-secondary">{label}</span>
      <span className={`font-semibold balance-num ${muted ? 'text-secondary' : 'text-primary'}`}>{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-2 px-1">{label}</label>
      {children}
    </div>
  );
}

function DateField({ date, td, yd, setDate, seriesEdit = false }: { date: string; td: string; yd: string; setDate: (d: string) => void; seriesEdit?: boolean }) {
  return (
    <Field label={seriesEdit ? 'Data serie' : 'Data'}>
      <div className="flex gap-2">
        <button type="button" onClick={() => setDate(td)}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${date === td ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>
          Oggi
        </button>
        <button type="button" onClick={() => setDate(yd)}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${date === yd ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>
          Ieri
        </button>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="flex-1 min-w-0 bg-elevated rounded-xl px-3 py-2 text-primary text-xs outline-none focus:ring-1 focus:ring-gold/40" />
      </div>
      {seriesEdit ? (
        <p className="text-[11px] text-secondary mt-2 flex items-center gap-1">
          🔁 Le occorrenze future della serie partono da questa data.
        </p>
      ) : date > td && (
        <p className="text-[11px] text-secondary mt-2 flex items-center gap-1">
          🗓️ Data futura: sarà un movimento previsto e verrà conteggiato automaticamente alla data scelta.
        </p>
      )}
    </Field>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-elevated rounded-2xl px-4 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40 appearance-none">
      {options.map(o => <option key={o.value} value={o.value} className="bg-elevated">{o.label}</option>)}
    </select>
  );
}

/** Tasto del tastierino. */
function KeypadKey({ children, onClick, label }: {
  children: React.ReactNode; onClick: () => void; label?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="h-12 rounded-2xl bg-elevated text-primary text-[20px] font-semibold
                 active:bg-card-hover transition-colors">
      {children}
    </button>
  );
}
