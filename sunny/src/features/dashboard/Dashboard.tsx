import { useState, useMemo } from 'react';
import { Transaction, ownShare } from '../../types';
import { formatCurrency, capitalize } from '../../utils';
import { CategoryCard } from './CategoryCard';
import { AccountsCard } from './AccountsCard';
import { TrendChart } from './TrendChart';
import { FlowBar } from './FlowBar';
import { InvestmentSummaryCard } from './InvestmentSummaryCard';
import { InsightTicker } from '../insights/InsightTicker';
import { AIDigestCard } from './AIDigestCard';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights } from '../insights/insightsEngine';

type Period = '1m' | '3m' | '6m' | '1y';

const PERIOD_OPTS: { value: Period; label: string; months: number }[] = [
  { value: '1m', label: 'Mese',   months: 1 },
  { value: '3m', label: '3 mesi', months: 3 },
  { value: '6m', label: '6 mesi', months: 6 },
  { value: '1y', label: 'Anno',   months: 12 },
];

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
  portfolio?: { controvalore: number; versato: number };
  onSeeInsights: () => void;
  onSeeInvestments: () => void;
  onSeeCategories?: () => void;
}

export function Dashboard(p: Props) {
  const { enableInvestments, getCat, insightDepth, categories } = useSettings();
  const [accMode, setAccMode] = useState<'balance' | 'spending'>('balance');
  const [period, setPeriod] = useState<Period>('1m');
  const [offset, setOffset] = useState(0); // months back from the most recent window (0 = current)

  const now = useMemo(() => new Date(), []);
  const months = PERIOD_OPTS.find(o => o.value === period)!.months;

  // Window [start, end] for the selected period + offset.
  const { start, end, label } = useMemo(() => {
    const cm = now.getMonth(), cy = now.getFullYear();
    const endMonth = new Date(cy, cm - offset, 1);
    const startMonth = new Date(cy, cm - offset - (months - 1), 1);
    const isCurrent = offset === 0;
    const end = isCurrent ? now : new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0, 23, 59, 59);

    const fmtM = (d: Date) => capitalize(d.toLocaleString('it-IT', { month: 'short' }).replace('.', ''));
    let label: string;
    if (months === 1) {
      label = capitalize(endMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' }));
    } else if (startMonth.getFullYear() === endMonth.getFullYear()) {
      label = `${fmtM(startMonth)}–${fmtM(endMonth)} ${endMonth.getFullYear()}`;
    } else {
      label = `${fmtM(startMonth)} ${startMonth.getFullYear()} – ${fmtM(endMonth)} ${endMonth.getFullYear()}`;
    }
    return { start: startMonth, end, label };
  }, [now, offset, months]);

  const periodTx = useMemo(() =>
    p.transactions.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    }), [p.transactions, start, end]);

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

  const saved = periodIncome - periodExpenses - periodInvestments;

  const dashboardInsights = useMemo(() =>
    buildInsights({
      transactions: p.transactions,
      monthlyIncome: p.monthlyIncome,
      monthlyExpenses: p.monthlyExpenses,
      monthlyInvestments: p.monthlyInvestments,
      getCat,
      depth: insightDepth,
      forecastV3Categories: categories.filter(c => c.kind === 'expense'),
      portfolio: p.portfolio,
    }),
  [p.transactions, p.monthlyIncome, p.monthlyExpenses, p.monthlyInvestments, getCat, insightDepth, categories, p.portfolio]);

  const digestInput = useMemo(() => ({
    income: p.monthlyIncome,
    expenses: p.monthlyExpenses,
    investments: p.monthlyInvestments,
    saved: p.monthlyIncome - p.monthlyExpenses - p.monthlyInvestments,
    topInsights: dashboardInsights.slice(0, 5).map(i => i.title),
  }), [p.monthlyIncome, p.monthlyExpenses, p.monthlyInvestments, dashboardInsights]);

  return (
    <div className="pb-32">

      {/* Desktop-only greeting (mobile shows it in the header) */}
      {p.greeting && (
        <p className="hidden md:block text-lg font-semibold text-primary tracking-[-0.02em] pt-2">{p.greeting}</p>
      )}

      {/* Hero — net worth */}
      <div className="space-y-3">
        <div className="pt-6 pb-7">
          <p className="label-caps text-secondary mb-3">Patrimonio netto</p>
          <p className="text-[52px] leading-none font-bold text-primary balance-num">
            {formatCurrency(p.netWorth)}
          </p>
          <div className="flex gap-8 mt-7 pt-6 border-t border-white/[0.06]">
            <div>
              <p className="label-caps text-secondary mb-2">Liquidità</p>
              <p className="text-sm font-semibold text-primary balance-num">{formatCurrency(p.liquidity)}</p>
            </div>
            {enableInvestments && (
              <button onClick={p.onSeeInvestments} className="text-left group">
                <p className="label-caps text-secondary mb-2 flex items-center gap-1">
                  Investito
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-secondary group-hover:text-gold transition-colors"><path d="m9 18 6-6-6-6"/></svg>
                </p>
                <p className="text-sm font-semibold balance-num text-gold">{formatCurrency(p.investmentTotal)}</p>
              </button>
            )}
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1.5">
          {PERIOD_OPTS.map(opt => (
            <button key={opt.value} onClick={() => { setPeriod(opt.value); setOffset(0); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === opt.value ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {/* Period navigator — scroll through past periods */}
        <div className="flex items-center justify-between bg-card rounded-xl px-1.5 py-1.5">
          <button onClick={() => setOffset(o => o + 1)} aria-label="Periodo precedente"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-primary">{label}</span>
            {offset > 0 && (
              <button onClick={() => setOffset(0)} className="text-[11px] font-medium text-gold">Oggi</button>
            )}
          </div>
          <button onClick={() => setOffset(o => Math.max(0, o - 1))} disabled={offset === 0} aria-label="Periodo successivo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>

        {/* Period stats */}
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Entrate"   value={formatCurrency(periodIncome)}    colorClass="text-green" />
          <Stat label="Uscite"    value={formatCurrency(periodExpenses)}  colorClass="text-secondary" />
          <Stat
            label="Risparmio"
            value={formatCurrency(saved)}
            colorClass={saved >= 0 ? 'text-gold' : 'text-red'}
            warn={saved < 0 && enableInvestments}
            hint={enableInvestments && periodInvestments > 0 ? `dopo ${formatCurrency(periodInvestments)} investiti` : undefined}
          />
        </div>
      </div>

      {/* Insight ticker */}
      <div className="mt-5">
        <InsightTicker
          transactions={p.transactions}
          monthlyIncome={p.monthlyIncome}
          monthlyExpenses={p.monthlyExpenses}
          monthlyInvestments={p.monthlyInvestments}
          prebuilt={dashboardInsights}
          onSeeAll={p.onSeeInsights}
        />
      </div>

      {/* AI digest */}
      <div className="mt-3">
        <AIDigestCard input={digestInput} />
      </div>

      {/* Cards grid — 1 col mobile, 2 col desktop */}
      <div className="mt-5 md:grid md:grid-cols-2 md:gap-5 md:items-start space-y-3 md:space-y-0">
        <div className="space-y-3">
          <FlowBar income={periodIncome} expense={periodExpenses} invest={periodInvestments} showInvest={enableInvestments} />
          <TrendChart data={p.trend} />
          {enableInvestments && <InvestmentSummaryCard investmentByCategory={p.investmentByCategory} total={p.investmentTotal} onClick={p.onSeeInvestments} />}
        </div>
        <div className="space-y-3">
          <CategoryCard categoryTotals={periodCategoryTotals} onClick={p.onSeeCategories} />
          <AccountsCard
            accountBalances={p.accountBalances}
            expenseByAccount={periodExpenseByAccount}
            mode={accMode}
            onToggle={() => setAccMode(m => m === 'balance' ? 'spending' : 'balance')}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, colorClass, hint, warn }: {
  label: string; value: string; colorClass: string; hint?: string; warn?: boolean;
}) {
  return (
    <div className="glass-card rounded-2xl px-4 py-4">
      <div className="flex items-center gap-1.5 mb-2">
        <p className="label-caps text-secondary">{label}</p>
        {warn && (
          <span title="Entrate − Uscite − Investimenti è negativo: gli investimenti superano quanto ti è rimasto"
            className="w-3.5 h-3.5 rounded-full bg-red/20 text-red text-[9px] font-bold flex items-center justify-center flex-shrink-0">!</span>
        )}
      </div>
      <p className={`text-[14px] font-semibold balance-num truncate ${colorClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-secondary mt-1 leading-snug">{hint}</p>}
    </div>
  );
}
