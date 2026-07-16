import { describe, it, expect } from 'vitest';
import { Transaction } from '../types';
import {
  tfrPortion, accountDelta, investedDelta, flowParts, netFlowDelta, aggregateFlow,
} from './financialFlow';

const base = { id: 'x', date: '2026-07-10', description: 't', category: 'c' };
const tx = (over: Partial<Transaction>): Transaction =>
  ({ ...base, amount: 0, type: 'expense', account: 'a1', ...over }) as Transaction;

describe('tfrPortion', () => {
  it('clamps to [0, amount] on deposits', () => {
    expect(tfrPortion(tx({ type: 'investment', amount: 300, tfr: 200 }))).toBe(200);
    expect(tfrPortion(tx({ type: 'investment', amount: 300, tfr: 500 }))).toBe(300);
    expect(tfrPortion(tx({ type: 'investment', amount: 300, tfr: -5 }))).toBe(0);
    expect(tfrPortion(tx({ type: 'investment', amount: 300 }))).toBe(0);
  });
  it('is 0 for withdrawals and non-investments', () => {
    expect(tfrPortion(tx({ type: 'investment', amount: 300, tfr: 100, direction: 'out' }))).toBe(0);
    expect(tfrPortion(tx({ type: 'expense', amount: 300, tfr: 100 }))).toBe(0);
  });
});

describe('accountDelta — spec example: deposit 300, TFR 200', () => {
  it('with account: only the non-TFR share (100) leaves the account', () => {
    const t = tx({ type: 'investment', amount: 300, tfr: 200, account: 'a1' });
    expect(accountDelta(t, 'a1')).toBe(-100);
    expect(accountDelta(t, 'other')).toBe(0);
  });
  it('without account: no account is touched', () => {
    const t = tx({ type: 'investment', amount: 300, tfr: 200, account: '' });
    expect(accountDelta(t, 'a1')).toBe(0);
    expect(accountDelta(t, '')).toBe(0);
  });
  it('withdrawal credits the destination in full', () => {
    const t = tx({ type: 'investment', amount: 250, direction: 'out', account: 'a1' });
    expect(accountDelta(t, 'a1')).toBe(250);
  });
  it('income, expense (ownShare) and transfers behave as before', () => {
    expect(accountDelta(tx({ type: 'income', amount: 100 }), 'a1')).toBe(100);
    expect(accountDelta(tx({ type: 'expense', amount: 80, shared: 30 }), 'a1')).toBe(-50);
    const tr = tx({ type: 'transfer', amount: 40, account: 'a1', toAccount: 'a2' });
    expect(accountDelta(tr, 'a1')).toBe(-40);
    expect(accountDelta(tr, 'a2')).toBe(40);
  });
});

describe('investedDelta', () => {
  it('deposits count IN FULL (TFR included), withdrawals subtract', () => {
    expect(investedDelta(tx({ type: 'investment', amount: 300, tfr: 200 }))).toBe(300);
    expect(investedDelta(tx({ type: 'investment', amount: 120, direction: 'out' }))).toBe(-120);
    expect(investedDelta(tx({ type: 'expense', amount: 50 }))).toBe(0);
  });
});

describe('flowParts / aggregateFlow — unified flow', () => {
  it('deposit WITHOUT account: non-TFR share is an external inflow, liquidity untouched', () => {
    const f = aggregateFlow([tx({ type: 'investment', amount: 300, tfr: 200, account: '' })]);
    expect(f.externalContributions).toBe(100);
    expect(f.tfrExcluded).toBe(200);
    expect(f.cashIn).toBe(100);
    expect(f.cashOut).toBe(0);
    expect(f.netFlow).toBe(100);
  });
  it('deposit WITH account: non-TFR share is a real outflow', () => {
    const f = aggregateFlow([tx({ type: 'investment', amount: 300, tfr: 200, account: 'a1' })]);
    expect(f.investedFromAccounts).toBe(100);
    expect(f.tfrExcluded).toBe(200);
    expect(f.cashIn).toBe(0);
    expect(f.cashOut).toBe(100);
    expect(f.netFlow).toBe(-100);
  });
  it('withdrawal: the returned capital is an inflow; the linked plus/minus stays in its own tx (no double counting)', () => {
    // Disinvestment of 250 cash on a position with capitaleRimborsato 200 → the
    // 'out' leg carries 200; the 50 gain is a SEPARATE income transaction.
    const f = aggregateFlow([
      tx({ type: 'investment', amount: 200, direction: 'out', account: 'a1' }),
      tx({ type: 'income', amount: 50, category: '__plusvalenza__' }),
    ]);
    expect(f.capitalReturned).toBe(200);
    expect(f.ordinaryIncome).toBe(50);
    expect(f.cashIn).toBe(250); // exactly the cash that arrived — counted once
  });
  it('transfers are excluded from the global flow', () => {
    const f = aggregateFlow([tx({ type: 'transfer', amount: 500, account: 'a1', toAccount: 'a2' })]);
    expect(f).toMatchObject({ cashIn: 0, cashOut: 0, netFlow: 0 });
  });
  it('full formula: cashIn/cashOut/netFlow', () => {
    const f = aggregateFlow([
      tx({ type: 'income', amount: 2000 }),                                        // stipendio
      tx({ type: 'expense', amount: 800 }),                                        // spese
      tx({ type: 'investment', amount: 300, tfr: 200, account: 'a1' }),            // deposito con conto
      tx({ type: 'investment', amount: 150, account: '' }),                        // apporto esterno
      tx({ type: 'investment', amount: 120, direction: 'out', account: 'a1' }),    // rientro
    ]);
    expect(f.cashIn).toBe(2000 + 150 + 120);
    expect(f.cashOut).toBe(800 + 100);
    expect(f.netFlow).toBe(f.cashIn - f.cashOut);
    expect(f.tfrExcluded).toBe(200);
  });
  it('netFlowDelta matches aggregateFlow for every type', () => {
    const txs = [
      tx({ type: 'income', amount: 10 }),
      tx({ type: 'expense', amount: 4, shared: 1 }),
      tx({ type: 'investment', amount: 9, tfr: 3, account: 'a1' }),
      tx({ type: 'investment', amount: 5, account: '' }),
      tx({ type: 'investment', amount: 2, direction: 'out', account: 'a1' }),
      tx({ type: 'transfer', amount: 7, account: 'a1', toAccount: 'a2' }),
    ];
    const sum = txs.reduce((s, t) => s + netFlowDelta(t), 0);
    expect(sum).toBeCloseTo(aggregateFlow(txs).netFlow, 6);
  });
  it('flowParts of a plain expense uses ownShare', () => {
    expect(flowParts(tx({ type: 'expense', amount: 60, shared: 20 })).expenses).toBe(40);
  });
});
