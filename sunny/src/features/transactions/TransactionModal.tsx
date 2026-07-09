import { useState, useEffect } from 'react';
import { Transaction, TransactionType, TYPE_META, TYPE_ORDER, RecurrenceRule, SeriesMeta, SeriesKind, AccountDef, typeColor, typeOnColor } from '../../types';
import { formatCurrency, formatDate, guessCategory } from '../../utils';
import { Candidate, Recognition, RECOGNITION_THRESHOLD } from './categoryRecognition';
import { useSettings } from '../../shared/providers/settings';
import { expandRecurringOnCreate, shouldExpandOnSave, monthlyEquivalent, nthOccurrenceDate } from '../../shared/recurrence';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
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
  onClose: () => void;
  onSave: (deleteIds: string[], create: Omit<Transaction, 'id'>[]) => void;
}

interface Reimb { amount: string; account: string }

/** Series choice in the modal: none, or one of the smart-series kinds. */
type ModalSeriesKind = 'none' | SeriesKind;

const r2 = (n: number) => Math.round(n * 100) / 100;

const today = () => new Date().toISOString().slice(0, 10);
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

export function TransactionModal({ open, editing, groupTransfers = [], seriesEdit = false, defaultType, recognize, onClose, onSave }: Props) {
  const { categories, accounts, visibleCategories, visibleAccounts, enableInvestments, detailedInvestments, theme } = useSettings();
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

  const [amountError, setAmountError] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Quick mode: defaultType set + not editing → hide type selector, collapse date/account
  const quickMode = !editing && !!defaultType && defaultType !== 'transfer';

  useEffect(() => {
    if (!open) return;
    if (editing) {
      // Shared-expense reconstruction only folds the storni (transfers): an
      // investment in the group is the fee parent and must not be summed in.
      const groupStorni = groupTransfers.filter(t => t.type === 'transfer');
      const hasGroup = editing.type === 'expense' && !!editing.groupId && groupStorni.length > 0;
      const transfersSum = groupStorni.reduce((s, t) => s + t.amount, 0);
      setType(editing.type); setDescription(editing.description);
      setAmount(String(hasGroup ? editing.amount + transfersSum : editing.amount));
      setDate(editing.date);
      setCategory(editing.category); setAccount(editing.account);
      setToAccount(editing.toAccount ?? visibleAccounts[1]?.id ?? '');
      setNotes(editing.notes ?? '');
      setIsShared(hasGroup || !!editing.shared);
      setReimbursements(hasGroup
        ? groupStorni.map(t => ({ amount: String(t.amount), account: t.toAccount ?? '' }))
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
    }
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
  const selCat = categories.find(c => c.id === category);
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
    setAmountError(false); setConfirmDelete(false); setShowMore(false);
    setCategoryTouched(true); // keep type, category, account, date
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
    // recreates its storni (transfers); editing a transfer/investment recreates
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

    const storni = (type === 'expense' && isShared)
      ? reimbursements
          .map(r => ({ amount: parseFloat(r.amount.replace(',', '.')), account: r.account }))
          .filter(r => r.amount > 0 && r.account)
      : [];
    const sum = storni.reduce((s, r) => s + r.amount, 0);

    if (storni.length > 0) {
      if (sum > value) return;
      const net = value - sum;
      const groupId = editing?.groupId ?? crypto.randomUUID();
      const create: Omit<Transaction, 'id'>[] = [];
      for (const r of storni) {
        create.push({
          type: 'transfer', description: `Storno · ${desc}`, amount: r.amount, date: effDate,
          category: 'trasferimento', account, toAccount: r.account, groupId,
          // A SHARED series repeats WHOLE: the storno is its own series, advancing
          // in lockstep with the expense (same rule, same dates), so every month
          // gets its transfer too. The shared groupId + the same-date guard at
          // edit time link each month's expense to that month's storno.
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
      onSave(deleteIds, finalize(create));
      if (keepOpen && !editing) { resetKeepContext(); } else { onClose(); }
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

    const create: Omit<Transaction, 'id'>[] = [{
      type, description: desc, amount: value, date: effDate,
      category: type === 'transfer' ? 'trasferimento' : category,
      account,
      toAccount: type === 'transfer' ? toAccount : undefined,
      notes: notes.trim() || undefined,
      recurring, seriesId, seriesMeta,
      ...(type === 'investment' && tfrClean ? { tfr: tfrClean } : {}),
      // Investments keep their flow direction on edit ('out' stays a withdrawal);
      // anything created here is a deposit ('in').
      ...(type === 'investment' ? { direction: editing?.direction ?? 'in' as const } : {}),
      ...(groupId ? { groupId } : {}),
    }];
    if (hasFee) {
      create.push({
        type: 'expense', description: `Commissione · ${desc}`,
        amount: feeVal, date: effDate, category: 'altro', account, groupId: groupId!,
      });
    }
    if (account) try { localStorage.setItem('sunny:lastAccount', account); } catch { /* ignore */ }
    onSave(deleteIds, finalize(create));
    if (keepOpen && !editing) { resetKeepContext(); } else { onClose(); }
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
      <div className="relative w-full max-w-none h-full max-h-full sm:max-w-lg sm:h-auto sm:max-h-[88vh] glass-elevated rounded-3xl shadow-float overflow-hidden flex flex-col animate-sheet-up">
        <div className="shrink-0 bg-[var(--modal-hdr-bg)] px-5 pt-5 pb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">{seriesEdit ? 'Modifica serie' : editing ? 'Modifica' : 'Nuova transazione'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary">✕</button>
        </div>

        <form onSubmit={submit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide px-5 sm:px-7 pb-4 space-y-3 sm:space-y-4">
          {seriesEdit && (
            <p className="text-[11px] text-secondary bg-elevated rounded-xl px-3 py-2 leading-snug">
              🔁 Stai modificando l'intera serie. Le modifiche valgono per le occorrenze future; le voci già registrate non cambiano.
            </p>
          )}

          {/* Type segmented — hidden in quick mode (type is pre-set). "Investimento"
              is not offered here: investments are created from the /investments
              screen. It only appears when editing an existing investment. */}
          {!quickMode && (
            <div className="grid gap-1.5 bg-surface rounded-2xl p-1" style={{ gridTemplateColumns: `repeat(${availableTypes.length}, 1fr)` }}>
              {availableTypes.map(t => (
                <button key={t} type="button"
                  onClick={() => setType(t)}
                  className={`py-2 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-semibold transition-all ${type === t ? 'shadow-sm' : 'text-secondary'}`}
                  style={type === t ? { backgroundColor: typeColor(t, theme), color: typeOnColor(theme) } : undefined}>
                  {TYPE_META[t].label}
                </button>
              ))}
            </div>
          )}

          {/* Amount */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              <span className={`text-2xl font-semibold ${amountError ? 'text-red' : 'text-primary'}`}>€</span>
              <input
                type="text" inputMode="decimal" placeholder="0" value={amount}
                onChange={e => { setAmount(e.target.value.replace(/[^\d.,]/g, '')); setAmountError(false); }}
                className={`bg-transparent text-4xl font-bold text-center w-40 outline-none balance-num placeholder:text-divider transition-colors ${amountError ? 'text-red' : 'text-primary'}`}
              />
            </div>
            {amountError && (
              <p className="text-xs mt-1 transition-opacity text-red">Inserisci un importo valido</p>
            )}
          </div>

          {/* Description */}
          <Field label="Descrizione (facoltativa)">
            <input type="text" placeholder={defaultDesc || 'es. Supermercato'} value={description} maxLength={80}
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

          {/* Category */}
          {type !== 'transfer' && (
            <Field label="Categoria">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {typeCats.map(c => {
                  const sel = category === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => { setCategory(c.id); setCategoryTouched(true); }}
                      className={`w-full px-2 py-2 rounded-full text-xs font-medium transition-all flex items-center justify-center gap-1.5 truncate ${sel ? 'shadow-sm' : 'bg-surface text-secondary'}`}
                      style={sel ? { backgroundColor: c.color, color: '#0D0D0D' } : undefined}>
                      <span className="flex-shrink-0">{c.icon}</span>
                      <span className="truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
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

          {canNoAccount && account === '' && (
            <p className="text-[11px] text-secondary -mt-1 px-1 leading-snug">
              Questo versamento non esce da nessun conto: aumenta il capitale investito senza intaccare la liquidità.
            </p>
          )}

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

          {/* Vedi altro — opzioni avanzate */}
          <button type="button" onClick={() => setShowMore(s => !s)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-secondary">
            {showMore ? 'Vedi meno' : 'Vedi altro'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${showMore ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showMore && (
            <>
          {/* Shared expense — storni / rimborsi */}
          {type === 'expense' && (
            <ToggleBlock
              title="Spesa condivisa"
              subtitle="Registra gli storni ricevuti — diventano trasferimenti, il resto resta spesa"
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
                      + Aggiungi storno
                    </button>
                    {reimbursements.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <Row label="Totale stornato" value={formatCurrency(sum)} muted />
                        <Row label="La tua spesa effettiva" value={formatCurrency(net < 0 ? 0 : net)} />
                        {over && <p className="text-xs text-red">Gli storni superano il totale</p>}
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
              ? <button type="button"
                  onClick={() => { onSave([editing.id, ...groupTransfers.map(t => t.id)], []); onClose(); }}
                  className="w-full py-3 rounded-2xl font-semibold text-[#E08B8B] text-sm bg-[#E08B8B]/15">
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
            <button type="submit"
              className="w-full py-3 rounded-2xl font-semibold transition-transform active:scale-[0.98]"
              style={{ backgroundColor: typeColor(type, theme), color: typeOnColor(theme) }}>
              {editing ? 'Salva modifiche' : `Aggiungi ${TYPE_META[type].label.toLowerCase()}`}
            </button>

            {!editing && (
              <button type="button" onClick={() => doSubmit(true)}
                className="w-full py-2.5 rounded-2xl text-sm font-medium text-secondary bg-elevated active:bg-card-hover transition-colors">
                Salva e aggiungi un'altra
              </button>
            )}
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
