import { type CategoryDef, type Transaction, investSign } from '../../types';
import { addMonths } from './investmentStatsSpread';

/** Month-end paid capital for the same visible positions as the portfolio hero.
 * Undated opening capital remains a constant baseline, as in account balances.
 * No market valuations are reconstructed.
 */
export function portfolioHistory(categories: CategoryDef[], transactions: Transaction[], today: string) {
  const cats = categories.filter(c => c.kind === 'investment' && !c.archived);
  const ids = new Set(cats.map(c => c.id));
  const txs = transactions.filter(t => t.type === 'investment' && ids.has(t.category) && !t.projected && t.date <= today);
  const currentMonth = today.slice(0, 7);
  const dates = [...txs.map(t => t.date), ...cats.flatMap(c => c.subscriptionDate && c.subscriptionDate <= today ? [c.subscriptionDate] : [])];
  const first = dates.sort()[0]?.slice(0, 7) ?? currentMonth;
  const balances = new Map(cats.map(c => [c.id, c.initialBalance ?? 0]));
  const events = new Map<string, { id: string; amount: number }[]>();
  const add = (month: string, id: string, amount: number) => events.set(month, [...(events.get(month) ?? []), { id, amount }]);
  for (const t of txs) {
    const amount = investSign(t) * t.amount;
    balances.set(t.category, (balances.get(t.category) ?? 0) + amount);
    add(t.date.slice(0, 7), t.category, amount);
  }
  for (const c of cats) if (c.initialBalance && c.subscriptionDate && c.subscriptionDate <= today) add(c.subscriptionDate.slice(0, 7), c.id, c.initialBalance);
  const points: { key: string; versato: number }[] = [];
  for (let key = currentMonth; key >= first; key = addMonths(key, -1)) {
    points.push({ key, versato: [...balances.values()].reduce((sum, v) => sum + Math.max(0, v), 0) });
    for (const e of events.get(key) ?? []) balances.set(e.id, balances.get(e.id)! - e.amount);
  }
  return points.reverse();
}
