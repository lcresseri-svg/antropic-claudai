import { useDraftDismiss } from '../../shared/hooks/useDraftDismiss';
import { DiscardConfirmation } from '../../shared/components/DiscardConfirmation';
import { useUiVersion } from '../../shared/providers/UiVersionProvider';
import { DialogSurface } from '../../shared/components/DialogSurface';
import { useState, useEffect } from 'react';
import { TransactionType, TYPE_META, TYPE_ORDER, FundType, FUND_TYPE_META, FUND_TYPE_ORDER, typeColor, typeOnColor } from '../../types';
import { EMOJI_CHOICES, COLOR_CHOICES } from '../../defaults';
import { useSettings } from '../../shared/providers/settings';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';
import { macroKind } from '../../shared/macroCategories';

export interface DefDraft {
  id: string;
  label: string;
  icon: string;
  color: string;
  macroCategoryId?: string;
  kind?: TransactionType;
  initialBalance?: number;
  isInvestment?: boolean;
  excludeFromNetWorth?: boolean;
  fundType?: FundType;
  tfrAmount?: number;
  /** Investment categories only: subscription date (never in the future). */
  subscriptionDate?: string;
  /** Expense categories only: total amount financed (loan tracking). */
  financedAmount?: number;
}

interface Props {
  entity?: 'macro';
  open: boolean;
  draft: DefDraft | null;
  withKind: boolean;
  canDelete: boolean;
  showFundType?: boolean;   // detailed-investments mode (per-user gated)
  showFinancing?: boolean;  // loan tracking on expense categories (admin-only rollout)
  onSave: (d: DefDraft) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  onClose: () => void;
}

export function EditDefSheet({ entity, open, draft, withKind, canDelete, showFundType, showFinancing, onSave, onDelete, onClose }: Props) {
  const { theme,macroCategories=[] } = useSettings();
  const [macroCategoryId,setMacroCategoryId]=useState('');
  const [saving,setSaving]=useState(false),[error,setError]=useState('');
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('•');
  const [color, setColor] = useState(COLOR_CHOICES[0]);
  const [kind, setKind] = useState<TransactionType>('expense');
  const [initialBalance, setInitialBalance] = useState('');
  const [excludeFromNetWorth, setExcludeFromNetWorth] = useState(false);
  const [fundType, setFundType] = useState<FundType | ''>('');
  const [tfrAmount, setTfrAmount] = useState('');
  const [subscriptionDate, setSubscriptionDate] = useState('');
  const [financedAmount, setFinancedAmount] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [emojiExpanded, setEmojiExpanded] = useState(false);

  useEffect(() => {
    if (!open || !draft) return;
    setMacroCategoryId(draft.macroCategoryId??'');setError('');
    setLabel(draft.label); setIcon(draft.icon); setColor(draft.color);
    setKind(draft.kind ?? 'expense');
    setInitialBalance(draft.initialBalance !== undefined ? String(draft.initialBalance) : '');
    setExcludeFromNetWorth(draft.excludeFromNetWorth ?? false);
    setFundType(draft.fundType ?? '');
    setTfrAmount(draft.tfrAmount !== undefined ? String(draft.tfrAmount) : '');
    setSubscriptionDate(draft.subscriptionDate ?? '');
    setFinancedAmount(draft.financedAmount !== undefined ? String(draft.financedAmount) : '');
    setConfirmingDelete(false);
    setEmojiExpanded(false);
  }, [open, draft]);

  const ui3=useUiVersion()==='3.0';
  const dismiss=useDraftDismiss({open,signature:JSON.stringify([label,icon,color,kind,initialBalance,excludeFromNetWorth,fundType,tfrAmount,subscriptionDate,financedAmount,macroCategoryId]),saving,onClose});
  const requestClose=()=>{if(saving)return;if(!ui3)onClose();else dismiss.requestDismiss();};
  useEscapeKey(requestClose, open&&!dismiss.confirm);

  if (!open || !draft) return null;

  // A category always carries a `kind` in its draft; an account never does.
  // `withKind` only controls whether the type *selector* is shown (it's hidden
  // when adding inside a specific section), so it must NOT decide the kind —
  // doing so dropped the section's kind and made everything an expense.
  const isMacro=entity==='macro';
  const isCategory = !isMacro && draft.kind !== undefined;
  const isInvestmentCategory = isCategory && kind === 'investment';
  const showBalance = (!isMacro && !isCategory && !draft.isInvestment) || isInvestmentCategory;
  const showFunds = isInvestmentCategory && !!showFundType;
  const isExpenseCategory = isCategory && kind === 'expense';
  const hasMacroCategory = isExpenseCategory || isInvestmentCategory;
  const availableMacros = macroCategories.filter(m=>macroKind(m)===kind);
  const showFinancingField = isExpenseCategory && !!showFinancing;

  const noun = isMacro?'macrocategoria':isCategory ? 'categoria' : 'conto';
  const sheetTitle = canDelete
    ? `Modifica ${noun}`
    : `${isCategory||isMacro ? 'Nuova' : 'Nuovo'} ${noun}`;

  const todayISO = new Date().toISOString().slice(0, 10);
  // Never in the future — the date anchors past history for duration/XIRR.
  const validSubscription = subscriptionDate !== '' && subscriptionDate <= todayISO
    ? subscriptionDate : undefined;

  const save = async () => {
    if (!label.trim()) return;
    const parsedBalance = initialBalance !== '' ? parseFloat(initialBalance) : undefined;
    const validBalance = parsedBalance !== undefined && !isNaN(parsedBalance) ? parsedBalance : undefined;
    const parsedTfr = tfrAmount !== '' ? parseFloat(tfrAmount) : undefined;
    const validTfr = parsedTfr !== undefined && !isNaN(parsedTfr) ? parsedTfr : undefined;
    const parsedFinanced = financedAmount !== '' ? parseFloat(financedAmount) : undefined;
    const validFinanced = parsedFinanced !== undefined && !isNaN(parsedFinanced) ? parsedFinanced : undefined;
    setSaving(true);setError('');
    try {await onSave({
      id: draft.id, label: label.trim(), icon, color,
      kind: isCategory || isMacro ? kind : undefined,
      initialBalance: showBalance ? validBalance : undefined,
      excludeFromNetWorth: !isCategory && excludeFromNetWorth ? true : undefined,
      fundType: showFunds && fundType ? fundType : undefined,
      tfrAmount: showFunds && fundType === 'pension' ? validTfr : undefined,
      subscriptionDate: isInvestmentCategory ? validSubscription : undefined,
      financedAmount: showFinancingField ? validFinanced : undefined,
      macroCategoryId: hasMacroCategory ? macroCategoryId : undefined,
    });}catch(e){setError(e instanceof Error?e.message:'Salvataggio non riuscito. Riprova.');}finally{setSaving(false);}
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />
      <DialogSurface onInputCapture={dismiss.capture} onChangeCapture={dismiss.capture} onPointerDownCapture={dismiss.capture} onKeyDownCapture={dismiss.capture} title={sheetTitle} onDismiss={requestClose} kind="detail" className="relative w-full max-w-md glass-elevated rounded-3xl p-6 shadow-float animate-sheet-up max-h-[90dvh] overflow-y-auto overscroll-contain scrollbar-hide">
        <fieldset disabled={saving} className="min-w-0">
        <h2 className="text-base font-semibold text-primary mb-4">{sheetTitle}</h2>
        <p className="text-xs font-medium text-secondary mb-2 px-1">Nome e icona</p>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: color + '22' }}>{icon}</span>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nome" aria-label="Nome" maxLength={isMacro?80:24} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            className="flex-1 min-w-0 bg-elevated rounded-2xl px-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
        </div>

        {(withKind || isMacro) && (
          <div className="mb-5">
            <p className="text-xs font-medium text-secondary mb-2 px-1">Tipo</p>
            <div className={`ui-def-type-picker grid ${isMacro?'grid-cols-2':ui3?'grid-cols-2 sm:grid-cols-4':'grid-cols-4'} gap-1.5 bg-surface rounded-2xl p-1.5`}>
              {(isMacro ? (['expense','investment'] as const) : TYPE_ORDER).map(t => (
                <button type="button" key={t} aria-pressed={kind===t} onClick={() => {if(t!==kind)setMacroCategoryId('');setKind(t);}}
                  className={`py-2 rounded-xl text-[11px] font-semibold transition-all ${kind === t ? 'shadow-sm' : 'text-secondary'}`}
                  style={kind === t ? { backgroundColor: typeColor(t, theme), color: typeOnColor(theme) } : undefined}>
                  {isMacro?(t==='expense'?'Spese':'Investimenti'):TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>
        )}

        {hasMacroCategory && <label className="block mb-5 text-sm text-secondary">Macrocategoria
          <select aria-label="Macrocategoria" value={macroCategoryId} onChange={e=>setMacroCategoryId(e.target.value)} className="block w-full min-w-0 rounded-xl bg-elevated px-3 py-3 mt-2 text-primary">
            <option value="">Senza macrocategoria</option>
            {availableMacros.map(m=><option key={m.id} value={m.id}>{m.icon} {m.label}</option>)}
          </select>
          {availableMacros.length===0&&<span className="block mt-2 text-xs">Puoi creare le macrocategorie {isInvestmentCategory?'di investimento':'di spesa'} in Impostazioni · Gestione.</span>}
        </label>}
        <p className="text-xs font-medium text-secondary mb-2 px-1">Icona</p>
        <div className="ui-icon-picker grid grid-cols-8 gap-1.5">
          {(emojiExpanded ? EMOJI_CHOICES : EMOJI_CHOICES.slice(0, 24)).map(e => (
            <button key={e} onClick={() => { setIcon(e); setEmojiExpanded(false); }}
              className={`aspect-square rounded-xl flex items-center justify-center text-lg transition-colors ${
                icon === e ? 'bg-gold/20 ring-1 ring-gold' : 'bg-elevated'
              }`}>{e}</button>
          ))}
        </div>
        {EMOJI_CHOICES.length > 24 && (
          <button type="button" onClick={() => setEmojiExpanded(v => !v)}
            className="w-full mt-2 mb-5 py-1.5 text-xs font-medium text-gold">
            {emojiExpanded ? 'Mostra meno' : 'Mostra altre icone'}
          </button>
        )}

        <p className="text-xs font-medium text-secondary mb-2 px-1">Colore</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {COLOR_CHOICES.map(c => (
            <button aria-label={`Colore ${c}`} key={c} onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-offset-bg ring-primary scale-110' : ''}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>

        {!isCategory && !isMacro && (
          <label className="mb-6 flex items-center gap-3 rounded-2xl bg-elevated px-4 py-3.5 cursor-pointer">
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-primary">Escludi dal patrimonio</span>
              <span className="block text-[11px] text-secondary/70 mt-0.5 leading-relaxed">
                Il conto resta disponibile per movimenti e analisi, ma il saldo non entra nei totali.
              </span>
            </span>
            <input
              type="checkbox"
              checked={excludeFromNetWorth}
              onChange={e => setExcludeFromNetWorth(e.target.checked)}
              className="w-5 h-5 flex-shrink-0 accent-gold"
            />
          </label>
        )}

        {showBalance && (
          <div className="mb-6">
            <p className="text-xs font-medium text-secondary mb-2 px-1">
              {isInvestmentCategory ? 'Capitale già investito' : 'Saldo iniziale'}
            </p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
              <input
                type="number"
                inputMode="decimal"
                value={initialBalance}
                onChange={e => setInitialBalance(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                placeholder="0"
                className="w-full bg-elevated rounded-2xl pl-8 pr-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40"
              />
            </div>
            <p className="text-[11px] text-secondary/70 px-1 mt-1.5">
              {isInvestmentCategory
                ? 'Quanto avevi già investito in questa categoria prima di usare Sunny'
                : 'Saldo del conto quando hai iniziato a usare Sunny'}
            </p>
          </div>
        )}

        {isInvestmentCategory && (
          <div className="mb-6">
            <p className="text-xs font-medium text-secondary mb-2 px-1">Data di sottoscrizione</p>
            <input
              type="date" value={subscriptionDate} max={todayISO}
              onChange={e => setSubscriptionDate(e.target.value)}
              className="block w-full min-w-0 box-border appearance-none bg-elevated rounded-2xl px-4 py-3 text-primary text-sm outline-none focus:ring-1 focus:ring-gold/40"
            />
            {subscriptionDate > todayISO && (
              <p className="text-[11px] px-1 mt-1.5" style={{ color: '#E08B8B' }}>
                La data di sottoscrizione non può essere nel futuro.
              </p>
            )}
            <p className="text-[11px] text-secondary/70 px-1 mt-1.5">
              Da qui partono durata e rendimento annualizzato, e vince su tutto: se il fondo è
              aperto da anni ma i movimenti in Sunny iniziano ieri, conta questa. Senza, si parte
              dalla prima operazione registrata.
            </p>
          </div>
        )}

        {showFunds && (
          <div className="mb-6">
            <p className="text-xs font-medium text-secondary mb-2 px-1">Tipo di fondo</p>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setFundType('')}
                className={`py-2.5 rounded-xl text-[12px] font-semibold transition-all ${fundType === '' ? 'bg-gold text-bg' : 'bg-elevated text-secondary'}`}>
                Nessuno
              </button>
              {FUND_TYPE_ORDER.map(ft => (
                <button key={ft} onClick={() => setFundType(ft)}
                  className={`py-2.5 rounded-xl text-[12px] font-semibold transition-all ${fundType === ft ? 'shadow-sm' : 'bg-elevated text-secondary'}`}
                  style={fundType === ft ? { backgroundColor: FUND_TYPE_META[ft].color, color: '#0D0D0D' } : undefined}>
                  {FUND_TYPE_META[ft].icon} {FUND_TYPE_META[ft].label}
                </button>
              ))}
            </div>

            {fundType === 'pension' && (
              <div className="mt-3">
                <p className="text-xs font-medium text-secondary mb-2 px-1">Di cui TFR</p>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
                  <input
                    type="number" inputMode="decimal" value={tfrAmount}
                    onChange={e => setTfrAmount(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                    placeholder="0"
                    className="w-full bg-elevated rounded-2xl pl-8 pr-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40"
                  />
                </div>
                <p className="text-[11px] text-secondary/70 px-1 mt-1.5">
                  Quanta parte del capitale in questo fondo proviene dal TFR.
                </p>
              </div>
            )}
          </div>
        )}

        {showFinancingField && (
          <div className="mb-6">
            <p className="text-xs font-medium text-secondary mb-2 px-1">Finanziamento</p>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary text-sm">€</span>
              <input
                type="number"
                inputMode="decimal"
                value={financedAmount}
                onChange={e => setFinancedAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                placeholder="0"
                className="w-full bg-elevated rounded-2xl pl-8 pr-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40"
              />
            </div>
            <p className="text-[11px] text-secondary/70 px-1 mt-1.5">
              Quanto ti è stato prestato per questa spesa. Con un importo impostato, aprendo la
              categoria vedrai quanto hai già versato (dalle spese registrate qui) e quanto manca
              per restituire tutto. Lascia vuoto se non è un finanziamento.
            </p>
          </div>
        )}

        {error&&<p role="alert" className="text-sm text-red mb-3">{error}</p>}
        {isMacro&&canDelete&&<p className="text-xs text-secondary mb-3">Se elimini la macro, le categorie restano e appariranno senza macrocategoria.</p>}
        <div className="flex gap-2">
          {canDelete && onDelete && (
            confirmingDelete
              ? <button onClick={async () => {setSaving(true);setError('');try{await onDelete(draft.id);}catch{setError('Eliminazione non riuscita. Riprova.');}finally{setSaving(false);}}}
                  className="px-4 py-3.5 rounded-2xl font-semibold text-[#E08B8B] bg-[#E08B8B]/20 text-sm">
                  Conferma
                </button>
              : <button onClick={() => setConfirmingDelete(true)}
                  className="px-4 py-3.5 rounded-2xl font-medium text-[#E08B8B] bg-[#E08B8B]/10 text-sm">
                  Elimina
                </button>
          )}
          <button onClick={() => { requestClose(); setConfirmingDelete(false); }}
            className="px-4 py-3.5 rounded-2xl font-medium text-secondary bg-elevated text-sm">
            Annulla
          </button>
          <button onClick={save} className="flex-1 py-3.5 rounded-2xl font-semibold bg-gold text-bg">Salva</button>
        </div>
        </fieldset>
        {ui3&&dismiss.confirm&&<DiscardConfirmation onContinue={dismiss.continueEditing} onDiscard={onClose}/>}
      </DialogSurface>
    </div>
  );
}
