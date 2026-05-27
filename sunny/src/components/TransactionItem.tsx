import { Transaction, CATEGORY_META, ACCOUNT_META, PAYMENT_META, TYPE_META } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface Props {
  tx: Transaction;
  onDelete?: (id: string) => void;
}

export function TransactionItem({ tx, onDelete }: Props) {
  const cat = CATEGORY_META[tx.category];
  const typeColor = TYPE_META[tx.type].color;
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const isInvestment = tx.type === 'investment';

  const amountPrefix = isIncome ? '+' : isTransfer ? '⇄' : '-';
  const amountColor = isIncome ? '#8A9270' : isTransfer ? '#7B9E87' : isInvestment ? '#E6B95C' : '#1C1C1E';

  return (
    <div className="flex items-center gap-3 py-3 group">
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{ backgroundColor: cat.color + '22' }}
      >
        {cat.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-dark truncate">{tx.description}</p>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-xs text-dark/40">{formatDate(tx.date)}</span>
          <span className="text-dark/20">·</span>
          <span className="text-xs text-dark/40">{cat.label}</span>
          {tx.account && (
            <>
              <span className="text-dark/20">·</span>
              <span className="text-xs text-dark/40">
                {ACCOUNT_META[tx.account].icon} {ACCOUNT_META[tx.account].label}
              </span>
            </>
          )}
          {isTransfer && tx.toAccount && (
            <>
              <span className="text-xs text-dark/40">→</span>
              <span className="text-xs text-dark/40">
                {ACCOUNT_META[tx.toAccount].icon} {ACCOUNT_META[tx.toAccount].label}
              </span>
            </>
          )}
          {tx.paymentMethod && !isTransfer && (
            <>
              <span className="text-dark/20">·</span>
              <span className="text-xs text-dark/40">
                {PAYMENT_META[tx.paymentMethod].icon} {PAYMENT_META[tx.paymentMethod].label}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-right">
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: amountColor }}
          >
            {amountPrefix}{formatCurrency(tx.amount)}
          </span>
          {!isTransfer && (
            <div
              className="text-xs text-right mt-0.5 font-medium"
              style={{ color: typeColor + '99' }}
            >
              {TYPE_META[tx.type].label}
            </div>
          )}
        </div>
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
