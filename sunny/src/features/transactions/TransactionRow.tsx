import { Transaction, TYPE_META, ownShare } from '../../types';
import { formatCurrency, formatDateFull } from '../../utils';
import { useSettings } from '../../shared/providers/settings';

interface Props {
  tx: Transaction;
  selectable?: boolean;
  selected?: boolean;
  /** Show as a forecast ("Programmato"): recurring projection or planned one-off. */
  upcoming?: boolean;
  onToggle?: (id: string) => void;
  onClick?: (tx: Transaction) => void;
}

export function TransactionRow({ tx, selectable, selected, upcoming, onToggle, onClick }: Props) {
  const { getCat, getAcc } = useSettings();
  const cat = getCat(tx.category);
  const acc = getAcc(tx.account);

  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const isInvestment = tx.type === 'investment';
  const isProjected = !!upcoming || !!tx.projected;
  // A RECORDED occurrence of a series (incl. old ones — they carry seriesId even
  // though the recurring rule lives on the template). Projected rows keep 🗓️.
  const isSeries = !isProjected && (!!tx.recurring || !!tx.seriesId);

  const prefix = isIncome ? '+' : isTransfer ? '' : '−';
  const amountClass = isIncome ? 'text-green' : isInvestment ? 'text-gold' : isTransfer ? 'text-[#88B0C0]' : 'text-primary';

  const handleClick = () => {
    if (selectable) onToggle?.(tx.id);
    else onClick?.(tx);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-3.5 py-3 text-left transition-colors active:bg-card-hover rounded-xl -mx-2 px-2 ${isProjected ? 'opacity-60' : ''}`}
    >
      {selectable && (
        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
          selected ? 'bg-gold border-gold' : 'border-divider'
        }`}>
          {selected && <span className="text-bg text-xs font-bold">✓</span>}
        </span>
      )}

      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: cat.color + '18' }}>
        {cat.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-[15px] font-medium text-primary truncate">{tx.description}</p>
          {/* Visible chip on every recorded occurrence of a series (incl. old ones —
              they carry seriesId even though the recurring rule lives on the template). */}
          {isSeries && (
            <span className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-full bg-gold/15 text-gold text-[10px] font-semibold px-1.5 py-0.5 leading-none">
              🔁 Ricorrente
            </span>
          )}
        </div>
        <p className="text-xs text-secondary mt-0.5 truncate">
          {formatDateFull(tx.date)} · {acc.label}
          {isTransfer && tx.toAccount && ` → ${getAcc(tx.toAccount).label}`}
          {isProjected ? ' · 🗓️' : ''}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p className={`text-[15px] font-semibold balance-num ${amountClass}`}>
          {prefix}{formatCurrency(tx.amount)}
        </p>
        {isProjected ? (
          <p className="text-[11px] text-secondary mt-0.5">Programmato</p>
        ) : tx.shared ? (
          <p className="text-[11px] text-secondary mt-0.5">
            tua: {formatCurrency(ownShare(tx))}
          </p>
        ) : !isTransfer ? (
          <p className="text-[11px] text-secondary mt-0.5">{TYPE_META[tx.type].label}</p>
        ) : null}
      </div>
    </button>
  );
}
