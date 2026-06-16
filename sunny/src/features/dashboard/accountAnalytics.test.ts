import { describe, it, expect } from 'vitest';
import { Transaction, AccountDef } from '../../types';
import { getPeriodRange } from './categoryAnalytics';
import {
  signedDelta, balanceAsOf, aggregateAccountFlow,
  aggregateAccountBalanceTrend, getAccountMovements, totalLiquidity,
} from './accountAnalytics';

// Fixed "now": mid-June 2026 (local), so the current 1m period is 1–15 June.
const NOW = new Date(2026, 5, 15, 12, 0, 0);

const ACC_A: AccountDef = { id: 'a', label: 'Conto A', icon: '🏦', color: '#888', initialBalance: 100 };
const ACC_B: AccountDef = { id: 'b', label: 'Conto B', icon: '🏦', color: '#888', initialBalance: 0 };
const ACC_INV: AccountDef = { id: 'inv', label: 'Investimenti', icon: '📊', color: '#888', initialBalance: 500, isInvestment: true };

let _id = 0;
function tx(p: Partial<Transaction> & Pick<Transaction, 'date' | 'type' | 'amount'>): Transaction {
  return {
    id: `t${_id++}`, description: '', category: 'x', account: 'a',
    ...p,
  } as Transaction;
}

// Shared fixture used across cases.
const TXS: Transaction[] = [
  tx({ date: '2026-05-20', type: 'income', amount: 50, account: 'a' }),                 // before period → opening only
  tx({ date: '2026-06-05', type: 'expense', amount: 10, account: 'a' }),                // in period
  tx({ date: '2026-06-08', type: 'transfer', amount: 25, account: 'a', toAccount: 'b' }),// in period (a→b)
  tx({ date: '2026-06-10', type: 'income', amount: 30, account: 'a' }),                 // in period
  tx({ date: '2026-06-12', type: 'investment', amount: 40, account: 'a', direction: 'in' }), // deposit → cash out
  tx({ date: '2026-06-20', type: 'income', amount: 999, account: 'a' }),                // FUTURE → ignored
];

const range = getPeriodRange('1m', 0, NOW); // June 2026, capped to the 15th

describe('accountAnalytics', () => {
  it('1. opening balance includes movements before the period, which are NOT in the flows', () => {
    const f = aggregateAccountFlow(TXS, ACC_A, range, { now: NOW });
    // initial 100 + the 50 May income = 150 opening; the May income is NOT counted as period income.
    expect(f.openingBalance).toBe(150);
    expect(f.income).toBe(30); // only the in-period income
  });

  it('2. the balance curve is cumulative and never starts at zero', () => {
    const trend = aggregateAccountBalanceTrend(TXS, ACC_A, '1m', 0, NOW);
    // First weekly bucket ends 2026-06-07: initial 100 + May income 50 − the 06-05 expense 10 = 140.
    expect(trend[0].balance).toBe(140);
    expect(trend[0].balance).not.toBe(0);
    // Curve ends at the closing balance (capped to today).
    expect(trend[trend.length - 1].balance).toBe(105);
  });

  it('3. an investment lowers the balance and lands in the investment KPI, not expense', () => {
    const f = aggregateAccountFlow(TXS, ACC_A, range, { now: NOW });
    expect(f.investment).toBe(40);
    expect(f.expense).toBe(10); // unchanged by the investment
    // The deposit reduces the account's cash balance.
    expect(signedDelta(TXS[4], 'a')).toBe(-40);
  });

  it('4. a transfer counts − on the source account and + on the destination', () => {
    const transfer = TXS[2];
    expect(signedDelta(transfer, 'a')).toBe(-25);
    expect(signedDelta(transfer, 'b')).toBe(25);
    expect(aggregateAccountFlow(TXS, ACC_A, range, { now: NOW }).transferNet).toBe(-25);
    expect(aggregateAccountFlow(TXS, ACC_B, range, { now: NOW }).transferNet).toBe(25);
  });

  it('5. the period always balances (quadratura)', () => {
    const f = aggregateAccountFlow(TXS, ACC_A, range, { now: NOW });
    expect(f.closingBalance).toBe(
      f.openingBalance + f.income - f.expense - f.investment + f.transferNet,
    );
    expect(f.closingBalance).toBe(105);
    // …and matches an independent point-in-time balance at the period end.
    expect(f.closingBalance).toBe(balanceAsOf(TXS, ACC_A, '2026-06-15'));
  });

  it('6. future-dated movements move neither the curve nor the KPIs', () => {
    const f = aggregateAccountFlow(TXS, ACC_A, range, { now: NOW });
    expect(f.income).toBe(30);              // not 30 + 999
    expect(f.closingBalance).toBe(105);
    expect(balanceAsOf(TXS, ACC_A, '2026-06-15')).toBe(105);
    const trend = aggregateAccountBalanceTrend(TXS, ACC_A, '1m', 0, NOW);
    expect(trend[trend.length - 1].balance).toBe(105); // unaffected by the 06-20 income
    const movements = getAccountMovements(TXS, ACC_A, range, NOW);
    expect(movements.some(m => m.amount === 999)).toBe(false);
  });

  it('7. total liquidity excludes isInvestment accounts', () => {
    const liq = totalLiquidity(TXS, [ACC_A, ACC_B, ACC_INV], NOW);
    // A = 105, B = 25, INV (500) excluded → 130 (not 630).
    expect(liq).toBe(130);
  });
});
