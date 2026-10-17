import { type CategoryDef, type Transaction, investSign } from '../../types';
/** Validate persisted/imported dates before using them as a loop boundary. */
export function isHistoryDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthKey = (index: number) => `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;

/** Month-end paid capital for the same visible positions as the portfolio hero.
 * Undated opening capital remains a constant baseline, as in account balances.
 * No market valuations are reconstructed.
 */
export function portfolioHistory(categories: CategoryDef[], transactions: Transaction[], today: string) {
  if (!isHistoryDate(today)) return [];
  const cats = categories.filter(c => c.kind === 'investment' && !c.archived);
  const ids = new Set(cats.map(c => c.id));
  const txs = transactions.filter(t => t.type === 'investment' && ids.has(t.category) && !t.projected && t.date <= today);
  const currentMonth = today.slice(0, 7);
  const dates = [...txs.map(t => t.date).filter(isHistoryDate), ...cats.flatMap(c => isHistoryDate(c.subscriptionDate) && c.subscriptionDate <= today ? [c.subscriptionDate] : [])];
  const first = dates.sort()[0]?.slice(0, 7) ?? currentMonth;
  const balances = new Map(cats.map(c => [c.id, c.initialBalance ?? 0]));
  const events = new Map<string, { id: string; amount: number }[]>();
  const add = (month: string, id: string, amount: number) => events.set(month, [...(events.get(month) ?? []), { id, amount }]);
  for (const t of txs) {
    const amount = investSign(t) * t.amount;
    balances.set(t.category, (balances.get(t.category) ?? 0) + amount);
    if (isHistoryDate(t.date)) add(t.date.slice(0, 7), t.category, amount);
  }
  for (const c of cats) if (c.initialBalance && isHistoryDate(c.subscriptionDate) && c.subscriptionDate <= today) add(c.subscriptionDate.slice(0, 7), c.id, c.initialBalance);
  const points: { key: string; versato: number }[] = [];
  // Integer month indices strictly decrease. Date.UTC maps years 0–99 to
  // 1900–1999 and can otherwise send a backward traversal into an endless loop.
  for (let index = monthIndex(currentMonth); index >= monthIndex(first); index--) {
    const key = monthKey(index);
    points.push({ key, versato: [...balances.values()].reduce((sum, v) => sum + Math.max(0, v), 0) });
    for (const e of events.get(key) ?? []) balances.set(e.id, balances.get(e.id)! - e.amount);
  }
  return points.reverse();
}
