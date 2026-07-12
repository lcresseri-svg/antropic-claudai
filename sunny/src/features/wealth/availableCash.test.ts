import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import { computeAvailableCash, medianMonthlyExpenses } from './availableCash';

const NOW = new Date('2026-07-10T12:00:00Z');

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-07-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

describe('computeAvailableCash', () => {
  it('disponibile = liquidità − impegni − riserva', () => {
    const txs: Transaction[] = [
      // Affitto ricorrente: template con prossima occorrenza il 15/07.
      tx({ id: 'rent', date: '2026-07-15', description: 'Affitto', amount: 700, recurring: { freq: 'monthly' } }),
      // Una tantum pianificata dentro i 14 giorni.
      tx({ date: '2026-07-20', description: 'Assicurazione', amount: 150 }),
      // Fuori orizzonte (14 gg → fino al 24/07).
      tx({ date: '2026-07-28', description: 'Dentista', amount: 300 }),
    ];
    const r = computeAvailableCash({ transactions: txs, liquidity: 2000, horizon: 14, reserve: 500, now: NOW });
    expect(r.horizonEndISO).toBe('2026-07-24');
    expect(r.committed).toBe(850); // 700 + 150
    expect(r.available).toBe(650); // 2000 − 850 − 500
    expect(r.explanation.length).toBeGreaterThanOrEqual(4);
  });

  it('never double-counts: materialized instance + template advanced past it', () => {
    const txs: Transaction[] = [
      // Occorrenza già materializzata (passata) della serie.
      tx({ date: '2026-07-05', description: 'Palestra', amount: 50, seriesId: 'gym' }),
      // Template già avanzato alla prossima occorrenza.
      tx({ id: 'gym', seriesId: 'gym', date: '2026-08-05', description: 'Palestra', amount: 50, recurring: { freq: 'monthly' } }),
    ];
    const r = computeAvailableCash({ transactions: txs, liquidity: 1000, horizon: 30, reserve: 0, now: NOW });
    // Solo l'occorrenza del 05/08 (dentro 30 gg) — quella passata è già nel saldo.
    expect(r.committedItems).toHaveLength(1);
    expect(r.committedItems[0].date).toBe('2026-08-05');
  });

  it('excludes transfers, ended series and counts own share only', () => {
    const txs: Transaction[] = [
      tx({ date: '2026-07-12', type: 'transfer', description: 'Giroconto', amount: 400, toAccount: 'risp' }),
      tx({ id: 'old', date: '2026-07-13', description: 'Vecchio abbonamento', amount: 30, recurring: { freq: 'monthly', until: '2026-06-30' } }),
      tx({ date: '2026-07-14', description: 'Cena condivisa', amount: 100, shared: 60 }),
    ];
    const r = computeAvailableCash({ transactions: txs, liquidity: 1000, horizon: 7, reserve: 0, now: NOW });
    expect(r.committed).toBe(40); // solo quota propria della cena
  });

  it('eom horizon stops at month end and monthly recurring within it counts', () => {
    const txs: Transaction[] = [
      tx({ id: 'net', date: '2026-07-25', description: 'Internet', amount: 30, recurring: { freq: 'monthly' } }),
      tx({ date: '2026-08-02', description: 'Fuori mese', amount: 99 }),
    ];
    const r = computeAvailableCash({ transactions: txs, liquidity: 500, horizon: 'eom', reserve: 100, now: NOW });
    expect(r.horizonEndISO).toBe('2026-07-31');
    expect(r.committed).toBe(30);
    expect(r.available).toBe(370);
  });

  it('weekly series inside the horizon counts every occurrence once', () => {
    const txs: Transaction[] = [
      tx({ id: 'w', date: '2026-07-12', description: 'Settimanale', amount: 10, recurring: { freq: 'weekly' } }),
    ];
    const r = computeAvailableCash({ transactions: txs, liquidity: 500, horizon: 30, reserve: 0, now: NOW });
    // 12, 19, 26 lug + 2, 9 ago (orizzonte 09/08) = 5 occorrenze
    expect(r.committedItems).toHaveLength(5);
    expect(r.committed).toBe(50);
  });
});

describe('medianMonthlyExpenses / autonomia', () => {
  it('uses complete months only and reports months of autonomy', () => {
    const txs: Transaction[] = [
      tx({ date: '2026-04-10', amount: 900 }),
      tx({ date: '2026-05-10', amount: 1000 }),
      tx({ date: '2026-06-10', amount: 1100 }),
      tx({ date: '2026-07-05', amount: 5000 }), // mese corrente: escluso
    ];
    expect(medianMonthlyExpenses(txs, '2026-07-10')).toBe(1000);
    const r = computeAvailableCash({ transactions: txs, liquidity: 3000, horizon: 7, reserve: 0, now: NOW });
    expect(r.monthsOfAutonomy).toBe(3);
  });

  it('returns null autonomy without history', () => {
    const r = computeAvailableCash({ transactions: [], liquidity: 3000, horizon: 7, reserve: 0, now: NOW });
    expect(r.monthsOfAutonomy).toBeNull();
  });
});
