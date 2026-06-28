import { describe, it, expect } from 'vitest';
import { buildMonthlyRecap, listRecapMonths } from './monthlyRecap';
import { monthStats } from '../insights/insightsEngine';
import { Transaction, CategoryDef, AccountDef } from '../../types';

const NOW = new Date(2026, 5, 15); // 15 Jun 2026

const getCat = (id: string): CategoryDef => ({ id, label: id, icon: '•', color: '#000', kind: 'expense' });
const getAcc = (id: string): AccountDef => ({ id, label: id.toUpperCase(), icon: '•', color: '#000' });

let seq = 0;
function tx(date: string, type: Transaction['type'], amount: number, extra: Partial<Transaction> = {}): Transaction {
  return { id: `t${seq++}`, date, description: 'x', amount, type, category: 'spesa', account: 'cc', ...extra };
}

// History: Feb–May each 2000 income / 1000 expense; target May has a lower 600 expense.
function history(): Transaction[] {
  return [
    tx('2026-02-03', 'income', 2000), tx('2026-02-10', 'expense', 1000),
    tx('2026-03-03', 'income', 2000), tx('2026-03-10', 'expense', 1000),
    tx('2026-04-03', 'income', 2000), tx('2026-04-10', 'expense', 1000),
    // target month (May): income 2000, expense 600 (incl. a shared one), invest 300
    tx('2026-05-03', 'income', 2000),
    tx('2026-05-08', 'expense', 500, { category: 'spesa', shared: 100 }), // ownShare 400
    tx('2026-05-09', 'expense', 200, { category: 'svago' }),              // ownShare 200
    tx('2026-05-20', 'investment', 300, { category: 'etf' }),
  ];
}

describe('buildMonthlyRecap', () => {
  it('totals match monthStats exactly (single source of truth)', () => {
    const txs = history();
    const r = buildMonthlyRecap({ transactions: txs, getCat, getAcc, month: '2026-05', now: NOW });
    expect(r.totals).toEqual(monthStats(txs, '2026-05'));
    expect(r.totals.income).toBe(2000);
    expect(r.totals.expense).toBe(600);   // 400 (net of shared) + 200
    expect(r.totals.invest).toBe(300);
    expect(r.totals.savings).toBe(1100);  // 2000 − 600 − 300
  });

  it('expense KPI: spending less than usual is semantically GOOD (+1) and out of usual', () => {
    const r = buildMonthlyRecap({ transactions: history(), getCat, getAcc, month: '2026-05', now: NOW });
    const exp = r.kpis.find(k => k.key === 'expense')!;
    // usual expense ≈ 1000, this month 600 → delta −400, good (+1)
    expect(exp.vsUsual!.abs).toBe(-400);
    expect(exp.vsUsual!.good).toBe(1);
    expect(exp.value).toBe(600);
  });

  it('income KPI: flat vs usual → good 0', () => {
    const r = buildMonthlyRecap({ transactions: history(), getCat, getAcc, month: '2026-05', now: NOW });
    const inc = r.kpis.find(k => k.key === 'income')!;
    expect(inc.vsUsual!.abs).toBe(0);
    expect(inc.vsUsual!.good).toBe(0);
  });

  it('drivers surface the categories that changed vs the usual average', () => {
    const r = buildMonthlyRecap({ transactions: history(), getCat, getAcc, month: '2026-05', now: NOW });
    // 'spesa' historical avg = 1000/3 ≈ 333, this month 400 → up; 'svago' new → up 200.
    const ids = r.drivers.map(d => d.categoryId);
    expect(ids).toContain('svago');
    expect(r.drivers.length).toBeGreaterThan(0);
  });

  it('movements are the month rows sorted by date desc, with IT type labels', () => {
    const r = buildMonthlyRecap({ transactions: history(), getCat, getAcc, month: '2026-05', now: NOW });
    expect(r.movements).toHaveLength(4);
    const dates = r.movements.map(m => m.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(r.movements.find(m => m.type === 'investment')!.typeLabel).toBe('Investimento');
    expect(r.movements.find(m => m.type === 'income')!.typeLabel).toBe('Entrata');
  });

  it('flags the current month as partial', () => {
    const r = buildMonthlyRecap({ transactions: history(), getCat, getAcc, month: '2026-06', now: NOW });
    expect(r.isPartial).toBe(true);
  });

  it('degrades cleanly for a first month with no history (no comparisons)', () => {
    const txs = [tx('2026-05-03', 'income', 1000), tx('2026-05-10', 'expense', 400)];
    const r = buildMonthlyRecap({ transactions: txs, getCat, getAcc, month: '2026-05', now: NOW });
    expect(r.hasHistory).toBe(false);
    for (const k of r.kpis) {
      expect(k.vsPrev).toBeNull();
      expect(k.vsUsual).toBeNull();
    }
    expect(r.verdict).toMatch(/primo mese/i);
    expect(r.narrative.length).toBeGreaterThan(0);
  });
});

describe('listRecapMonths', () => {
  it('lists months with data, newest first, with saved totals', () => {
    const list = listRecapMonths(history());
    expect(list.map(m => m.ym)).toEqual(['2026-05', '2026-04', '2026-03', '2026-02']);
    expect(list[0].saved).toBe(monthStats(history(), '2026-05').savings);
  });
});
