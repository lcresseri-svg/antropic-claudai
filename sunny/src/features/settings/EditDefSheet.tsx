import { useState, useEffect } from 'react';
import { TransactionType, TYPE_META, TYPE_ORDER } from '../../types';
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
}

interface Props {
  open: boolean;
  draft: DefDraft | null;
  withKind: boolean;
  canDelete: boolean;
  onSave: (d: DefDraft) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function EditDefSheet({ open, draft, withKind, canDelete, onSave, onDelete, onClose }: Props) {
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState('•');
  const [color, setColor] = useState(COLOR_CHOICES[0]);
  const [kind, setKind] = useState<TransactionType>('expense');
  const [initialBalance, setInitialBalance] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!open || !draft) return;
    setLabel(draft.label); setIcon(draft.icon); setColor(draft.color);
    setKind(draft.kind ?? 'expense');
    setInitialBalance(draft.initialBalance !== undefined ? String(draft.initialBalance) : '');
    setConfirmingDelete(false);
  }, [open, draft]);

  useEscapeKey(onClose, open);

  if (!open || !draft) return null;

  // Initial balance is editable for accounts (non-investment) and for
  // investment categories (capital already invested before Sunny).
  const isInvestmentCategory = withKind && kind === 'investment';
  const showBalance = (!withKind && !draft.isInvestment) || isInvestmentCategory;

  const save = () => {
    if (!label.trim()) return;
    const parsedBalance = initialBalance !== '' ? parseFloat(initialBalance) : undefined;
    const validBalance = parsedBalance !== undefined && !isNaN(parsedBalance) ? parsedBalance : undefined;
    onSave({
      id: draft.id, label: label.trim(), icon, color,
      kind: withKind ? kind : undefined,
      initialBalance: showBalance ? validBalance : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in-fast" />
      <div className="relative w-full max-w-md glass-elevated rounded-3xl p-6 shadow-float animate-sheet-up max-h-[90vh] overflow-y-auto scrollbar-hide">
        <div className="flex items-center gap-3 mb-5">
          <span className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{ backgroundColor: color + '22' }}>{icon}</span>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nome" maxLength={24} autoFocus
            className="flex-1 bg-elevated rounded-2xl px-4 py-3 text-primary placeholder:text-secondary/50 outline-none focus:ring-1 focus:ring-gold/40" />
        </div>

        {withKind && (
          <div className="mb-5">
            <p className="text-xs font-medium text-secondary mb-2 px-1">Tipo</p>
            <div className="grid grid-cols-4 gap-1.5 bg-elevated rounded-2xl p-1.5">
              {TYPE_ORDER.map(t => (
                <button key={t} onClick={() => setKind(t)}
                  className="py-2 rounded-xl text-[11px] font-semibold transition-all"
                  style={kind === t ? { backgroundColor: TYPE_META[t].color, color: '#0D0D0D' } : { color: '#8B8B8B' }}>
                  {TYPE_META[t].label}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs font-medium text-secondary mb-2 px-1">Icona</p>
        <div className="grid grid-cols-8 gap-1.5 mb-5">
          {EMOJI_CHOICES.map(e => (
            <button key={e} onClick={() => setIcon(e)}
              className={`aspect-square rounded-xl flex items-center justify-center text-lg transition-colors ${
                icon === e ? 'bg-gold/20 ring-1 ring-gold' : 'bg-elevated'
              }`}>{e}</button>
          ))}
        </div>

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
