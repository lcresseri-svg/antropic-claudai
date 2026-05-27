import { Transaction, Category } from '../types';
import { formatCurrency, currentMonthLabel } from '../utils';
import { CategoryChart } from './CategoryChart';
import { Insights } from './Insights';
import { TransactionItem } from './TransactionItem';

interface Props {
  totalBalance: number;
  investmentTotal: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  categoryTotals: Partial<Record<Category, number>>;
  recentTransactions: Transaction[];
  onAdd: () => void;
  onDeleteTransaction: (id: string) => void;
}

export function Dashboard({
  totalBalance, investmentTotal,
  monthlyIncome, monthlyExpenses, monthlyInvestments,
  categoryTotals, recentTransactions, onAdd, onDeleteTransaction,
}: Props) {
  const netWorth = totalBalance + investmentTotal;
  const savingsRate = monthlyIncome > 0
    ? Math.round(((monthlyIncome - monthlyExpenses - monthlyInvestments) / monthlyIncome) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* ── Net worth card ── */}
      <div
        className="rounded-2xl p-6 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1C1C1E 0%, #2C2C2E 100%)' }}
      >
        <div className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-10 pointer-events-none"
          style={{ background: '#E6B95C', transform: 'translate(30%,-30%)' }} />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full opacity-5 pointer-events-none"
          style={{ background: '#8A9270', transform: 'translate(-20%,40%)' }} />

        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-1">Patrimonio netto</p>
        <p className="text-4xl font-bold text-white tracking-tight mb-4">{formatCurrency(netWorth)}</p>

        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Stat label="Liquidità" value={formatCurrency(totalBalance)} color="#8A9270" />
          <div className="w-px bg-white/10 self-stretch" />
          <Stat label="Investito" value={formatCurrency(investmentTotal)} color="#E6B95C" />
          <div className="w-px bg-white/10 self-stretch" />
          <Stat label={`Entrate ${currentMonthLabel()}`} value={`+${formatCurrency(monthlyIncome)}`} color="#7B9E87" />
          <div className="w-px bg-white/10 self-stretch" />
          <Stat label="Uscite" value={`-${formatCurrency(monthlyExpenses)}`} color="rgba(255,255,255,0.7)" />
          {monthlyIncome > 0 && (
            <>
              <div className="w-px bg-white/10 self-stretch" />
              <Stat label="Risparmio" value={`${savingsRate}%`} color={savingsRate >= 0 ? '#E6B95C' : '#F28B82'} />
            </>
          )}
        </div>
      </div>

      {/* ── Monthly investment summary ── */}
      {monthlyInvestments > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-4 border-l-4" style={{ borderColor: '#E6B95C' }}>
          <span className="text-2xl">📈</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-dark">Investito questo mese</p>
            <p className="text-xs text-dark/50">{currentMonthLabel()}</p>
          </div>
          <p className="text-lg font-bold" style={{ color: '#E6B95C' }}>
            {formatCurrency(monthlyInvestments)}
          </p>
        </div>
      )}

      {/* ── Category chart ── */}
      {Object.keys(categoryTotals).length > 0 && (
        <CategoryChart categoryTotals={categoryTotals} />
      )}

      {/* ── Insights ── */}
      <Insights
        monthlyIncome={monthlyIncome}
        monthlyExpenses={monthlyExpenses}
        monthlyInvestments={monthlyInvestments}
        categoryTotals={categoryTotals}
      />

      {/* ── Recent transactions ── */}
      <div className="bg-white rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-semibold text-dark/40 uppercase tracking-widest">
            Ultime transazioni
          </h3>
          <button onClick={onAdd} className="text-xs font-medium text-sage hover:text-sage/70 transition-colors">
            + Aggiungi
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-sm text-dark/40 py-4 text-center">Inizia aggiungendo una transazione!</p>
        ) : (
          <div className="divide-y divide-black/5">
            {recentTransactions.slice(0, 8).map(tx => (
              <TransactionItem key={tx.id} tx={tx} onDelete={onDeleteTransaction} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <p className="text-xs text-white/40 mb-0.5">{label}</p>
      <p className="text-sm font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}
