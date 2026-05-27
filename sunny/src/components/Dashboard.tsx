import { useState } from 'react';
import { User } from 'firebase/auth';
import { Transaction } from '../types';
import { formatCurrency, currentMonthLabel, greeting, capitalize } from '../utils';
import { CategoryCard } from './CategoryCard';
import { AccountsCard } from './AccountsCard';
import { TrendChart } from './TrendChart';
import { Insights } from './Insights';
import { TransactionRow } from './TransactionRow';

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
  const saved = p.monthlyIncome - p.monthlyExpenses - p.monthlyInvestments;

  return (
    <div className="space-y-4 pb-28">
      {/* Greeting */}
      <div className="flex items-center justify-between pt-1 animate-fade-in">
        <div>
          <p className="text-sm text-secondary">{greeting()},</p>
          <p className="text-lg font-semibold text-primary">{p.user.displayName?.split(' ')[0] ?? 'utente'}</p>
        </div>
        {p.user.photoURL && <img src={p.user.photoURL} alt="" className="w-9 h-9 rounded-full" />}
      </div>

      {/* Hero net worth */}
      <div className="bg-card rounded-3xl p-6 animate-scale-in">
        <p className="text-xs text-secondary uppercase tracking-wider mb-2">Patrimonio netto</p>
        <p className="text-[44px] leading-none font-bold text-primary balance-num">{formatCurrency(p.netWorth)}</p>
        <div className="flex gap-6 mt-5">
          <div>
            <p className="text-xs text-secondary mb-1">Liquidità</p>
            <p className="text-sm font-semibold text-primary balance-num">{formatCurrency(p.liquidity)}</p>
          </div>
          <div className="w-px bg-divider" />
          <div>
            <p className="text-xs text-secondary mb-1">Investito</p>
            <p className="text-sm font-semibold balance-num" style={{ color: '#E6B95C' }}>{formatCurrency(p.investmentTotal)}</p>
          </div>
        </div>
      </div>

      {/* Month stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Entrate" value={formatCurrency(p.monthlyIncome)} color="#8A9270" />
        <Stat label="Uscite" value={formatCurrency(p.monthlyExpenses)} color="#F5F5F5" />
        <Stat label="Risparmio" value={formatCurrency(saved)} color={saved >= 0 ? '#E6B95C' : '#E08B8B'} />
      </div>
      <p className="text-[11px] text-secondary text-center -mt-1">{capitalize(currentMonthLabel())}</p>

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

      {/* Recent */}
      <div className="bg-card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-primary">Ultime transazioni</h3>
          <button onClick={p.onSeeAll} className="text-xs font-medium text-gold">Vedi tutte</button>
        </div>
        <div className="divide-y divide-divider">
          {p.recentTransactions.slice(0, 6).map(tx => (
            <TransactionRow key={tx.id} tx={tx} onClick={p.onEditTransaction} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-card rounded-2xl p-4">
      <p className="text-[11px] text-secondary mb-1.5">{label}</p>
      <p className="text-[15px] font-semibold balance-num truncate" style={{ color }}>{value}</p>
    </div>
  );
}
