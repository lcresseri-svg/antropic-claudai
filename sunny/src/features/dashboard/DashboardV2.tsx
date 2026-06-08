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
import { InsightDetailSheet } from '../insights/InsightDetailSheet';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights, Insight } from '../insights/insightsEngine';

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
  const [detailInsight, setDetailInsight] = useState<Insight | null>(null);

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

      {/* ── A: Questo mese ── */}
      <section className="pt-4 md:pt-0">
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

      {/* ── Patrimonio netto ── */}
      <div className="mt-7 pb-6 border-b border-white/[0.04]">
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

      {/* ── B: Insights vertical list ── */}
      {insights.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-3 px-0.5">
            <p className="label-caps text-secondary">Insight</p>
            <button onClick={p.onSeeInsights} className="text-xs font-medium text-gold">
              Vedi tutti
            </button>
          </div>
          <div className="space-y-2">
            {insights.slice(0, 8).map((ins, i) => (
              <button
                key={i}
                onClick={() => setDetailInsight(ins)}
                className={`w-full text-left glass-card rounded-2xl px-4 py-3.5 flex items-start gap-3.5 active:scale-[0.99] transition-transform ${ins.urgent ? 'ring-1 ring-[#E08B8B]/30' : ''}`}
              >
                <span
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                  style={{ backgroundColor: ins.accent + '20' }}
                >
                  {ins.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-primary leading-snug">{ins.title}</p>
                  <p className="text-[11px] mt-0.5 leading-snug" style={{ color: ins.accent + 'cc' }}>{ins.detail}</p>
                </div>
                {ins.explain && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-secondary/50 mt-0.5 flex-shrink-0">
                    <circle cx="12" cy="12" r="9"/>
                    <path d="M12 11v5" strokeLinecap="round"/>
                    <circle cx="12" cy="7.6" r="0.6" fill="currentColor" stroke="none"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      <InsightDetailSheet insight={detailInsight} onClose={() => setDetailInsight(null)} />

      {/* AI digest */}
      <div className="mt-4">
        <AIDigestCard input={digestInput} />
      </div>

      {/* ── D: Andamento 6 mesi ── */}
      <div className="mt-4">
        <TrendChart data={p.trend} />
      </div>

      {/* ── E: Investimenti per categoria ── */}
      {enableInvestments && (
        <div className="mt-4">
          <InvestmentSummaryCard
            investmentByCategory={p.investmentByCategory}
            total={p.investmentTotal}
            onClick={p.onSeeInvestments}
          />
        </div>
      )}

      {/* ── F: Spese per categoria (navigabile → /category-spending) ── */}
      <div className="mt-4">
        <CategoryCard
          categoryTotals={currentMonthCategoryTotals}
          onClick={() => navigate('/category-spending')}
        />
      </div>

      {/* ── G: Saldo per conto ── */}
      <div className="mt-4">
        <AccountsCard
          accountBalances={p.accountBalances}
          expenseByAccount={currentMonthExpenseByAccount}
          mode={accMode}
          onToggle={() => setAccMode(m => m === 'balance' ? 'spending' : 'balance')}
        />
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
