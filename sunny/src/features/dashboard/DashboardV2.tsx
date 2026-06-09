// TODO: remove the old Dashboard.tsx and promote this component to all users
// once the admin beta is validated.
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { formatCurrency } from '../../utils';
import { CategoryCard } from './CategoryCard';
import { AccountsCard } from './AccountsCard';
import { TrendChart } from './TrendChart';
import { InvestmentSummaryCard } from './InvestmentSummaryCard';
import { AIDigestCard } from './AIDigestCard';
import { InsightTicker } from '../insights/InsightTicker';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights } from '../insights/insightsEngine';

interface Props {
  greeting?: string;
  netWorth: number;
  liquidity: number;
  investmentTotal: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  investmentByCategory: Record<string, number>;
  accountBalances: Record<string, number>;
  trend: { key: string; income: number; expense: number; invest: number }[];
  transactions: Transaction[];
  // The following props are kept for backward compat with the App.tsx call site
  // but are not used in this layout.
  savingsTarget: number;
  onSeeInsights: () => void;
  onSeeInvestments: () => void;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onImportCSV: () => void;
}

export function DashboardV2(p: Props) {
  const navigate = useNavigate();
  const { enableInvestments, getCat, insightDepth, categories } = useSettings();
  const [accMode, setAccMode] = useState<'balance' | 'spending'>('balance');

  // Current-month derived values (period selector moved to CategorySpendingScreen)
  const { currentMonthCategoryTotals, currentMonthExpenseByAccount } = useMemo(() => {
    const now = new Date();
    const cm = now.getMonth(), cy = now.getFullYear();
    const categoryTotals: Record<string, number> = {};
    const expenseByAccount: Record<string, number> = {};
    for (const t of p.transactions) {
      if (t.type !== 'expense') continue;
      const d = new Date(t.date);
      if (d.getMonth() !== cm || d.getFullYear() !== cy) continue;
      categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + ownShare(t);
      expenseByAccount[t.account] = (expenseByAccount[t.account] ?? 0) + ownShare(t);
    }
    return { currentMonthCategoryTotals: categoryTotals, currentMonthExpenseByAccount: expenseByAccount };
  }, [p.transactions]);

  const savings = p.monthlyIncome - p.monthlyExpenses;

  const insights = useMemo(() =>
    buildInsights({
      transactions: p.transactions,
      monthlyIncome: p.monthlyIncome,
      monthlyExpenses: p.monthlyExpenses,
      monthlyInvestments: p.monthlyInvestments,
      getCat,
      depth: insightDepth,
      forecastV2Categories: categories.filter(c => c.kind === 'expense'),
    }),
  [p.transactions, p.monthlyIncome, p.monthlyExpenses, p.monthlyInvestments, getCat, insightDepth, categories]);

  const digestInput = useMemo(() => ({
    income: p.monthlyIncome,
    expenses: p.monthlyExpenses,
    investments: p.monthlyInvestments,
    saved: p.monthlyIncome - p.monthlyExpenses - p.monthlyInvestments,
    topInsights: insights.slice(0, 5).map(i => i.title),
  }), [p.monthlyIncome, p.monthlyExpenses, p.monthlyInvestments, insights]);

  return (
    <div className="pb-32">

      {/* Desktop-only greeting */}
      {p.greeting && (
        <p className="hidden md:block text-lg font-semibold text-primary tracking-[-0.02em] pt-2 mb-5">{p.greeting}</p>
      )}

      {/* ── 1. Patrimonio netto ── */}
      <div className="pt-4 md:pt-0 pb-6 border-b border-white/[0.04]">
        <p className="label-caps text-secondary mb-3">Patrimonio netto</p>
        <p className="text-[44px] leading-none font-bold text-primary balance-num">
          {formatCurrency(p.netWorth)}
        </p>
        <div className="flex gap-8 mt-6 pt-5 border-t border-white/[0.04]">
          <div>
            <p className="label-caps text-secondary mb-1.5">Liquidità</p>
            <p className="text-sm font-semibold text-primary balance-num">{formatCurrency(p.liquidity)}</p>
          </div>
          {enableInvestments && (
            <button onClick={p.onSeeInvestments} className="text-left group">
              <p className="label-caps text-secondary mb-1.5 flex items-center gap-1">
                Investito
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-secondary group-hover:text-gold transition-colors">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </p>
              <p className="text-sm font-semibold balance-num text-gold">{formatCurrency(p.investmentTotal)}</p>
            </button>
          )}
        </div>
      </div>

      {/* ── 2. Questo mese ── */}
      <section className="mt-6">
        <p className="label-caps text-secondary mb-3 px-0.5">Questo mese</p>
        <div className="grid grid-cols-3 gap-2">
          <MonthStatCard label="Entrate"  value={p.monthlyIncome}    colorClass="text-green" />
          <MonthStatCard label="Uscite"   value={p.monthlyExpenses}  colorClass="text-secondary" />
          <MonthStatCard
            label="Risparmio"
            value={savings}
            colorClass={savings >= 0 ? 'text-gold' : 'text-red'}
          />
        </div>
      </section>

      {/* ── 3. Consigli (carosello, poche card) ── */}
      <div className="mt-6">
        <InsightTicker
          transactions={p.transactions}
          monthlyIncome={p.monthlyIncome}
          monthlyExpenses={p.monthlyExpenses}
          monthlyInvestments={p.monthlyInvestments}
          prebuilt={insights}
          limit={3}
          onSeeAll={p.onSeeInsights}
        />
      </div>

      {/* AI digest — full width */}
      <div className="mt-4">
        <AIDigestCard input={digestInput} />
      </div>

      {/* Andamento 12 mesi — full width (benefits from horizontal space) */}
      <div className="mt-4">
        <TrendChart data={p.trend} />
      </div>

      {/* Analytical cards — 2-column grid on large screens to use the width */}
      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-start">
        {/* Investimenti per categoria */}
        {enableInvestments && (
          <InvestmentSummaryCard
            investmentByCategory={p.investmentByCategory}
            total={p.investmentTotal}
            onClick={p.onSeeInvestments}
          />
        )}

        {/* Spese per categoria (navigabile → /category-spending) */}
        <CategoryCard
          categoryTotals={currentMonthCategoryTotals}
          onClick={() => navigate('/category-spending')}
        />

        {/* Saldo per conto — full-width row */}
        <div className="lg:col-span-2">
          <AccountsCard
            accountBalances={p.accountBalances}
            expenseByAccount={currentMonthExpenseByAccount}
            mode={accMode}
            onToggle={() => setAccMode(m => m === 'balance' ? 'spending' : 'balance')}
          />
        </div>
      </div>

    </div>
  );
}

function MonthStatCard({ label, value, colorClass }: {
  label: string;
  value: number;
  colorClass: string;
}) {
  return (
    <div className="glass-card rounded-2xl px-3.5 py-4">
      <p className="label-caps text-secondary mb-2.5">{label}</p>
      <p className={`text-[15px] font-semibold balance-num truncate ${colorClass}`}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
