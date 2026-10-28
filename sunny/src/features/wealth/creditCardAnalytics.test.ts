import { describe, expect, it } from 'vitest';
import { AccountDef, Transaction } from '../../types';
import { buildWealthHistory } from '../dashboard/wealthAnalytics';
import { buildWealthV2Summary } from './wealthV2';
import { computeAvailableCash } from './availableCash';
import { buildCommitments } from './commitments';
import { aggregateAccountBalanceTrend, aggregateAccountFlow, getAccountMovements, totalLiquidity } from '../dashboard/accountAnalytics';
import { getPeriodRange } from '../dashboard/categoryAnalytics';
import { buildCreditCardSettlements, withCreditCardCashEffects } from '../../../../functions/src/domain/creditCards';

const accounts: AccountDef[] = [
  { id: 'bank', label: 'Bank', icon: '', color: '', initialBalance: 1000 },
  { id: 'card', label: 'Card', icon: '', color: '', creditCardPolicies: [
    { fromMonth: '2026-10', enabled: true, paymentDay: 10, paymentAccountId: 'bank' },
  ] },
];
const tx = (id: string, amount: number, rest: Partial<Transaction> = {}): Transaction => ({
  id, amount, date: '2026-10-15', account: 'card', type: 'expense', category: 'food', description: id, ...rest,
});
const now = (day: string) => new Date(`${day}T12:00:00Z`);
const cash = (transactions: Transaction[], day: string, horizon: 7 | 14 | 30 = 30, acc = accounts) =>
  computeAvailableCash({ transactions, accounts: acc, liquidity: 1000, reserve: 0, horizon, now: now(day) });

describe('card liabilities across wealth and cash commitments', () => {
  it('uses the Rome day at month rollover for wealth, cash and account balances', () => {
    const instant = new Date('2026-10-31T23:30:00Z');
    const acc = accounts.map(a => a.id === 'card' ? { ...a, creditCardPolicies: a.creditCardPolicies!.map(p => ({ ...p, paymentDay: 1 })) } : a);
    const source = [tx('purchase', 100)];
    const points = buildWealthHistory(source, acc, [], '1m', { now: instant });
    expect(points.slice(-1)[0]).toMatchObject({ date: '2026-11-01', liquidity: 900, total: 900 });
    expect(buildWealthV2Summary(source, acc, [], '1m', { now: instant }).marketToday.netWorthAtMarket).toBe(900);
    expect(computeAvailableCash({ transactions: source, accounts: acc, liquidity: 900, reserve: 0, horizon: 'eom', now: instant }))
      .toMatchObject({ horizonEndISO: '2026-11-30', committed: 0, available: 900 });
    expect(totalLiquidity(source, acc, instant)).toBe(900);

    const realized = withCreditCardCashEffects([...source, ...buildCreditCardSettlements(source, acc, '2026-11-01')], acc);
    const range = getPeriodRange('1m', 0, instant);
    const flow = aggregateAccountFlow(realized, acc[0], range, { now: instant });
    expect(flow.closingBalance).toBe(900);
    expect(flow.transferNet).toBe(-100);
    expect(getAccountMovements(realized, acc[0], range, instant)).toHaveLength(1);
    expect(aggregateAccountBalanceTrend(realized, acc[0], '1m', 0, instant).slice(-1)[0].balance).toBe(900);
  });

  it('keeps a statement pending until Rome midnight even on a device already in tomorrow', () => {
    const instant = new Date('2026-10-31T22:30:00Z');
    const acc = accounts.map(a => a.id === 'card' ? { ...a, creditCardPolicies: a.creditCardPolicies!.map(p => ({ ...p, paymentDay: 1 })) } : a);
    const source = [tx('purchase', 100)];
    expect(buildWealthHistory(source, acc, [], '1m', { now: instant }).slice(-1)[0])
      .toMatchObject({ date: '2026-10-31', liquidity: 1000, total: 900 });
    expect(buildWealthV2Summary(source, acc, [], '1m', { now: instant }).base.liquidity.endValue).toBe(1000);
    expect(computeAvailableCash({ transactions: source, accounts: acc, liquidity: 1000, reserve: 0, horizon: 7, now: instant }))
      .toMatchObject({ horizonEndISO: '2026-11-07', committed: 100, available: 900 });
    expect(totalLiquidity(source, acc, instant)).toBe(1000);
  });

  it('keeps bank liquidity until payment and the liability in net worth throughout history', () => {
    const points = buildWealthHistory([tx('purchase', 100)], accounts, [], 'custom', {
      now: now('2026-11-11'), customStart: '2026-10-14', customEnd: '2026-11-11',
    });
    expect(points.find(p => p.date === '2026-10-14')).toMatchObject({ liquidity: 1000, total: 1000 });
    expect(points.find(p => p.date === '2026-10-15')).toMatchObject({ liquidity: 1000, total: 900 });
    expect(points.find(p => p.date === '2026-11-09')).toMatchObject({ liquidity: 1000, total: 900 });
    expect(points.find(p => p.date === '2026-11-10')).toMatchObject({ liquidity: 900, total: 900 });
  });

  it('preserves initial and preactivation balances while honoring excluded card debt', () => {
    const acc = accounts.map(a => a.id === 'card' ? { ...a, initialBalance: 50 } : a);
    const result = buildWealthHistory([tx('old', 20, { date: '2026-09-20' }), tx('new', 100)], acc, [], '1m', { now: now('2026-10-28') }).slice(-1)[0];
    expect(result).toMatchObject({ liquidity: 1030, total: 930 });
    const excluded = acc.map(a => a.id === 'card' ? { ...a, excludeFromNetWorth: true } : a);
    expect(buildWealthHistory([tx('new', 100)], excluded, [], '1m', { now: now('2026-10-28') }).slice(-1)[0]).toMatchObject({ liquidity: 1000, total: 1000 });
  });

  it('includes card liabilities in market wealth and preserves purchase-date decomposition', () => {
    const source = [tx('purchase', 100)];
    const annotated = withCreditCardCashEffects(source, accounts);
    const summary = buildWealthV2Summary(annotated, accounts, [], '1m', { now: now('2026-10-28') });
    expect(summary.base.liquidity.endValue).toBe(1000);
    expect(summary.marketToday.netWorthAtMarket).toBe(900);
    expect(summary.composition.accounts.find(a => a.id === 'card')?.value).toBe(-100);
    expect(summary.decomposition).toMatchObject({ netSavings: -100, deltaTotal: -100, adjustments: 0 });
  });

  it('reserves a future 100 payment from 1000 cash at its payment date', () => {
    const source = [tx('purchase', 100)];
    expect(cash(source, '2026-10-28', 7)).toMatchObject({ committed: 0, available: 1000 });
    expect(cash(source, '2026-10-28', 14)).toMatchObject({ committed: 100, available: 900 });
    expect(computeAvailableCash({ transactions: source, accounts, liquidity: 900, reserve: 0, horizon: 14, now: now('2026-11-10') }))
      .toMatchObject({ committed: 0, available: 900 });
    const due = buildCommitments(source, '2026-10-28', accounts).upcoming;
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({ date: '2026-11-10', amount: 100 });
  });

  it('replaces stale statements and never reserves a future card expense twice', () => {
    const source = [tx('future', 100, { date: '2026-10-30' })];
    const [old] = buildCreditCardSettlements([tx('future', 200)], accounts, '2026-10-28');
    const result = cash([...source, old], '2026-10-28', 30);
    expect(result).toMatchObject({ committed: 100, available: 900 });
    expect(result.committedItems.map(i => i.date)).toEqual(['2026-11-10']);
  });

  it('uses actual shared legs and card refunds, ignoring statistical refundedTotal', () => {
    const source = [
      tx('own', 60, { refundedTotal: 30 }),
      tx('other', 40, { type: 'transfer', toAccount: 'other' }),
      tx('refund', 20, { type: 'refund', date: '2026-10-20' }),
    ];
    expect(cash(source, '2026-10-28')).toMatchObject({ committed: 80, available: 920 });
    const point = buildWealthHistory(source, accounts, [], '1m', { now: now('2026-10-28') }).slice(-1)[0];
    expect(point).toMatchObject({ liquidity: 1040, total: 960 });
    const excluded = accounts.map(a => a.id === 'bank' ? { ...a, excludeFromNetWorth: true } : a);
    expect(cash(source, '2026-10-28', 30, excluded).committed).toBe(0);
  });

  it('moves recurring forecasts to payment date while leaving monthly costs at purchase date', () => {
    const source = [tx('purchase', 60), tx('monthly', 40, { date: '2026-10-30', recurring: { freq: 'monthly' } })];
    expect(cash(source, '2026-10-28', 7).committed).toBe(0);
    expect(cash(source, '2026-10-28', 14)).toMatchObject({ committed: 100, available: 900 });
    const summary = buildCommitments(source, '2026-10-28', accounts);
    expect(summary.fixedMonthlyCost).toBe(40);
    expect(summary.upcoming).toHaveLength(1);
    expect(summary.upcoming[0]).toMatchObject({ date: '2026-11-10', amount: 100 });
  });

  it('reserves annotated statements when account definitions are unavailable to the caller', () => {
    const source = [tx('purchase', 100)];
    const annotated = withCreditCardCashEffects([...source, ...buildCreditCardSettlements(source, accounts, '2026-10-28')], accounts);
    expect(computeAvailableCash({ transactions: annotated, liquidity: 1000, reserve: 0, horizon: 30, now: now('2026-10-28') }))
      .toMatchObject({ committed: 100, available: 900 });
  });

  it('carries card credits into later payments and does not offset bank refunds against card debt', () => {
    const credit = [tx('credit', 100, { type: 'refund' }), tx('nov', 140, { date: '2026-11-01' })];
    expect(cash(credit, '2026-11-12', 30)).toMatchObject({ committed: 40, available: 960 });
    const bankRefund = [tx('purchase', 100), tx('bank-refund', 30, { type: 'refund', account: 'bank' })];
    expect(cash(bankRefund, '2026-10-28')).toMatchObject({ committed: 100, available: 900 });
  });
});
