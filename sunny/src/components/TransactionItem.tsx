import { Transaction, CATEGORY_META } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface Props {
  tx: Transaction;
  onDelete?: (id: string) => void;
}

export function TransactionItem({ tx, onDelete }: Props) {
  const meta = CATEGORY_META[tx.category];
  const isIncome = tx.type === 'income';

  return (
    <div className="flex items-center gap-3 py-3 group">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: meta.color + '22' }}
      >
        {meta.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-dark truncate">{tx.description}</p>
        <p className="text-xs text-dark/40 mt-0.5">
          {formatDate(tx.date)} · {meta.label}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-semibold tabular-nums ${
            isIncome ? 'text-sage' : 'text-dark'
          }`}
        >
          {isIncome ? '+' : '-'}{formatCurrency(tx.amount)}
        </span>
        {onDelete && (
          <button
            onClick={() => onDelete(tx.id)}
            className="w-6 h-6 rounded-lg text-dark/20 hover:text-red-400 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs"
            aria-label="Elimina"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
