// Home "Oggi" — redesign 2.0.0.
//
// La home risponde a UNA domanda: "quanto posso spendere?". Da qui la sequenza
// dei blocchi: liquidità libera → patrimonio → ritmo del mese → dove vanno i
// soldi → prossima mossa. Tutto il resto è uscito:
//
//   TrendChart, AIDigestCard, InsightTicker, le 4 MonthStatCard → via
//   AccountsCard, InvestmentSummaryCard, CategoryCard              → dettaglio,
//     raggiungibile dalle due righe di navigazione della card Patrimonio
//     (/account-balance e /investments) e dal link "Tutte" delle uscite.
//
// Desktop: due colonne INDIPENDENTI in altezza (come già faceva la vecchia
// dashboard) — a sinistra hero + Ritmo|Torta, a destra 352px con patrimonio,
// prossima mossa e ultimi movimenti.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { monthContext } from '../../utils';
import { FlowBreakdown } from '../../shared/financialFlow';
import { useSettings } from '../../shared/providers/settings';
import { buildInsights } from '../insights/insightsEngine';
import { isPending } from '../../shared/recurrence';
import { computeAvailableCash } from '../wealth/availableCash';
import { buildWealthHistory } from './wealthAnalytics';
import { localISO } from './categoryAnalytics';
import { FreeCashHero } from './FreeCashHero';
import { NetWorthCard } from './NetWorthCard';
import { MonthRhythm } from './MonthRhythm';
import { SpendingBreakdownCard } from './SpendingBreakdownCard';
import { NextMoveCard, pickNextMove } from './NextMoveCard';
import { RecentMovementsCard } from './RecentMovementsCard';
import { ReorderHomeSheet } from './ReorderHomeSheet';
import { HomeBlockId, resolveHomeOrder } from './homeOrder';
import { WrappedEntryCard } from '../wrapped/WrappedEntryCard';
import { isFeatureEnabled } from '../../shared/featureRollout';

interface Props {
  greeting?: string;
  netWorth: number;
  liquidity: number;
  investmentTotal: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyInvestments: number;
  /** Unified cash flow of the current month (single source of truth). */
  monthlyFlow: FlowBreakdown;
  investmentByCategory: Record<string, number>;
  accountBalances: Record<string, number>;
  trend: { key: string; income: number; expense: number; invest: number }[];
  transactions: Transaction[];
  /** Occorrenze proiettate — servono al Wrapped per contare anche il programmato. */
  projected?: Transaction[];
  /** Uid: la card del Wrapped ricorda "più tardi" per utente, non per device. */
  userId?: string;
  portfolio?: { controvalore: number; versato: number };
  // The following props are kept for backward compat with the App.tsx call site
  // but are not used in this layout.
  savingsTarget: number;
  onSeeInsights: () => void;
  onSeeInvestments: () => void;
  onSeeCategories?: () => void;
  onSeeAccountBalance?: () => void;
  onAddExpense: () => void;
  onAddIncome: () => void;
  onImportCSV: () => void;
}

export function DashboardV2(p: Props) {
  const navigate = useNavigate();
  const {
    enableInvestments, getCat, insightDepth, visibleCategories, accounts, categories, includeInvestments,
    cashReserve, homeOrder, saveHomeOrder,
  } = useSettings();

  const [reorderOpen, setReorderOpen] = useState(false);
  // L'ordine salvato viene riconciliato con i blocchi che esistono davvero:
  // una preferenza vecchia non può far sparire un blocco nuovo.
  const order = useMemo(() => resolveHomeOrder(homeOrder), [homeOrder]);

  // Un solo `now` per tutto il render: hero, calendario e sparkline devono
  // riferirsi allo stesso istante, altrimenti a cavallo di mezzanotte
  // racconterebbero due giorni diversi.
  const now = useMemo(() => new Date(), []);

  // ── Liquidità libera ───────────────────────────────────────────────────────
  //   liquidità − uscite già impegnate entro fine mese − deposito di sicurezza
  // Il deposito è il cuscinetto che l'utente ha deciso di non toccare
  // (Impostazioni → Deposito di sicurezza); vale 0 finché non lo imposta.
  // Il calcolo è puro e locale: nessun dato nuovo, nessuna chiamata in più.
  const cash = useMemo(
    () => computeAvailableCash({
      transactions: p.transactions, liquidity: p.liquidity, horizon: 'eom', reserve: cashReserve, now,
    }),
    [p.transactions, p.liquidity, cashReserve, now],
  );

  // Spese del mese per categoria — realizzate soltanto: i movimenti ancora
  // `isPending` sono previsioni e vivono nel calendario come "programmato".
  const currentMonthCategoryTotals = useMemo(() => {
    const todayISO = localISO(now);
    const ym = todayISO.slice(0, 7);
    const totals: Record<string, number> = {};
    for (const t of p.transactions) {
      if (t.type !== 'expense' || t.date.slice(0, 7) !== ym) continue;
      if (isPending(t, todayISO)) continue;
      totals[t.category] = (totals[t.category] ?? 0) + ownShare(t);
    }
    return totals;
  }, [p.transactions, now]);

  // ── Patrimonio: serie a 3 mesi per la sparkline + variazione ───────────────
  // Le liste COMPLETE (archiviati inclusi) sono la stessa sorgente da cui
  // useTransactions ricava netWorth: conti e categorie archiviati portano
  // ancora storico.
  const wealth = useMemo(() => {
    const points = buildWealthHistory(p.transactions, accounts, categories, '3m', { now });
    // `total` include SEMPRE gli investimenti; la home invece rispetta la
    // preferenza dell'utente, quindi la serie deve seguire lo stesso numero.
    const series = points.map(pt => (includeInvestments ? pt.total : pt.liquidity));
    const first = series[0] ?? 0;
    const last = series[series.length - 1] ?? 0;
    const deltaPct = Math.abs(first) < 0.005 ? null : Math.round(((last - first) / Math.abs(first)) * 1000) / 10;
    return { series, deltaPct };
  }, [p.transactions, accounts, categories, includeInvestments, now]);

  const insights = useMemo(() =>
    buildInsights({
      transactions: p.transactions,
      monthlyIncome: p.monthlyIncome,
      monthlyExpenses: p.monthlyExpenses,
      monthlyInvestments: p.monthlyInvestments,
      getCat,
      depth: insightDepth,
      forecastExpenseCategories: visibleCategories.filter(c => c.kind === 'expense'),
      portfolio: p.portfolio,
    }),
  [p.transactions, p.monthlyIncome, p.monthlyExpenses, p.monthlyInvestments, getCat, insightDepth, visibleCategories, p.portfolio]);

  const nextMove = useMemo(() => pickNextMove(insights), [insights]);

  const flow = p.monthlyFlow;
  // TOTALE investito nel mese: quota dai conti + apporti esterni (senza conto)
  // + TFR. Solo la prima toglie liquidità.
  const investedTotal = flow.investedFromAccounts + flow.externalContributions + flow.tfrExcluded;

  const openCategories = p.onSeeCategories ?? (() => navigate('/category-spending'));

  const hero = (
    <FreeCashHero
      freeCash={cash.available} liquidity={p.liquidity} committed={cash.committed}
      reserve={cash.reserve}
      income={flow.cashIn} expenses={flow.expenses} invested={investedTotal}
      showInvested={enableInvestments}
      onOpenIncome={() => navigate('/income')}
      onOpenExpenses={openCategories}
      onOpenInvested={enableInvestments ? p.onSeeInvestments : undefined}
    />
  );

  const netWorthCard = (
    <NetWorthCard
      netWorth={p.netWorth}
      series={wealth.series}
      deltaPct={wealth.deltaPct}
      onOpenHistory={() => navigate('/wealth-history')}
      // Entrambe portano al tab Patrimonio: è lì che i due blocchi vivono
      // ora, uno sopra l'altro.
      rows={[
        {
          icon: '🏦', color: '#6FA8DC', label: 'Saldo per conto', value: p.liquidity,
          onClick: () => navigate('/wealth'),
        },
        ...(enableInvestments ? [{
          icon: '📊', color: '#E6B95C', label: 'Investimenti per categoria',
          value: p.investmentTotal, gold: true, onClick: () => navigate('/wealth'),
        }] : []),
      ]}
    />
  );

  const rhythm = (
    <div className="animate-rise-in" style={{ animationDelay: '0.12s' }}>
      <MonthRhythm
        transactions={p.transactions}
        scheduled={cash.committedItems}
        now={now}
        onSelectDay={iso => navigate(`/transactions?date=${iso}`)}
      />
    </div>
  );

  const breakdown = (
    <SpendingBreakdownCard categoryTotals={currentMonthCategoryTotals} onSeeAll={openCategories} />
  );

  // Il link agli impegni compare solo quando l'insight in evidenza parla di
  // un'uscita programmata: è lì che "e le altre?" è la domanda successiva.
  const showCommitmentsLink = nextMove?.category === 'forecast'
    && isFeatureEnabled('commitments', { uid: p.userId });
  const nextMoveCard = nextMove
    ? <NextMoveCard insight={nextMove} onSeeAll={p.onSeeInsights}
        onSeeCommitments={showCommitmentsLink ? () => navigate('/commitments') : undefined} />
    : null;

  const blocks: Record<HomeBlockId, React.ReactNode> = {
    patrimonio: netWorthCard,
    ritmo: rhythm,
    uscite: breakdown,
    mossa: nextMoveCard,
  };

  return (
    <div className="pb-32 md:pb-6">
      {/* Desktop: riga di testa con saluto + scorciatoia al riepilogo.
          Su mobile il contesto ("Agosto · giorno 24 di 31") sta nell'header. */}
      {p.greeting && (
        <div className="hidden md:flex items-end justify-between gap-5 mb-5">
          <div>
            <p className="text-xl font-semibold text-primary tracking-[-0.02em]">{p.greeting}</p>
            <p className="mt-1 text-[13px] text-secondary">{monthContext(now)}</p>
          </div>
          <button type="button" onClick={() => navigate(`/recap/${previousMonthKey(now)}`)}
            className="glass-card rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium text-secondary hover:text-primary transition-colors">
            Riepilogo di {previousMonthLabel(now)}
          </button>
        </div>
      )}

      {/* Mobile: colonna unica, nell'ordine scelto dall'utente. Desktop: due
          colonne indipendenti in altezza, ordine fisso — lì i blocchi stanno
          già affiancati e riordinarli non risolverebbe niente. */}
      <div className="flex flex-col wide:flex-row gap-3.5 md:gap-4 ultra:gap-6 wide:items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 wide:flex-1 wide:min-w-0">
          {p.userId && (
            <WrappedEntryCard
              transactions={p.transactions} projected={p.projected ?? []}
              userId={p.userId} onOpen={y => navigate(`/wrapped/${y}`)} />
          )}
          {hero}

          {/* Telefono: i blocchi nell'ordine preferito. */}
          <div className="contents md:hidden">
            {order.map(id => <div key={id} className="md:hidden">{blocks[id]}</div>)}
          </div>

          {/* Desktop: ritmo e torta affiancati, come da design. */}
          <div className="hidden md:flex flex-col lg:flex-row gap-3.5 lg:gap-4 lg:items-start">
            <div className="lg:flex-1 lg:min-w-0">{rhythm}</div>
            <div className="lg:flex-1 lg:min-w-0">{breakdown}</div>
          </div>
        </div>

        <div className="hidden md:flex md:flex-col md:gap-4 wide:w-[352px] ultra:w-[384px] wide:flex-none">
          {netWorthCard}
          {nextMoveCard}
          <RecentMovementsCard
            transactions={p.transactions} now={now}
            onSeeAll={() => navigate('/transactions')}
          />
        </div>
      </div>

      {/* Solo telefono: su desktop l'ordine è fisso, quindi il pulsante non c'è. */}
      <div className="md:hidden flex justify-center pt-5">
        <button type="button" onClick={() => setReorderOpen(true)}
          className="flex items-center gap-1.5 glass-card rounded-full px-3.5 py-2 text-[12px] font-medium text-secondary active:scale-[0.97] transition-transform">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 6h13M8 12h13M8 18h13M3 6l1.5 1.5L3 9M3 15l1.5 1.5L3 18" />
          </svg>
          Riordina
        </button>
      </div>

      <ReorderHomeSheet open={reorderOpen} order={order}
        onSave={next => saveHomeOrder(next)} onClose={() => setReorderOpen(false)} />
    </div>
  );
}

const previousMonth = (now: Date) => new Date(now.getFullYear(), now.getMonth() - 1, 1);

function previousMonthKey(now: Date): string {
  const d = previousMonth(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function previousMonthLabel(now: Date): string {
  return new Intl.DateTimeFormat('it-IT', { month: 'long' }).format(previousMonth(now));
}
