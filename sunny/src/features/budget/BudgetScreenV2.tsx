import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { User } from 'firebase/auth';
import { Transaction, BudgetState, ownShare, investSign } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { useBudget } from '../../shared/hooks/useBudget';
import { monthlyToBudgetState, prevMonthKey } from './monthlyBudget';
import {
  suggestBudgets, seasonalHint,
  DEMO_CATEGORY_SPEND, DEMO_CATEGORY_BUDGETS,
} from './budgetUtils';
import { forecastSavingsV4, forecastByCategoryV4 } from '../forecast/v4/forecastCompatV4';
import { upcomingRecurringThisMonth, upcomingPlannedThisMonth, buildProjectedOccurrences, isPending } from '../../shared/recurrence';
import { history } from '../insights/insightsEngine';
import { SavingsGoalCard } from './SavingsGoalCard';
import { SuggestedBudgetCard } from './SuggestedBudgetCard';
import { CategoryBudgetList } from './CategoryBudgetList';
import { BudgetHero } from './BudgetHero';
import { WatchlistCategories, WatchRow } from './WatchlistCategories';
import { BudgetOverview } from './BudgetOverview';
import { BudgetEditSheet } from './BudgetEditSheet';
import { formatCurrency, capitalize } from '../../utils';
import { listRecapMonths } from '../recap/monthlyRecap';

type EditSection = 'savings' | 'income' | 'expenses' | 'investments';

interface Props {
  user: User;
  transactions: Transaction[];
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  categoryTotals: Record<string, number>;   // expense totals (current month)
}

const EMPTY_BUDGET: BudgetState = {
  savingsTarget: 0, categoryBudgets: {}, incomeBudgets: {}, investmentBudgets: {}, suggestionAccepted: false,
};

/** Freccia del navigatore mese: badge 26px, come nel resto del redesign. */
function MonthArrow({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      aria-label={dir === 'prev' ? 'Mese precedente' : 'Mese successivo'}
      className="w-[26px] h-[26px] rounded-lg glass-card flex items-center justify-center text-secondary disabled:opacity-30 hover:text-primary transition-colors">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        className={dir === 'prev' ? 'rotate-180' : ''}>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
  );
}

/** "giugno 2026" (capitalised) for a YYYY-MM key. */
function monthKeyLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  return capitalize(label);
}

export function BudgetScreenV2({
  user, transactions, monthlyInvestments,
}: Props) {
  const navigate = useNavigate();
  const { categories, visibleCategories, enableInvestments } = useSettings();
  const {
    budget, acceptSuggestion, currentMonth, monthlyStatus, budgetHistory,
    setSavingsTargetFor, setCategoryBudgetFor, setIncomeBudgetFor, setInvestmentBudgetFor,
    resetAllFor, confirmMonth, copyPrevInto,
  } = useBudget(user);

  // Monthly recaps archive (newest first) — computed from in-memory transactions.
  const recapMonths = useMemo(() => listRecapMonths(transactions), [transactions]);

  // Month navigated to (defaults to the current month). Drives every slice below.
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const isCurrentMonth = selectedMonth === currentMonth;
  const isPastMonth = selectedMonth < currentMonth;
  const isFutureMonth = !isCurrentMonth && !isPastMonth;

  const [editOpen, setEditOpen] = useState(false);
  const [editSection, setEditSection] = useState<EditSection>('expenses');
  const [focusCategory, setFocusCategory] = useState<string | null>(null);

  const expenseCats    = useMemo(() => visibleCategories.filter(c => c.kind === 'expense'),    [visibleCategories]);
  const incomeCats     = useMemo(() => visibleCategories.filter(c => c.kind === 'income'),     [visibleCategories]);
  const investmentCats = useMemo(() => visibleCategories.filter(c => c.kind === 'investment'), [visibleCategories]);

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Navigation bounds: back to the earliest month with data, forward +12 months.
  const earliestMonth = useMemo(() => {
    let min = currentMonth;
    for (const t of transactions) { const k = t.date.slice(0, 7); if (k < min) min = k; }
    for (const m of budgetHistory) { if (m.month < min) min = m.month; }
    return min;
  }, [transactions, budgetHistory, currentMonth]);
  const latestMonth = useMemo(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + 12, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [currentMonth]);
  const canGoPrev = selectedMonth > earliestMonth;
  const canGoNext = selectedMonth < latestMonth;
  const goPrev = () => { if (canGoPrev) setSelectedMonth(prevMonthKey(selectedMonth)); };
  const goNext = () => {
    if (!canGoNext) return;
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m, 1); // m is 1-based → next month
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  // Reference "now" for the forecast of the selected month: current → today;
  // past → its last day (so the forecast equals the consuntivo); future → its
  // first day (nothing spent yet → full projection).
  const refDate = useMemo(() => {
    if (isCurrentMonth) return new Date();
    const [y, m] = selectedMonth.split('-').map(Number);
    return isPastMonth ? new Date(y, m, 0) : new Date(y, m - 1, 1);
  }, [selectedMonth, isCurrentMonth, isPastMonth]);

  const isLearning = transactions.length === 0;

  // For a FUTURE month the recurring expense occurrences are still virtual (no
  // real docs), so the V4 expense engine wouldn't see them. Feed that month's
  // projected occurrences in so commitments are forecast. Current/past months
  // use the raw transactions unchanged.
  const txForForecast = useMemo(() => {
    if (!isFutureMonth) return transactions;
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const monthStart = `${selectedMonth}-01`;
    const monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    return [...transactions, ...buildProjectedOccurrences(transactions, monthStart, monthEnd)];
  }, [isFutureMonth, transactions, selectedMonth]);

  // ── Realized figures for the SELECTED month (same rule as useTransactions:
  // realized = not pending; net/own-share aware). Past month = full consuntivo,
  // future month = 0 (everything is still "programmato").
  const monthData = useMemo(() => {
    const expenseTotals: Record<string, number> = {};
    const incomeTotals: Record<string, number> = {};
    const investmentTotals: Record<string, number> = {};
    let mIncome = 0, mExpenses = 0, mInvestments = 0;
    for (const t of transactions) {
      if (isPending(t, todayISO)) continue;
      if (t.date.slice(0, 7) !== selectedMonth) continue;
      if (t.type === 'income') {
        mIncome += t.amount;
        incomeTotals[t.category] = (incomeTotals[t.category] ?? 0) + t.amount;
      } else if (t.type === 'expense') {
        const s = ownShare(t);
        mExpenses += s;
        expenseTotals[t.category] = (expenseTotals[t.category] ?? 0) + s;
      } else if (t.type === 'investment' && enableInvestments) {
        mInvestments += investSign(t) * t.amount;
        investmentTotals[t.category] = (investmentTotals[t.category] ?? 0) + t.amount;
      }
    }
    return { expenseTotals, incomeTotals, investmentTotals, mIncome, mExpenses, mInvestments };
  }, [transactions, selectedMonth, todayISO, enableInvestments]);

  // Budget VALUES for the selected month (live mirror for the current month,
  // otherwise the month's snapshot, otherwise empty).
  const monthBudget: BudgetState = useMemo(() => {
    if (isCurrentMonth) return budget;
    const snap = budgetHistory.find(m => m.month === selectedMonth);
    return snap ? monthlyToBudgetState(snap) : EMPTY_BUDGET;
  }, [isCurrentMonth, budget, budgetHistory, selectedMonth]);

  const monthStatus = isCurrentMonth
    ? monthlyStatus
    : (budgetHistory.find(m => m.month === selectedMonth)?.status ?? 'missing');
  const hasPrevSnapshot = budgetHistory.some(m => m.month === prevMonthKey(selectedMonth));

  const hasMonthBudget =
    monthBudget.suggestionAccepted ||
    Object.keys(monthBudget.categoryBudgets).length > 0 ||
    Object.keys(monthBudget.incomeBudgets).length > 0 ||
    Object.keys(monthBudget.investmentBudgets).length > 0;

  const expenseSpend = isLearning ? DEMO_CATEGORY_SPEND : monthData.expenseTotals;

  const suggested = useMemo(() => {
    if (isLearning) return DEMO_CATEGORY_BUDGETS;
    return suggestBudgets(transactions, expenseCats);
  }, [isLearning, transactions, expenseCats]);

  // End-of-month projection per expense category — V4 engine. For a PAST month
  // we show the realized consuntivo (no projection); demo mode shows nothing.
  const projectedSpend = useMemo(() => {
    if (isLearning) return {};
    if (isPastMonth) return monthData.expenseTotals;
    return forecastByCategoryV4(txForForecast, expenseCats, refDate, {
      categoryBudgets: monthBudget.categoryBudgets,
      budgetHistory,
      currentMonthBudgetStatus: isCurrentMonth ? monthlyStatus : undefined,
    });
  }, [isLearning, isPastMonth, monthData.expenseTotals, txForForecast, expenseCats, refDate, monthBudget.categoryBudgets, budgetHistory, isCurrentMonth, monthlyStatus]);

  // "Programmato" per category for the selected month: committed but not yet
  // realized — future-dated movements + upcoming recurring occurrences.
  const scheduledByCategory = useMemo(() => {
    const out: Record<string, number> = {};
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    const add = (id: string, amt: number) => { out[id] = (out[id] ?? 0) + amt; };
    for (const t of transactions) {
      if (!isPending(t, todayISO) || t.date.slice(0, 7) !== selectedMonth) continue;
      add(t.category, ownShare(t));
    }
    for (const t of buildProjectedOccurrences(transactions, todayISO, monthEnd)) {
      if (t.date.slice(0, 7) !== selectedMonth) continue;
      add(t.category, ownShare(t));
    }
    return out;
  }, [transactions, selectedMonth, todayISO]);

  // End-of-month forecast for the selected month — Forecast Engine V4.
  // Past month → the realized consuntivo (it already happened).
  const forecastObj = useMemo(() => {
    if (isLearning) {
      return { expectedIncome: monthData.mIncome, projectedExpenses: monthData.mExpenses, expectedInvest: monthData.mInvestments, savings: 420 };
    }
    if (isPastMonth) {
      const savings = monthData.mIncome - monthData.mExpenses - monthData.mInvestments;
      return { expectedIncome: monthData.mIncome, projectedExpenses: monthData.mExpenses, expectedInvest: monthData.mInvestments, savings };
    }
    const h = history(transactions, 3, refDate);
    const [y, m] = selectedMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const monthEnd = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
    const from = refDate.toISOString().slice(0, 10);
    const upcomingIncome = upcomingRecurringThisMonth(transactions, from, monthEnd, 'income')
      + upcomingPlannedThisMonth(transactions, from, monthEnd, 'income');
    const upcomingInvest = upcomingRecurringThisMonth(transactions, from, monthEnd, 'investment')
      + upcomingPlannedThisMonth(transactions, from, monthEnd, 'investment');
    return forecastSavingsV4({
      transactions: txForForecast,
      expenseCategories: expenseCats,
      monthlyIncome: monthData.mIncome, monthlyInvestments: monthData.mInvestments,
      avgIncome: h.avgIncome, avgInvest: h.avgInvest,
      upcomingIncome, upcomingInvest, now: refDate,
      categoryBudgets: monthBudget.categoryBudgets,
      budgetHistory,
      currentMonthBudgetStatus: isCurrentMonth ? monthlyStatus : undefined,
    });
  }, [isLearning, isPastMonth, monthData, txForForecast, transactions, expenseCats, refDate, selectedMonth, monthBudget.categoryBudgets, budgetHistory, isCurrentMonth, monthlyStatus]);

  const predicted = forecastObj.savings;

  const activeExpBudgets  = hasMonthBudget ? monthBudget.categoryBudgets  : (isLearning ? DEMO_CATEGORY_BUDGETS : {});
  const activeIncBudgets  = monthBudget.incomeBudgets;
  const activeInvBudgets  = monthBudget.investmentBudgets;

  const plannedIncome = useMemo(() => {
    const sum = Object.values(activeIncBudgets).reduce((s, v) => s + v, 0);
    return sum > 0 ? sum : monthData.mIncome;
  }, [activeIncBudgets, monthData.mIncome]);

  const plannedExpenses = useMemo(() => {
    const sum = Object.values(activeExpBudgets).reduce((s, v) => s + v, 0);
    return sum > 0 ? sum : (isLearning ? monthData.mExpenses : 0);
  }, [activeExpBudgets, monthData.mExpenses, isLearning]);

  const plannedInvestments = useMemo(() => {
    const sum = Object.values(activeInvBudgets).reduce((s, v) => s + v, 0);
    return sum > 0 ? sum : (isLearning ? monthlyInvestments : 0);
  }, [activeInvBudgets, monthlyInvestments, isLearning]);

  // Seasonal heads-up: a category that historically spikes this calendar month.
  const season = useMemo(() => (isLearning ? null : seasonalHint(transactions)), [isLearning, transactions]);
  const seasonCat = season ? categories.find(c => c.id === season.categoryId) : null;

  // Complete (past) months with at least one expense — V4 needs ~3 of them
  // before its statistical signals become reliable.
  const completedExpenseMonths = useMemo(() => {
    const months = new Set<string>();
    for (const t of transactions) {
      if (t.type === 'expense' && t.date.slice(0, 7) < currentMonth) months.add(t.date.slice(0, 7));
    }
    return months.size;
  }, [transactions, currentMonth]);

  // Righe della watchlist: una per categoria di spesa che ha un limite o su
  // cui si è mosso qualcosa. Stessa sorgente dei dati della lista completa.
  const watchRows: WatchRow[] = useMemo(() => expenseCats
    .map(c => ({
      cat: c,
      spent: expenseSpend[c.id] ?? 0,
      planned: activeExpBudgets[c.id] ?? 0,
      scheduled: scheduledByCategory[c.id] ?? 0,
      projected: projectedSpend[c.id] ?? 0,
    }))
    .filter(r => r.planned > 0 || r.spent > 0 || r.scheduled > 0)
    .sort((a, b) => (b.spent + b.scheduled) - (a.spent + a.scheduled)),
  [expenseCats, expenseSpend, activeExpBudgets, scheduledByCategory, projectedSpend]);

  // Totali dell'hero: i limiti del mese contro quello che è già uscito e
  // quello che uscirà comunque.
  const heroTotals = useMemo(() => ({
    planned: plannedExpenses,
    spent: watchRows.reduce((s, r) => s + r.spent, 0),
    scheduled: watchRows.reduce((s, r) => s + r.scheduled, 0),
  }), [plannedExpenses, watchRows]);

  const lastDayOfMonth = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }, [selectedMonth]);

  const openEdit = (section: EditSection = 'expenses', catId?: string) => {
    setEditSection(section);
    setFocusCategory(catId ?? null);
    setEditOpen(true);
  };

  return (
    <div className="pb-32 space-y-4 md:max-w-3xl">
      {/* Header 56px: titolo + navigatore mese compatto. Lo stato del mese non
          è più una pill decorativa: è diventato l'azione dentro l'hero. */}
      <div className="h-14 flex items-center justify-between gap-3">
        <h1 className="text-[17px] md:text-xl font-semibold text-primary tracking-[-0.03em]">Piano</h1>
        <div className="flex items-center gap-1.5">
          <MonthArrow dir="prev" disabled={!canGoPrev} onClick={goPrev} />
          <button onClick={() => setSelectedMonth(currentMonth)} disabled={isCurrentMonth}
            className="text-[13px] font-semibold text-primary whitespace-nowrap px-1 disabled:cursor-default"
            aria-label={isCurrentMonth ? undefined : 'Torna al mese corrente'}>
            {monthKeyLabel(selectedMonth)}
          </button>
          <MonthArrow dir="next" disabled={!canGoNext} onClick={goNext} />
        </div>
      </div>

      <BudgetHero
        planned={heroTotals.planned} spent={heroTotals.spent} scheduled={heroTotals.scheduled}
        lastDay={lastDayOfMonth}
        onConfirm={monthStatus !== 'confirmed' ? () => confirmMonth(selectedMonth) : undefined}
        onEditLimits={() => openEdit('expenses')}
      />

      {monthStatus !== 'confirmed' && hasPrevSnapshot && (
        <button onClick={() => copyPrevInto(selectedMonth)}
          className="w-full glass-card rounded-[18px] px-4 py-3 text-[13px] text-secondary text-left">
          Ricopia i limiti del mese precedente
        </button>
      )}

      {isLearning && (
        <div className="glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5">
          <span className="text-gold">✦</span>
          <p className="text-[13px] text-secondary">Sto imparando le tue abitudini finanziarie.</p>
        </div>
      )}

      {!isLearning && isCurrentMonth && completedExpenseMonths < 3 && (
        <div className="glass-card rounded-2xl px-4 py-3.5 flex items-start gap-3">
          <span className="text-gold mt-0.5">📊</span>
          <p className="text-[13px] text-secondary leading-snug">
            La previsione migliora con più dati. Aggiungi almeno{' '}
            <span className="text-primary font-medium">3 mesi</span> di movimenti
            per stime più affidabili
            {completedExpenseMonths > 0
              ? ` (${completedExpenseMonths} ${completedExpenseMonths === 1 ? 'mese disponibile' : 'mesi disponibili'} su 3).`
              : '.'}
          </p>
        </div>
      )}

      {/* Suggerimento se non ha ancora budget (solo mese corrente) */}
      {isCurrentMonth && !hasMonthBudget && (
        <SuggestedBudgetCard
          categories={expenseCats}
          suggested={suggested}
          onAccept={() => acceptSuggestion(suggested, monthBudget.savingsTarget)}
          onEdit={() => openEdit('expenses')}
        />
      )}

      {/* Banner stagionale (solo mese corrente) */}
      {isCurrentMonth && season && seasonCat && (
        <div className="glass-card rounded-2xl px-4 py-3.5 flex items-start gap-3 border border-gold/15">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0" style={{ backgroundColor: 'rgba(230,185,92,0.12)' }}>🗓️</span>
          <p className="text-[13px] text-primary/90 leading-snug">
            A <span className="font-medium">{monthKeyLabel(selectedMonth).split(' ')[0]}</span> di solito spendi di più in{' '}
            <span className="font-medium">{seasonCat.label}</span> (~{formatCurrency(season.monthAvg)} contro {formatCurrency(season.overallAvg)}/mese).
            Ne ho tenuto conto nel budget suggerito.
          </p>
        </div>
      )}



      {/* Uscite: in evidenza solo le categorie a rischio; le altre in una riga */}
      <WatchlistCategories rows={watchRows}
        onOpenCategory={id => openEdit('expenses', id)}
        onOpenAll={() => openEdit('expenses')} />

      {/* Entrate previste */}
      <div className="space-y-3">
        <CategoryBudgetList
          categories={incomeCats}
          spend={monthData.incomeTotals}
          budgets={activeIncBudgets}
          mode="income"
          scheduled={scheduledByCategory}
          onEditCategory={id => openEdit('income', id)}
        />
        {incomeCats.length > 0 && Object.keys(activeIncBudgets).length === 0 && (
          <button
            onClick={() => openEdit('income')}
            className="w-full bg-elevated rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left">
            <span className="text-gold">+</span>
            <p className="text-[13px] text-secondary">Aggiungi entrate previste per categoria</p>
          </button>
        )}
      </div>

      {/* Investimenti */}
      {enableInvestments && (
        <div className="space-y-3">
          <CategoryBudgetList
            categories={investmentCats}
            spend={monthData.investmentTotals}
            budgets={activeInvBudgets}
            mode="investment"
            scheduled={scheduledByCategory}
            onEditCategory={id => openEdit('investments', id)}
          />
          {investmentCats.length > 0 && Object.keys(activeInvBudgets).length === 0 && (
            <button
              onClick={() => openEdit('investments')}
              className="w-full bg-elevated rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left">
              <span className="text-gold">+</span>
              <p className="text-[13px] text-secondary">Aggiungi obiettivi di investimento mensili</p>
            </button>
          )}
        </div>
      )}

      {/* Programmato e previsto: la tabella resta, ma scende in fondo — è il
          dettaglio di controllo, non la prima cosa da guardare. */}
      <div className="space-y-3 pt-1">
        <SavingsGoalCard predicted={predicted} target={monthBudget.savingsTarget} onEdit={() => openEdit('savings')} />
        <BudgetOverview
          plannedIncome={plannedIncome} plannedExpenses={plannedExpenses} plannedInvestments={plannedInvestments}
          showInvest={enableInvestments}
          forecastIncome={forecastObj.expectedIncome}
          forecastExpenses={forecastObj.projectedExpenses}
          forecastInvestments={forecastObj.expectedInvest}
          forecastSavings={forecastObj.savings}
          monthLabel={monthKeyLabel(selectedMonth)}
          forecastColLabel={isPastMonth ? 'Consuntivo' : 'Previsto'}
        />
      </div>

      {/* Archivio riepiloghi: una riga sola, non dodici. */}
      {recapMonths.length > 0 && (
        <button onClick={() => navigate(`/recap/${recapMonths[0].ym}`)}
          className="w-full glass-card rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-3 text-left">
          <span className="text-[13.5px] text-primary">
            Riepiloghi mensili
            <span className="text-secondary"> · {recapMonths.length} {recapMonths.length === 1 ? 'mese' : 'mesi'}</span>
          </span>
          <span className="text-[12px] font-semibold text-gold flex-none">Archivio ›</span>
        </button>
      )}

      <BudgetEditSheet
        open={editOpen}
        expenseCategories={expenseCats}
        incomeCategories={incomeCats}
        investmentCategories={investmentCats}
        savingsTarget={monthBudget.savingsTarget}
        categoryBudgets={monthBudget.categoryBudgets}
        incomeBudgets={monthBudget.incomeBudgets}
        investmentBudgets={monthBudget.investmentBudgets}
        defaultTab={editSection}
        focusCategory={focusCategory}
        onSetTarget={n => setSavingsTargetFor(selectedMonth, n)}
        onSetCategory={(id, n) => setCategoryBudgetFor(selectedMonth, id, n)}
        onSetIncome={(id, n) => setIncomeBudgetFor(selectedMonth, id, n)}
        onSetInvestment={(id, n) => setInvestmentBudgetFor(selectedMonth, id, n)}
        hasBudget={hasMonthBudget}
        onResetAll={() => resetAllFor(selectedMonth)}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
