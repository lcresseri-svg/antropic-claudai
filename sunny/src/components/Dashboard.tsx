import { Transaction, Category } from '../types';
import { formatCurrency, currentMonthLabel } from '../utils';
import { CategoryChart } from './CategoryChart';
import { Insights } from './Insights';
import { TransactionItem } from './TransactionItem';

interface Props {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  categoryTotals: Partial<Record<Category, number>>;
  recentTransactions: Transaction[];
  onAdd: () => void;
  onDeleteTransaction: (id: string) => void;
}

export function Dashboard({
  totalBalance,
  monthlyIncome,
  monthlyExpenses,
  categoryTotals,
  recentTransactions,
  onAdd,
  onDeleteTransaction,
}: Props) {
  const savingsRate =
    monthlyIncome > 0
      ? Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Balance card */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1C1C1E 0%, #2C2C2E 100%)' }}
      >
        <div
          className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10"
          style={{ background: '#E6B95C', transform: 'translate(30%, -30%)' }}
        />
        <div
          className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-5"
          style={{ background: '#8A9270', transform: 'translate(-20%, 40%)' }}
        />

        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1">
          Saldo totale
        </p>
        <p className="text-4xl font-bold text-white tracking-tight mb-4">
          {formatCurrency(totalBalance)}
        </p>

        <div className="flex gap-4">
          <div>
            <p className="text-xs text-white/40 mb-0.5">Entrate {currentMonthLabel()}</p>
            <p className="text-sm font-semibold" style={{ color: '#8A9270' }}>
              +{formatCurrency(monthlyIncome)}
            </p>
          </div>
          <div className="w-px bg-white/10" />
          <div>
            <p className="text-xs text-white/40 mb-0.5">Uscite {currentMonthLabel()}</p>
            <p className="text-sm font-semibold text-white/80">
              -{formatCurrency(monthlyExpenses)}
            </p>
          </div>
          {monthlyIncome > 0 && (
            <>
              <div className="w-px bg-white/10" />
              <div>
                <p className="text-xs text-white/40 mb-0.5">Risparmio</p>
                <p
                  className="text-sm font-semibold"
                  style={{ color: savingsRate >= 0 ? '#E6B95C' : '#D4956A' }}
                >
                  {savingsRate}%
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Category chart */}
      {Object.keys(categoryTotals).length > 0 && (
        <CategoryChart categoryTotals={categoryTotals} />
      )}

      {/* Insights */}
      <Insights
        monthlyIncome={monthlyIncome}
        monthlyExpenses={monthlyExpenses}
        categoryTotals={categoryTotals}
      />

      {/* Recent transactions */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-dark/40 uppercase tracking-widest">
            Ultime transazioni
          </h3>
          <button
            onClick={onAdd}
            className="text-xs font-medium text-sage hover:text-sage/70 transition-colors"
          >
            + Aggiungi
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-sm text-dark/40 py-4 text-center">
            Nessuna transazione. Inizia aggiungendone una!
          </p>
        ) : (
          <div className="divide-y divide-black/5">
            {recentTransactions.slice(0, 8).map(tx => (
              <TransactionItem
                key={tx.id}
                tx={tx}
                onDelete={onDeleteTransaction}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
