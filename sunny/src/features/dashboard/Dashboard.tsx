import { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import { Transaction, ownShare } from '../../types';
import { formatCurrency, greeting } from '../../utils';
import { CategoryCard } from './CategoryCard';
import { AccountsCard } from './AccountsCard';
import { TrendChart } from './TrendChart';
import { Insights } from './Insights';
import { TransactionRow } from '../transactions/TransactionRow';

type Period = '1m' | '3m' | '6m' | '1y';

const PERIOD_OPTS: { value: Period; label: string; desc: string }[] = [
  { value: '1m', label: 'Mese',   desc: 'questo mese' },
  { value: '3m', label: '3 mesi', desc: 'ultimi 3 mesi' },
  { value: '6m', label: '6 mesi', desc: 'ultimi 6 mesi' },
  { value: '1y', label: 'Anno',   desc: 'ultimo anno' },
];

function periodCutoff(p: Period, now: Date): Date | null {
  if (p === '1m') return null; // handled separately
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  if (p === '3m') d.setMonth(d.getMonth() - 2);
  else if (p === '6m') d.setMonth(d.getMonth() - 5);
  else d.setMonth(d.getMonth() - 11);
  return d;
}

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
  const [period, setPeriod] = useState<Period>('1m');

  const now = useMemo(() => new Date(), []);
  const cm = now.getMonth(), cy = now.getFullYear();

  const periodTx = useMemo(() => {
    if (period === '1m') {
      return p.transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === cm && d.getFullYear() === cy;
      });
    }
    const cutoff = periodCutoff(period, now)!;
    return p.transactions.filter(t => new Date(t.date) >= cutoff);
  }, [p.transactions, period, now, cm, cy]);

  const periodIncome      = useMemo(() => periodTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0), [periodTx]);
  const periodExpenses    = useMemo(() => periodTx.filter(t => t.type === 'expense').reduce((s, t) => s + ownShare(t), 0), [periodTx]);
  const periodInvestments = useMemo(() => periodTx.filter(t => t.type === 'investment').reduce((s, t) => s + t.amount, 0), [periodTx]);

  const periodCategoryTotals = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of periodTx) {
      if (t.type !== 'expense') continue;
      r[t.category] = (r[t.category] ?? 0) + ownShare(t);
    }
    return r;
  }, [periodTx]);

  const periodExpenseByAccount = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of periodTx) {
      if (t.type !== 'expense') continue;
      r[t.account] = (r[t.account] ?? 0) + ownShare(t);
    }
    return r;
  }, [periodTx]);

  const periodOpt   = PERIOD_OPTS.find(o => o.value === period)!;
  const saved       = periodIncome - periodExpenses - periodInvestments;
  const periodDelta = periodIncome - periodExpenses;

  return (
    <div className="pb-32 animate-fade-in">

      {/* Top section — full width on all sizes */}
      <div className="space-y-3">
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

        {/* Hero */}
        <div className="pt-6 pb-7 animate-scale-in">
          <p className="label-caps text-secondary mb-3">Patrimonio netto</p>
          <p className="text-[52px] leading-none font-bold text-primary balance-num">
            {formatCurrency(p.netWorth)}
          </p>
          {periodDelta !== 0 && (
            <p className={`text-[13px] mt-2.5 balance-num ${periodDelta >= 0 ? 'text-green' : 'text-red'}`}>
              {periodDelta >= 0 ? '+' : ''}{formatCurrency(periodDelta)}&ensp;{periodOpt.desc}
            </p>
          )}
          <div className="flex gap-8 mt-7 pt-6 border-t border-white/[0.06]">
            <div>
              <p className="label-caps text-secondary mb-2">Liquidità</p>
              <p className="text-sm font-semibold text-primary balance-num">{formatCurrency(p.liquidity)}</p>
            </div>
            <div>
              <p className="label-caps text-secondary mb-2">Investito</p>
              <p className="text-sm font-semibold balance-num text-gold">
                {formatCurrency(p.investmentTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1.5">
          {PERIOD_OPTS.map(opt => (
            <button key={opt.value} onClick={() => setPeriod(opt.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                period === opt.value ? 'bg-gold/20 text-gold' : 'text-secondary hover:text-primary'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Period stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Entrate"   value={formatCurrency(periodIncome)}   colorClass="text-green" />
          <Stat label="Uscite"    value={formatCurrency(periodExpenses)}  colorClass="text-secondary" />
          <Stat label="Risparmio" value={formatCurrency(saved)} colorClass={saved >= 0 ? 'text-gold' : 'text-red'} />
        </div>
      </div>

      {/* Cards grid — 1 col mobile, 2 col desktop */}
      <div className="mt-3 md:grid md:grid-cols-2 md:gap-5 md:items-start space-y-3 md:space-y-0">

        {/* Left column */}
        <div className="space-y-3">
          <TrendChart data={p.trend} />

          {/* Recent transactions */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[13px] font-semibold text-primary">Recenti</h3>
              <button onClick={p.onSeeAll} className="label-caps text-gold" style={{ letterSpacing: '0.06em' }}>
                Vedi tutte
              </button>
            </div>
            <div className="glass-card rounded-2xl overflow-hidden">
              <div className="divide-y divide-white/[0.06] px-4">
                {p.recentTransactions.slice(0, 8).map(tx => (
                  <TransactionRow key={tx.id} tx={tx} onClick={p.onEditTransaction} />
                ))}
                {p.recentTransactions.length === 0 && (
                  <p className="text-[13px] text-secondary py-8 text-center">Nessuna transazione</p>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          <CategoryCard categoryTotals={periodCategoryTotals} />
          <AccountsCard
            accountBalances={p.accountBalances}
            expenseByAccount={periodExpenseByAccount}
            mode={accMode}
            onToggle={() => setAccMode(m => m === 'balance' ? 'spending' : 'balance')}
          />
          <Insights
            transactions={p.transactions}
            monthlyIncome={p.monthlyIncome}
            monthlyExpenses={p.monthlyExpenses}
            monthlyInvestments={p.monthlyInvestments}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="glass-card rounded-2xl px-4 py-4">
      <p className="label-caps text-secondary mb-2">{label}</p>
      <p className={`text-[14px] font-semibold balance-num truncate ${colorClass}`}>{value}</p>
    </div>
  );
}
