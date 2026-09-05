import { CategoryDef, Transaction, investSign } from '../../types';
import { isExpiredTemplate, isPending } from '../../shared/recurrence';

export interface InvestmentTrendPoint {
  key: string;
  versato: number;
  deposits: number;
  /** Capital returned, not withdrawal proceeds (which may include gains). */
  returned: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/** Same realized-movement and per-category floor rules as useTransactions.
 * Initial balances are undated opening capital, not invented monthly deposits.
 * No market-value history is inferred from cash flows.
 */
export function buildInvestmentTrend(
  keys: string[], categories: CategoryDef[], transactions: Transaction[], todayISO: string,
): InvestmentTrendPoint[] {
  if (!keys.length) return [];
  const balances = new Map(categories.filter(c => c.kind === 'investment' && !c.archived)
    .map(c => [c.id, c.initialBalance ?? 0]));
  const flows = transactions.filter(t => t.type === 'investment' && balances.has(t.category)
    && !t.projected && !isExpiredTemplate(t) && !isPending(t, todayISO))
    .sort((a, b) => a.date.localeCompare(b.date));
  let cursor = 0;
  return keys.map(key => {
    let deposits = 0, returned = 0;
    while (cursor < flows.length && flows[cursor].date.slice(0, 7) <= key) {
      const t = flows[cursor++];
      balances.set(t.category, (balances.get(t.category) ?? 0) + investSign(t) * t.amount);
      if (t.date.slice(0, 7) === key) {
        if (t.direction === 'out') returned += t.amount;
        else deposits += t.amount;
      }
    }
    return {
      key, versato: cents([...balances.values()].reduce((sum, value) => sum + Math.max(0, value), 0)),
      deposits: cents(deposits), returned: cents(returned),
    };
  });
}

export function summarizeInvestmentPeriod(points: InvestmentTrendPoint[]) {
  const deposits = cents(points.reduce((s, p) => s + p.deposits, 0));
  const returned = cents(points.reduce((s, p) => s + p.returned, 0));
  return { deposits, returned, net: cents(deposits - returned) };
}

/** A zero-based, readable euro scale also for empty/flat series. */
export function investmentAxisMax(points: InvestmentTrendPoint[]) {
  const max = Math.max(0, ...points.map(p => p.versato));
  const rawStep = (max || 100) / 4;
  const power = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].find(n => n * power >= rawStep)! * power;
  return step * 4;
}
