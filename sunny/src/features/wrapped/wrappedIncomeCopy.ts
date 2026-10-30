import type { WrappedIncomeComparison } from './yearWrapped';

const dateLabel = (iso: string, withYear = false) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', {
  day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' as const } : {}),
});

/** A leap-day comparison must not claim the prior year had February 29. */
export function incomeComparisonPeriodText(comparison: WrappedIncomeComparison): string {
  return comparison.periodEndISO.slice(5) === comparison.previousPeriodEndISO.slice(5)
    ? `Confronto dei soli incassi fino al ${dateLabel(comparison.periodEndISO)} nei due anni.`
    : `Confronto dei soli incassi al ${dateLabel(comparison.periodEndISO, true)} e al ${dateLabel(comparison.previousPeriodEndISO, true)}.`;
}
