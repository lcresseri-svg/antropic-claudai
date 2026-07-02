import { describe, it, expect } from 'vitest';
import { detectSeasonalExpensesV4 } from './forecastSeasonalityV4';
import { Transaction } from '../../../types';

function mkTx(date: string, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    date, description: 'Assicurazione auto', amount,
    type: 'expense', category: 'assicurazioni', account: 'cc', ...extra,
  };
}

const labelOf = (id: string) => (id === 'assicurazioni' ? 'Assicurazioni' : id);

const baseInput = {
  targetMonthIndex: 1,          // February (0-based)
  targetYear: 2026,
  targetMonthKey: '2026-02',
  snapshotISO: '2026-02-01',
  labelOf,
  plannedRemaining: {} as Record<string, number>,
  recurringRemaining: {} as Record<string, number>,
  spentToDate: {} as Record<string, number>,
};

describe('detectSeasonalExpensesV4 — insurance February', () => {
  it('predicts ~875 from two similar February occurrences (870, 880) with high confidence', () => {
    const txs = [
      mkTx('2024-02-10', 870),
      mkTx('2025-02-12', 880),
    ];
    const candidates = detectSeasonalExpensesV4({ ...baseInput, transactions: txs });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].categoryId).toBe('assicurazioni');
    expect(candidates[0].confidence).toBe('high');
    expect(candidates[0].expectedAmount).toBe(875);
    expect(candidates[0].expectedMonth).toBe(1);
    expect(candidates[0].sourceMonths).toEqual(['2025-02', '2024-02']);
  });

  it('does NOT duplicate when a similar planned manual expense already exists', () => {
    const txs = [mkTx('2024-02-10', 870), mkTx('2025-02-12', 880)];
    const candidates = detectSeasonalExpensesV4({
      ...baseInput, transactions: txs,
      plannedRemaining: { assicurazioni: 880 },
    });
    expect(candidates).toHaveLength(0);
  });

  it('does NOT duplicate when a similar recurring remaining already exists', () => {
    const txs = [mkTx('2024-02-10', 870), mkTx('2025-02-12', 880)];
    const candidates = detectSeasonalExpensesV4({
      ...baseInput, transactions: txs,
      recurringRemaining: { assicurazioni: 870 },
    });
    expect(candidates).toHaveLength(0);
  });

  it('does NOT fire when a similar amount already spent this month', () => {
    const txs = [mkTx('2024-02-10', 870), mkTx('2025-02-12', 880)];
    const candidates = detectSeasonalExpensesV4({
      ...baseInput, transactions: txs,
      spentToDate: { assicurazioni: 875 },
    });
    expect(candidates).toHaveLength(0);
  });

  it('subtracts a PARTIAL large payment already made this month (remaining only)', () => {
    const txs = [
      mkTx('2024-02-10', 870),
      mkTx('2025-02-12', 880),
      mkTx('2026-02-03', 400), // first tranche, on/before the snapshot
    ];
    const candidates = detectSeasonalExpensesV4({
      ...baseInput, transactions: txs,
      snapshotISO: '2026-02-05',
      spentToDate: { assicurazioni: 400 },
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].expectedAmount).toBe(475);      // 875 − 400
    expect(candidates[0].expectedAmountFull).toBe(875);  // kept for tail matching
  });

  it('skips entirely when the large payment this month is already similar to the full amount', () => {
    const txs = [
      mkTx('2024-02-10', 870),
      mkTx('2025-02-12', 880),
      mkTx('2026-02-03', 850),
    ];
    // spentToDate deliberately empty: this exercises the large-payment guard
    // itself, not the aggregate spent-similar one.
    const candidates = detectSeasonalExpensesV4({
      ...baseInput, transactions: txs,
      snapshotISO: '2026-02-05',
    });
    expect(candidates).toHaveLength(0);
  });

  it('single occurrence → medium confidence only when the category looks seasonal', () => {
    const txs = [mkTx('2025-02-12', 880)];
    const candidates = detectSeasonalExpensesV4({ ...baseInput, transactions: txs });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].confidence).toBe('medium');
    expect(candidates[0].expectedAmount).toBe(880);
  });

  it('ignores everyday categories with many small transactions (no single tx ≥ 300)', () => {
    const groceries = [
      ...Array.from({ length: 8 }, (_, i) => mkTx(`2024-02-0${(i % 9) + 1}`, 50, { category: 'spesa', description: 'Esselunga' })),
      ...Array.from({ length: 8 }, (_, i) => mkTx(`2025-02-0${(i % 9) + 1}`, 50, { category: 'spesa', description: 'Esselunga' })),
    ];
    const candidates = detectSeasonalExpensesV4({ ...baseInput, transactions: groceries, labelOf: (id) => id });
    expect(candidates.find(c => c.categoryId === 'spesa')).toBeUndefined();
  });

  it('does not flag a single occurrence for a non-seasonal-looking category', () => {
    const txs = [mkTx('2025-02-12', 800, { category: 'acquisti' })];
    const candidates = detectSeasonalExpensesV4({
      ...baseInput, transactions: txs, labelOf: (id) => (id === 'acquisti' ? 'Acquisti' : id),
    });
    expect(candidates).toHaveLength(0);
  });
});
