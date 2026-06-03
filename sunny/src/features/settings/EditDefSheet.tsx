import { useState, useEffect } from 'react';
import { TransactionType, TYPE_META, TYPE_ORDER, FundType, FUND_TYPE_META, FUND_TYPE_ORDER } from '../../types';
import { EMOJI_CHOICES, COLOR_CHOICES } from '../../defaults';
import { useEscapeKey } from '../../shared/hooks/useEscapeKey';

export interface DefDraft {
  id: string;
  label: string;
  icon: string;
  color: string;
  kind?: TransactionType;
  initialBalance?: number;
  isInvestment?: boolean;
  fundType?: FundType;
  tfrAmount?: number;
}

interface Props {
  open: boolean;
  draft: DefDraft | null;
  withKind: boolean;
  canDelete: boolean;
  showFundType?: boolean; // detailed-investments mode (per-user gated)
  onSave: (d: DefDraft) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function EditDefSheet({ open, draft, withKind, canDelete, showFundType, onSave, onDelete, onClose }: Props) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('•');
  const [color, setColor] = useState(COLOR_CHOICES[0]);
  const [kind, setKind] = useState<TransactionType>('expense');
  const [initialBalance, setInitialBalance] = useState('');
  const [fundType, setFundType] = useState<FundType | ''>('');
  const [tfrAmount, setTfrAmount] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [emojiExpanded, setEmojiExpanded] = useState(false);

  useEffect(() => {
    if (!open || !draft) return;
    setLabel(draft.label); setIcon(draft.icon); setColor(draft.color);
    setKind(draft.kind ?? 'expense');
    setInitialBalance(draft.initialBalance !== undefined ? String(draft.initialBalance) : '');
    setFundType(draft.fundType ?? '');
    setTfrAmount(draft.tfrAmount !== undefined ? String(draft.tfrAmount) : '');
    setConfirmingDelete(false);
    setEmojiExpanded(false);
  }, [open, draft]);

  useEscapeKey(onClose, open);

  if (!open || !draft) return null;

  // A category always carries a `kind` in its draft; an account never does.
  // `withKind` only controls whether the type *selector* is shown (it's hidden
  // when adding inside a specific section), so it must NOT decide the kind —
  // doing so dropped the section's kind and made everything an expense.
  const isCategory = draft.kind !== undefined;
  const isInvestmentCategory = isCategory && kind === 'investment';
  const showBalance = (!isCategory && !draft.isInvestment) || isInvestmentCategory;
  const showFunds = isInvestmentCategory && !!showFundType;

  const noun = isCategory ? 'categoria' : 'conto';
  const sheetTitle = canDelete
    ? `Modifica ${noun}`
    : `${isCategory ? 'Nuova' : 'Nuovo'} ${noun}`;

  const save = () => {
    if (!label.trim()) return;
    const parsedBalance = initialBalance !== '' ? parseFloat(initialBalance) : undefined;
    const validBalance = parsedBalance !== undefined && !isNaN(parsedBalance) ? parsedBalance : undefined;
    const parsedTfr = tfrAmount !== '' ? parseFloat(tfrAmount) : undefined;
    const validTfr = parsedTfr !== undefined && !isNaN(parsedTfr) ? parsedTfr : undefined;
    onSave({
      id: draft.id, label: label.trim(), icon, color,
      kind: isCategory ? kind : undefined,
      initialBalance: showBalance ? validBalance : undefined,
      fundType: showFunds && fundType ? fundType : undefined,
      tfrAmount: showFunds && fundType === 'pension' ? validTfr : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl p-6 shadow-float animate-sheet-up max-h-[90vh] overflow-y-auto scrollbar-hide">
        <h2 className="text-base font-semibold text-primary mb-4">{sheetTitle}</h2>
        <p className="text-xs font-medium text-secondary mb-2 px-1">Nome e icona</p>
        <div className="flex items-center gap-3 mb-5">
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: color + '22' }}>{icon}</span>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nome" maxLength={24} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
            className="flex-1 bg-elevated rounded-2xl px-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
        </div>

        {withKind && (
          <div className="mb-5">
            <p className="text-xs font-medium text-secondary mb-2 px-1">Tipo</p>
            <div className="grid grid-cols-4 gap-1.5 bg-surface rounded-2xl p-1.5">
              {TYPE_ORDER.map(t => (
                <button key={t} onClick={() => setKind(t)}
                  className={`py-2 rounded-xl text-[11px] font-semibold transition-all ${kind === t ? 'shadow-sm' : 'text-secondary'}`}
                  style={kind === t ? { backgroundColor: TYPE_META[t].color, color: '#0D0D0D' } : undefined}>
                  {TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs font-medium text-secondary mb-2 px-1">Icona</p>
        <div className="grid grid-cols-8 gap-1.5">
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
            <button key={c} onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-2 ring-offset-bg ring-primary scale-110' : ''}`}
              style={{ backgroundColor: c }} />
          ))}
        </div>

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

        <div className="flex gap-2">
          {canDelete && onDelete && (
            confirmingDelete
              ? <button onClick={() => onDelete(draft.id)}
                  className="px-4 py-3.5 rounded-2xl font-semibold text-[#E08B8B] bg-[#E08B8B]/20 text-sm">
                  Conferma
                </button>
              : <button onClick={() => setConfirmingDelete(true)}
                  className="px-4 py-3.5 rounded-2xl font-medium text-[#E08B8B] bg-[#E08B8B]/10 text-sm">
                  Elimina
                </button>
          )}
          <button onClick={() => { onClose(); setConfirmingDelete(false); }}
            className="px-4 py-3.5 rounded-2xl font-medium text-secondary bg-elevated text-sm">
            Annulla
          </button>
          <button onClick={save} className="flex-1 py-3.5 rounded-2xl font-semibold bg-gold text-bg">Salva</button>
        </div>
      </div>
    </div>
  );
}
