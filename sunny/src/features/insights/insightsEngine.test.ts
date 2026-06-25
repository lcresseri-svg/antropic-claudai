import { describe, it, expect } from 'vitest';
import { history, projectExpenses, buildInsights, monthKey } from './insightsEngine';
import { Transaction } from '../../types';

const NOW = new Date('2026-06-15T12:00:00Z'); // mid-month
const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-06-01', description: '', amount: 0,
  type: 'expense', category: 'spesa', account: 'conto_corrente', ...over,
});

const cat = (id: string) => ({ icon: '•', label: id });

describe('history', () => {
  it('averages over months that actually have data, not the full window', () => {
    const m1 = monthKey(1, NOW); // 2026-05
    const txs = [
      tx({ type: 'income', amount: 2000, date: `${m1}-10` }),
      tx({ type: 'income', amount: 1000, date: `${m1}-20` }),
    ];
    const h = history(txs, 3, NOW);
    expect(h.months).toBe(1);
    expect(h.avgIncome).toBe(3000); // 3000 / 1 active month, not /3
  });

  it('excludes the current (partial) month from the average', () => {
    const txs = [tx({ type: 'income', amount: 5000, date: '2026-06-05' })];
    expect(history(txs, 3, NOW).avgIncome).toBe(0);
  });

  it('averages income across two active months', () => {
    const txs = [
      tx({ type: 'income', amount: 2000, date: `${monthKey(1, NOW)}-10` }),
      tx({ type: 'income', amount: 2400, date: `${monthKey(2, NOW)}-10` }),
    ];
    expect(history(txs, 3, NOW).avgIncome).toBe(2200);
  });
});

describe('projectExpenses', () => {
  it('scales the run rate to a full month', () => {
    // mid-June: 15/30 elapsed -> ~0.5 progress -> doubles
    expect(projectExpenses(500, NOW)).toBeGreaterThan(900);
    expect(projectExpenses(500, NOW)).toBeLessThan(1100);
  });
});

describe('buildInsights', () => {
  it('returns a forecast and a savings insight when there is income and expenses', () => {
    const txs = [
      tx({ type: 'income', amount: 2000, date: '2026-06-02' }),
      tx({ type: 'expense', amount: 300, date: '2026-06-05' }),
    ];
    const res = buildInsights({
      transactions: txs, monthlyIncome: 2000, monthlyExpenses: 300, monthlyInvestments: 0,
      getCat: cat, now: NOW,
    });
    expect(res.some(i => i.icon === '🔮')).toBe(true);
    expect(res.some(i => i.icon === '✨')).toBe(true);
  });

  it('surfaces an empty-state insight when there is no data', () => {
    const res = buildInsights({
      transactions: [], monthlyIncome: 0, monthlyExpenses: 0, monthlyInvestments: 0,
      getCat: cat, now: NOW,
    });
    expect(res).toHaveLength(1);
    expect(res[0].title).toMatch(/Nessun insight/);
  });

  // A data-rich scenario that fires many insights, including several members of
  // the end-of-month projection family (#2 forecast, #24 pace-vs-avg, #28 seasonal).
  const richTxs: Transaction[] = [
    // Same month last year — seasonal baseline for #28.
    tx({ type: 'expense', amount: 1000, date: '2025-06-10' }),
    // Recent complete months — history average (~300/mo) for #24.
    tx({ type: 'income', amount: 2000, date: '2026-03-05' }), tx({ type: 'expense', amount: 300, date: '2026-03-12' }),
    tx({ type: 'income', amount: 2000, date: '2026-04-05' }), tx({ type: 'expense', amount: 300, date: '2026-04-12' }),
    tx({ type: 'income', amount: 2000, date: '2026-05-05' }), tx({ type: 'expense', amount: 300, date: '2026-05-12' }),
    // Current (partial) month — high pace pushes the projection well above both
    // the recent average and the seasonal baseline.
    tx({ type: 'income', amount: 2000, date: '2026-06-02' }),
    tx({ type: 'expense', amount: 800, date: '2026-06-05' }),
  ];

  it('assigns a valid tone to every insight', () => {
    const res = buildInsights({
      transactions: richTxs, monthlyIncome: 2000, monthlyExpenses: 800, monthlyInvestments: 0,
      getCat: cat, now: NOW,
    });
    expect(res.length).toBeGreaterThan(1);
    for (const i of res) {
      expect(['positive', 'neutral', 'caution']).toContain(i.tone);
    }
  });

  it('keeps at most one end-of-month projection insight', () => {
    const res = buildInsights({
      transactions: richTxs, monthlyIncome: 2000, monthlyExpenses: 800, monthlyInvestments: 0,
      getCat: cat, now: NOW,
    });
    const eom = res.filter(i => i._family === 'eom-projection');
    expect(eom.length).toBeLessThanOrEqual(1);
    // The highest-priority family member (#2 forecast, 🔮) is the survivor.
    expect(eom[0]?.icon).toBe('🔮');
  });
});

describe('buildInsights — FASE 2 minimal insights', () => {
  const build = (txs: Transaction[], over: Partial<Parameters<typeof buildInsights>[0]> = {}) =>
    buildInsights({
      transactions: txs, monthlyIncome: 0, monthlyExpenses: 0, monthlyInvestments: 0,
      getCat: cat, now: NOW, ...over,
    });

  // #35 — Cash runway
  describe('cash runway', () => {
    const healthy: Transaction[] = [
      tx({ type: 'income', amount: 2000, date: '2026-03-05' }), tx({ type: 'expense', amount: 300, date: '2026-03-12' }),
      tx({ type: 'income', amount: 2000, date: '2026-04-05' }), tx({ type: 'expense', amount: 300, date: '2026-04-12' }),
      tx({ type: 'income', amount: 2000, date: '2026-05-05' }), tx({ type: 'expense', amount: 300, date: '2026-05-12' }),
    ];
    it('surfaces a positive runway when the balance covers ≥2 months of spend', () => {
      const res = build(healthy);
      const i = res.find(x => x.icon === '🏦');
      expect(i).toBeDefined();
      expect(i!.tone).toBe('positive');
    });
    it('does not surface a runway when there is no expense history', () => {
      const res = build([tx({ type: 'income', amount: 2000, date: '2026-05-05' })]);
      expect(res.some(x => x.icon === '🏦' || x.icon === '⏳')).toBe(false);
    });
  });

  // #36 — Dormant category reawakening
  describe('dormant category', () => {
    it('flags a category that returns after ≥3 zero months', () => {
      const txs = [
        tx({ type: 'expense', amount: 60, date: '2026-01-10', category: 'ristoranti' }),
        tx({ type: 'expense', amount: 60, date: '2026-02-10', category: 'ristoranti' }),
        // March, April, May: no 'ristoranti' spend
        tx({ type: 'expense', amount: 120, date: '2026-06-10', category: 'ristoranti' }),
      ];
      const res = build(txs);
      expect(res.some(x => /tornata dopo una pausa/.test(x.title))).toBe(true);
    });
    it('does not flag a category that was active last month', () => {
      const txs = [
        tx({ type: 'expense', amount: 60, date: '2026-01-10', category: 'ristoranti' }),
        tx({ type: 'expense', amount: 60, date: '2026-05-10', category: 'ristoranti' }),
        tx({ type: 'expense', amount: 120, date: '2026-06-10', category: 'ristoranti' }),
      ];
      const res = build(txs);
      expect(res.some(x => /tornata dopo una pausa/.test(x.title))).toBe(false);
    });
  });

  // #37 — Impulse cluster
  describe('impulse cluster', () => {
    it('flags a single day with ≥4 expenses', () => {
      const txs = [
        tx({ amount: 50, date: '2026-06-05' }), tx({ amount: 50, date: '2026-06-05' }),
        tx({ amount: 50, date: '2026-06-05' }), tx({ amount: 50, date: '2026-06-05' }),
      ];
      const res = build(txs, { monthlyExpenses: 200 });
      expect(res.some(x => /Giornata di spesa intensa/.test(x.title))).toBe(true);
      expect(res.find(x => /Giornata di spesa intensa/.test(x.title))!.tone).toBe('caution');
    });
    it('does not flag spending spread thinly across days', () => {
      const txs = [
        tx({ amount: 100, date: '2026-06-03' }),
        tx({ amount: 100, date: '2026-06-08' }),
        tx({ amount: 100, date: '2026-06-12' }),
      ];
      const res = build(txs, { monthlyExpenses: 300 });
      expect(res.some(x => /Giornata di spesa intensa/.test(x.title))).toBe(false);
    });
  });

  // #38 — First-time merchant
  describe('first-time merchant', () => {
    it('flags a never-seen description above the threshold', () => {
      const txs = [
        tx({ amount: 40, date: '2026-05-10', description: 'Esselunga' }),
        tx({ amount: 80, date: '2026-06-08', description: 'Decathlon' }),
      ];
      const res = build(txs);
      expect(res.some(x => /Prima volta: Decathlon/.test(x.title))).toBe(true);
    });
    it('does not flag a description seen in a prior month', () => {
      const txs = [
        tx({ amount: 40, date: '2026-05-10', description: 'Esselunga' }),
        tx({ amount: 80, date: '2026-06-08', description: 'Esselunga' }),
      ];
      const res = build(txs);
      expect(res.some(x => /Prima volta/.test(x.title))).toBe(false);
    });
    it('does not flag a new description below the amount threshold', () => {
      const txs = [
        tx({ amount: 40, date: '2026-05-10', description: 'Esselunga' }),
        tx({ amount: 30, date: '2026-06-08', description: 'Decathlon' }),
      ];
      const res = build(txs);
      expect(res.some(x => /Prima volta/.test(x.title))).toBe(false);
    });
  });

  // #39 — Savings rate vs benchmark
  describe('savings rate benchmark', () => {
    const months = (income: number, expense: number): Transaction[] => [
      tx({ type: 'income', amount: income, date: '2026-04-05' }), tx({ type: 'expense', amount: expense, date: '2026-04-12' }),
      tx({ type: 'income', amount: income, date: '2026-05-05' }), tx({ type: 'expense', amount: expense, date: '2026-05-12' }),
    ];
    it('celebrates a savings rate at or above 20%', () => {
      const res = build(months(2000, 300)); // rate 85%
      const i = res.find(x => x.icon === '🌟');
      expect(i).toBeDefined();
      expect(i!.tone).toBe('positive');
    });
    it('reports a below-benchmark rate neutrally, never blaming', () => {
      const res = build(months(2000, 1800)); // rate 10%
      const i = res.find(x => x.icon === '🌱');
      expect(i).toBeDefined();
      expect(i!.tone).toBe('neutral');
      expect(res.some(x => x.icon === '🌟')).toBe(false);
    });
  });
});

describe('buildInsights — FASE 3 medium insights', () => {
  const build = (txs: Transaction[], over: Partial<Parameters<typeof buildInsights>[0]> = {}) =>
    buildInsights({
      transactions: txs, monthlyIncome: 0, monthlyExpenses: 0, monthlyInvestments: 0,
      getCat: cat, now: NOW, ...over,
    });

  // #40 — Portfolio performance
  describe('portfolio performance', () => {
    it('reports a latent gain positively', () => {
      const res = build([], { portfolio: { controvalore: 12000, versato: 10000 } });
      const i = res.find(x => /Investimenti in guadagno/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('positive');
    });
    it('reports a latent loss as caution', () => {
      const res = build([], { portfolio: { controvalore: 8000, versato: 10000 } });
      const i = res.find(x => /Investimenti in perdita/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('caution');
    });
    it('stays silent on a flat portfolio (<1%)', () => {
      const res = build([], { portfolio: { controvalore: 10050, versato: 10000 } });
      expect(res.some(x => /Investimenti in (guadagno|perdita)/.test(x.title))).toBe(false);
    });
  });

  // #41 — Net worth trajectory
  describe('net worth trajectory', () => {
    const climbing: Transaction[] = [
      tx({ type: 'income', amount: 2000, date: '2026-03-05' }), tx({ type: 'expense', amount: 300, date: '2026-03-12' }),
      tx({ type: 'income', amount: 2000, date: '2026-04-05' }), tx({ type: 'expense', amount: 300, date: '2026-04-12' }),
      tx({ type: 'income', amount: 2000, date: '2026-05-05' }), tx({ type: 'expense', amount: 300, date: '2026-05-12' }),
      tx({ type: 'income', amount: 2000, date: '2026-06-05' }), tx({ type: 'expense', amount: 300, date: '2026-06-10' }),
    ];
    it('celebrates a new all-time net-worth high', () => {
      const res = build(climbing);
      const i = res.find(x => /Nuovo massimo di patrimonio/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('positive');
    });
    it('stays silent when the latest month is not a new high', () => {
      const dipping = [
        tx({ type: 'income', amount: 2000, date: '2026-03-05' }), tx({ type: 'expense', amount: 300, date: '2026-03-12' }),
        tx({ type: 'income', amount: 2000, date: '2026-04-05' }), tx({ type: 'expense', amount: 300, date: '2026-04-12' }),
        tx({ type: 'income', amount: 2000, date: '2026-05-05' }), tx({ type: 'expense', amount: 300, date: '2026-05-12' }),
        // June: big spend, cumulative dips below May's peak
        tx({ type: 'expense', amount: 2000, date: '2026-06-10' }),
      ];
      const res = build(dipping);
      expect(res.some(x => /Nuovo massimo di patrimonio/.test(x.title))).toBe(false);
    });
  });

  // #42 — Subscription price creep
  describe('price creep', () => {
    const series = (amounts: number[]): Transaction[] =>
      amounts.map((a, i) => tx({
        type: 'expense', amount: a, seriesId: 'netflix', description: 'Netflix',
        date: `2026-0${3 + i}-01`,
      }));
    it('flags a stable subscription that jumped ≥10%', () => {
      const res = build(series([10, 10, 10, 13]));
      const i = res.find(x => /Rincaro/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('caution');
    });
    it('ignores a subscription with a flat price', () => {
      const res = build(series([10, 10, 10, 10]));
      expect(res.some(x => /Rincaro/.test(x.title))).toBe(false);
    });
    it('ignores a naturally-variable series (unstable baseline)', () => {
      const res = build(series([5, 15, 10, 20]));
      expect(res.some(x => /Rincaro/.test(x.title))).toBe(false);
    });
  });

  // #43 — Payday effect
  describe('payday effect', () => {
    const paycheck = tx({ type: 'income', amount: 2000, description: 'Stipendio', recurring: { freq: 'monthly' }, date: '2026-05-27' });
    it('flags spending clustered right after payday', () => {
      const txs = [
        paycheck,
        // window [27, end]: heavy; rest of month: light
        tx({ amount: 300, date: '2026-03-28' }), tx({ amount: 100, date: '2026-03-05' }),
        tx({ amount: 300, date: '2026-04-28' }), tx({ amount: 100, date: '2026-04-05' }),
        tx({ amount: 300, date: '2026-05-28' }), tx({ amount: 100, date: '2026-05-05' }),
      ];
      const res = build(txs);
      const i = res.find(x => /Effetto stipendio/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('neutral');
    });
    it('stays silent when spending is spread through the month', () => {
      const txs = [
        paycheck,
        tx({ amount: 100, date: '2026-03-05' }), tx({ amount: 100, date: '2026-03-12' }), tx({ amount: 100, date: '2026-03-19' }),
        tx({ amount: 100, date: '2026-04-05' }), tx({ amount: 100, date: '2026-04-12' }), tx({ amount: 100, date: '2026-04-19' }),
        tx({ amount: 100, date: '2026-05-05' }), tx({ amount: 100, date: '2026-05-12' }), tx({ amount: 100, date: '2026-05-19' }),
      ];
      const res = build(txs);
      expect(res.some(x => /Effetto stipendio/.test(x.title))).toBe(false);
    });
  });

  // #44 — Month front-loading
  describe('front-loading', () => {
    // Historically spend lands late (day 25); only €100 by day 15 of a €1000 month.
    const lateSpenders: Transaction[] = [
      tx({ amount: 100, date: '2026-03-05' }), tx({ amount: 900, date: '2026-03-25' }),
      tx({ amount: 100, date: '2026-04-05' }), tx({ amount: 900, date: '2026-04-25' }),
      tx({ amount: 100, date: '2026-05-05' }), tx({ amount: 900, date: '2026-05-25' }),
    ];
    it('warns when this month is well ahead of the usual cumulative pace', () => {
      const res = build(lateSpenders, { monthlyExpenses: 200 }); // usual-by-day-15 ≈ €100
      const i = res.find(x => /Spese in anticipo sul mese/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('caution');
    });
    it('stays silent when spending is in line with the usual pace', () => {
      const res = build(lateSpenders, { monthlyExpenses: 100 });
      expect(res.some(x => /Spese in anticipo sul mese/.test(x.title))).toBe(false);
    });
  });
});

describe('buildInsights — FASE 4 admin insights', () => {
  const expCat = (id: string): import('../../types').CategoryDef =>
    ({ id, label: id, icon: '•', color: '#888888', kind: 'expense' });
  const build = (txs: Transaction[], over: Partial<Parameters<typeof buildInsights>[0]> = {}) =>
    buildInsights({
      transactions: txs, monthlyIncome: 0, monthlyExpenses: 0, monthlyInvestments: 0,
      getCat: cat, now: NOW, ...over,
    });

  // #45 — Unpredictable categories (sparse / irregular)
  describe('unpredictable categories', () => {
    // 'regali' appears in only 3 of the last 12 months → flagged as irregular.
    const rare: Transaction[] = [
      tx({ amount: 40, date: '2025-08-12', category: 'regali' }),
      tx({ amount: 200, date: '2026-02-09', category: 'regali' }),
      tx({ amount: 30, date: '2026-06-05', category: 'regali' }),
    ];
    it('flags rare/low-confidence categories for admins', () => {
      const res = build(rare, { isAdmin: true, forecastExpenseCategories: [expCat('regali')] });
      expect(res.some(x => /spesa imprevedibile/.test(x.title))).toBe(true);
    });
    it('stays hidden for non-admins', () => {
      const res = build(rare, { forecastExpenseCategories: [expCat('regali')] });
      expect(res.some(x => /spesa imprevedibile/.test(x.title))).toBe(false);
    });
  });

  // #46 — Budget adherence streak
  describe('budget adherence', () => {
    const onBudget: Transaction[] = [
      tx({ amount: 300, date: '2026-03-10' }),
      tx({ amount: 300, date: '2026-04-10' }),
      tx({ amount: 300, date: '2026-05-10' }),
    ];
    it('celebrates a streak of months within budget (admin)', () => {
      const res = build(onBudget, { isAdmin: true, budgets: { spesa: 500 } });
      const i = res.find(x => /entro il budget/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('positive');
    });
    it('stays silent when months are over budget', () => {
      const over = [
        tx({ amount: 600, date: '2026-03-10' }),
        tx({ amount: 600, date: '2026-04-10' }),
        tx({ amount: 600, date: '2026-05-10' }),
      ];
      const res = build(over, { isAdmin: true, budgets: { spesa: 500 } });
      expect(res.some(x => /entro il budget/.test(x.title))).toBe(false);
    });
    it('stays hidden for non-admins', () => {
      const res = build(onBudget, { budgets: { spesa: 500 } });
      expect(res.some(x => /entro il budget/.test(x.title))).toBe(false);
    });
  });

  // #47 — Robust category anomaly (MAD); replaces #22 for admins
  describe('robust anomaly', () => {
    const spike: Transaction[] = [
      tx({ amount: 100, date: '2026-01-10' }), tx({ amount: 120, date: '2026-02-10' }),
      tx({ amount: 90, date: '2026-03-10' }), tx({ amount: 110, date: '2026-04-10' }),
      tx({ amount: 95, date: '2026-05-10' }),
      tx({ amount: 1000, date: '2026-06-05' }), // anomalous spike this month
    ];
    it('flags a category month outside the robust band (admin)', () => {
      const res = build(spike, { isAdmin: true });
      const i = res.find(x => /fuori norma/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('caution');
    });
    it('stays hidden for non-admins', () => {
      const res = build(spike);
      expect(res.some(x => /fuori norma/.test(x.title))).toBe(false);
    });
  });

  // #48 — Cash-flow timing risk
  describe('cash-flow timing', () => {
    const lateIncome: Transaction[] = [
      tx({ amount: 1000, date: '2026-03-03' }), tx({ type: 'income', amount: 1500, date: '2026-03-28' }),
      tx({ amount: 1000, date: '2026-04-03' }), tx({ type: 'income', amount: 1500, date: '2026-04-28' }),
      tx({ amount: 1000, date: '2026-05-03' }), tx({ type: 'income', amount: 1500, date: '2026-05-28' }),
    ];
    it('warns when expenses land before income (admin)', () => {
      const res = build(lateIncome, { isAdmin: true });
      const i = res.find(x => /anticipano le entrate/.test(x.title));
      expect(i).toBeDefined();
      expect(i!.tone).toBe('caution');
    });
    it('stays silent when income lands first', () => {
      const earlyIncome = [
        tx({ type: 'income', amount: 1500, date: '2026-03-02' }), tx({ amount: 1000, date: '2026-03-20' }),
        tx({ type: 'income', amount: 1500, date: '2026-04-02' }), tx({ amount: 1000, date: '2026-04-20' }),
        tx({ type: 'income', amount: 1500, date: '2026-05-02' }), tx({ amount: 1000, date: '2026-05-20' }),
      ];
      const res = build(earlyIncome, { isAdmin: true });
      expect(res.some(x => /anticipano le entrate/.test(x.title))).toBe(false);
    });
    it('stays hidden for non-admins', () => {
      const res = build(lateIncome);
      expect(res.some(x => /anticipano le entrate/.test(x.title))).toBe(false);
    });
  });
});
