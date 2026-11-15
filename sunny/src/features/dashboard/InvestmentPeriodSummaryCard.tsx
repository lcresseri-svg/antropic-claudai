import { useMemo } from 'react';
import type { Transaction } from '../../types';
import { useAnalysisPeriod } from '../../shared/hooks/useAnalysisPeriod';
import { formatCurrency } from '../../utils';
import { getHistoryStartISO, getPeriodRange } from './categoryAnalytics';
import { PeriodControls } from './PeriodControls';
import { investmentPeriodSummary } from '../investments/investmentPeriodSummary';

export function InvestmentPeriodSummaryCard({ transactions }: { transactions: Transaction[] }) {
  const { period, setPeriod, offset, setOffset } = useAnalysisPeriod('investments.contributions');
  const now = useMemo(() => new Date(), []);
  const investmentTransactions = useMemo(() => transactions.filter(t => t.type === 'investment'), [transactions]);
  const historyStart = useMemo(() => getHistoryStartISO(investmentTransactions, now), [investmentTransactions, now]);
  const range = useMemo(() => getPeriodRange(period, offset, now, historyStart), [period, offset, now, historyStart]);
  const summary = useMemo(() => investmentPeriodSummary(investmentTransactions, range), [investmentTransactions, range]);

  return (
    <section aria-labelledby="investment-period-title">
      <h2 id="investment-period-title" className="text-[15px] font-semibold text-primary mb-3">Versamenti del periodo</h2>
      <PeriodControls period={period} onPeriodChange={setPeriod}
        offset={offset} onOffsetChange={setOffset} label={range.label} />
      <div className="glass-card rounded-2xl p-5" aria-live="polite" aria-atomic="true">
        <p className="label-caps text-secondary mb-2">Totale versato · {range.label}</p>
        <p className="text-[30px] leading-none font-bold balance-num text-primary">{formatCurrency(summary.deposits)}</p>
        <div className="flex items-baseline justify-between gap-3 mt-4 pt-3 border-t border-divider">
          <span className="text-[13px] text-secondary">Capitale rimborsato dai disinvestimenti</span>
          <span className="text-[14px] font-semibold balance-num text-primary">{formatCurrency(summary.returnedCapital)}</span>
        </div>
        <p className="text-xs text-secondary mt-3">Versamenti alle date effettive, inclusi TFR e contributi senza conto. Il capitale rimborsato esclude guadagni e perdite.</p>
        {summary.deposits === 0 && summary.returnedCapital === 0 && (
          <p className="text-[13px] text-secondary mt-3">Nessun versamento o disinvestimento in questo periodo.</p>
        )}
      </div>
    </section>
  );
}
