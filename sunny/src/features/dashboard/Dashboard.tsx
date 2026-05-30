import { useState } from 'react';
import { User } from 'firebase/auth';
import { Transaction } from '../../types';
import { formatCurrency, greeting } from '../../utils';
import { CategoryCard } from './CategoryCard';
import { AccountsCard } from './AccountsCard';
import { TrendChart } from './TrendChart';
import { Insights } from './Insights';
import { TransactionRow } from '../transactions/TransactionRow';

interface Props {
  user: User;
  netWorth: number;
  liquidity: number;
  investmentTotal: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  categoryTotals: Record<string, number>;
  accountBalances: Record<string, number>;
  expenseByAccount: Record<string, number>;
  trend: { key: string; income: number; expense: number }[];
  transactions: Transaction[];
  recentTransactions: Transaction[];
  onSeeAll: () => void;
  onEditTransaction: (tx: Transaction) => void;
}

export function Dashboard(p: Props) {
  const [accMode, setAccMode] = useState<'balance' | 'spending'>('balance');
  const saved       = p.monthlyIncome - p.monthlyExpenses - p.monthlyInvestments;
  const monthlyDelta = p.monthlyIncome - p.monthlyExpenses;

  return (
    <div className="space-y-3 pb-32 animate-fade-in">

      {/* Greeting */}
      <div className="flex items-center justify-between pt-3">
        <div>
          <p className="text-[13px] text-secondary">{greeting()}</p>
          <p className="text-lg font-semibold text-primary tracking-[-0.02em] leading-tight mt-0.5">
            {p.user.displayName?.split(' ')[0] ?? 'utente'}
          </p>
        </div>
        {p.user.photoURL && (
          <img src={p.user.photoURL} alt="" className="w-9 h-9 rounded-full opacity-90" />
        )}
      </div>

      {/* Hero — net worth floats on dark surface */}
      <div className="pt-6 pb-7 animate-scale-in">
        <p className="label-caps text-secondary mb-3">Patrimonio netto</p>
        <p className="text-[52px] leading-none font-bold text-primary balance-num">
          {formatCurrency(p.netWorth)}
        </p>
        {monthlyDelta !== 0 && (
          <p className="text-[13px] mt-2.5 balance-num"
            style={{ color: monthlyDelta >= 0 ? '#7A9E6E' : '#C0605A' }}>
            {monthlyDelta >= 0 ? '+' : ''}{formatCurrency(monthlyDelta)}&ensp;questo mese
          </p>
        )}
        <div className="flex gap-8 mt-7 pt-6 border-t border-white/[0.06]">
          <div>
            <p className="label-caps text-secondary mb-2">Liquidità</p>
            <p className="text-sm font-semibold text-primary balance-num">{formatCurrency(p.liquidity)}</p>
          </div>
          <div>
            <p className="label-caps text-secondary mb-2">Investito</p>
            <p className="text-sm font-semibold balance-num" style={{ color: '#E6B95C' }}>
              {formatCurrency(p.investmentTotal)}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label="Entrate"  value={formatCurrency(p.monthlyIncome)}   color="#7A9E6E" />
        <Stat label="Uscite"   value={formatCurrency(p.monthlyExpenses)}  color="#666666" />
        <Stat label="Risparmio" value={formatCurrency(saved)} color={saved >= 0 ? '#E6B95C' : '#C0605A'} />
      </div>

      <TrendChart data={p.trend} />
      <CategoryCard categoryTotals={p.categoryTotals} />
      <AccountsCard
        accountBalances={p.accountBalances}
        expenseByAccount={p.expenseByAccount}
        mode={accMode}
        onToggle={() => setAccMode(m => m === 'balance' ? 'spending' : 'balance')}
      />
      <Insights
        transactions={p.transactions}
        monthlyIncome={p.monthlyIncome}
        monthlyExpenses={p.monthlyExpenses}
        monthlyInvestments={p.monthlyInvestments}
      />

      {/* Recent transactions */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[13px] font-semibold text-primary">Recenti</h3>
          <button onClick={p.onSeeAll}
            className="label-caps text-gold" style={{ letterSpacing: '0.06em' }}>
            Vedi tutte
          </button>
        </div>
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="divide-y divide-white/[0.06] px-4">
            {p.recentTransactions.slice(0, 6).map(tx => (
              <TransactionRow key={tx.id} tx={tx} onClick={p.onEditTransaction} />
            ))}
            {p.recentTransactions.length === 0 && (
              <p className="text-[13px] text-secondary py-8 text-center">Nessuna transazione</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="glass-card rounded-2xl px-4 py-4">
      <p className="label-caps text-secondary mb-2">{label}</p>
      <p className="text-[14px] font-semibold balance-num truncate" style={{ color }}>{value}</p>
    </div>
  );
}
