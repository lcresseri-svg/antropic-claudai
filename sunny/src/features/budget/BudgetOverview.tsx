import { formatCurrency, currentMonthLabel, capitalize } from '../../utils';

interface Props {
  plannedIncome: number;
  plannedExpenses: number;
  plannedInvestments: number;
  showInvest?: boolean;
  /** Forecast V3 ("Previsto") counterparts. When provided, each row shows the
   *  planned value ("Programmato") beside the statistical forecast ("Previsto").
   *  These are computed once for the Obiettivo card and reused here — never
   *  recomputed. The forecast column is hidden entirely when absent. */
  forecastIncome?: number;
  forecastExpenses?: number;
  forecastInvestments?: number;
  forecastSavings?: number;
}

/** Top-of-page snapshot of the month's plan. Each metric is shown twice:
 *  "Programmato" (manual budget/limits) and "Previsto" (V3 forecast on the real
 *  spending pace). The two are semantically distinct — a budget cap vs. a
 *  statistical estimate — so they're surfaced side by side, never conflated. */
export function BudgetOverview({
  plannedIncome, plannedExpenses, plannedInvestments, showInvest = true,
  forecastIncome, forecastExpenses, forecastInvestments, forecastSavings,
}: Props) {
  const effectiveInvest = showInvest ? plannedInvestments : 0;
  const leftover = plannedIncome - plannedExpenses - effectiveInvest;
  const max = Math.max(plannedIncome, 1);
  const seg = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  const hasForecast = forecastSavings !== undefined;
  const cols = hasForecast ? 'grid-cols-[1fr_auto_auto]' : 'grid-cols-[1fr_auto]';

  return (
    <div className="glass-card rounded-2xl p-5">
      <p className="label-caps text-secondary mb-4">Piano di {capitalize(currentMonthLabel())}</p>

      {/* Stacked plan bar — based on the planned ("Programmato") figures */}
      <div className="h-2.5 rounded-full overflow-hidden flex" style={{ backgroundColor: 'var(--progress-track)' }}>
        <div style={{ width: seg(plannedExpenses), backgroundColor: '#E08B8B' }} />
        {showInvest && <div style={{ width: seg(plannedInvestments), backgroundColor: 'var(--accent-gold)' }} />}
        <div style={{ width: seg(Math.max(0, leftover)), backgroundColor: 'var(--accent-green)' }} />
      </div>

      <div className={`grid ${cols} gap-x-5 gap-y-3 items-center mt-5`}>
        {/* Column captions */}
        {hasForecast && (
          <>
            <span />
            <Caption>Programmato</Caption>
            <Caption>Previsto</Caption>
          </>
        )}

        <Metric color="var(--accent-green)" label="Entrate" planned={plannedIncome} forecast={forecastIncome} hasForecast={hasForecast} />
        <Metric color="#E08B8B" label="Spese" planned={plannedExpenses} forecast={forecastExpenses} hasForecast={hasForecast} />
        {showInvest && (
          <Metric color="var(--accent-gold)" label="Investimenti" planned={plannedInvestments} forecast={forecastInvestments} hasForecast={hasForecast} />
        )}

        <div className={`${hasForecast ? 'col-span-3' : 'col-span-2'} h-px bg-divider`} />

        <Metric
          color="var(--accent-green)" label="Resta da risparmiare"
          planned={leftover} forecast={forecastSavings} hasForecast={hasForecast} final
        />
      </div>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-medium uppercase tracking-[0.08em] text-secondary/70 text-right">
      {children}
    </span>
  );
}

function Metric({
  color, label, planned, forecast, hasForecast, final,
}: {
  color: string; label: string; planned: number; forecast?: number; hasForecast: boolean; final?: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <p className={`truncate ${final ? 'text-[12px] text-primary font-medium' : 'text-[12px] text-secondary'}`}>{label}</p>
      </div>

      {/* Programmato — the primary reference figure */}
      <p className={`balance-num text-right ${final ? 'text-[14px] font-semibold' : 'text-[13px] font-medium'} ${
        planned < 0 ? 'text-red/80' : 'text-primary'
      }`}>
        {formatCurrency(planned)}
      </p>

      {/* Previsto — visually quieter; the realistic positive outcome shown in calm gold */}
      {hasForecast && (
        <p className={`balance-num text-right ${final ? 'text-[14px] font-semibold' : 'text-[13px] font-medium'} ${
          final
            ? ((forecast ?? 0) >= 0 ? 'text-gold' : 'text-red/80')
            : 'text-secondary'
        }`}>
          {formatCurrency(forecast ?? 0)}
        </p>
      )}
    </>
  );
}
