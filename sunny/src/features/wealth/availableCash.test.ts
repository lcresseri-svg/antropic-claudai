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

  it("il deposito di sicurezza scende dalla liquidità libera della home", () => {
    // Forma esatta della chiamata della home: orizzonte fine mese, riserva
    // presa dalle impostazioni. Con deposito a 0 il numero è la sola
    // liquidità meno gli impegni — cioè il comportamento prima della feature.
    const txs: Transaction[] = [
      tx({ id: 'rent', date: '2026-07-28', description: 'Affitto', amount: 700, recurring: { freq: 'monthly' } }),
    ];
    const base = { transactions: txs, liquidity: 2000, horizon: 'eom' as const, now: NOW };

    const senza = computeAvailableCash({ ...base, reserve: 0 });
    expect(senza.committed).toBe(700);
    expect(senza.available).toBe(1300);
    expect(senza.reserve).toBe(0);

    const con = computeAvailableCash({ ...base, reserve: 500 });
    expect(con.committed).toBe(700);   // gli impegni non cambiano
    expect(con.available).toBe(800);   // 2000 − 700 − 500
    expect(con.reserve).toBe(500);
  });

  it('un deposito più grande della liquidità porta il disponibile sotto zero', () => {
    // Non è un errore da nascondere: dice che il cuscinetto che ti sei dato è
    // più di quello che hai, e va visto.
    const r = computeAvailableCash({
      transactions: [], liquidity: 300, horizon: 'eom', reserve: 1000, now: NOW,
    });
    expect(r.available).toBe(-700);
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

describe('scheduled investments in available cash', () => {
  const calculate = (transactions: Transaction[], accounts?: { id: string; excludeFromNetWorth?: boolean }[]) =>
    computeAvailableCash({ transactions, liquidity: 2000, horizon: 'eom', reserve: 100, now: NOW, accounts });
  const investment = (over: Partial<Transaction> = {}) => tx({
    id: 'pac', type: 'investment', date: '2026-07-15', amount: 250, ...over,
  });

  it('adds both recurring and one-off investments to expenses and reserve', () => {
    const r = calculate([
      investment({ recurring: { freq: 'monthly' } }),
      investment({ id: 'single', date: '2026-07-31', amount: 300 }),
      tx({ date: '2026-07-20', amount: 100, shared: 60 }),
    ]);
    expect(r.committed).toBe(590);
    expect(r.available).toBe(1310);
    expect(r.committedItems.map(i => i.amount)).toEqual([250, 40, 300]);
    expect(r.explanation.join(' ')).toContain('versamenti investimento');
  });

  it('counts all weekly installments once, including a duplicate template', () => {
    const template = investment({ date: '2026-07-12', seriesId: 'pac', recurring: { freq: 'weekly' } });
    const r = calculate([template, { ...template, id: 'duplicate' }]);
    expect(r.committedItems.map(i => i.date)).toEqual(['2026-07-12', '2026-07-19', '2026-07-26']);
    expect(r.committed).toBe(750);
  });

  it('subtracts only non-TFR cash and ignores external and fully TFR deposits', () => {
    const r = calculate([
      investment({ amount: 300, tfr: 100 }),
      investment({ id: 'external', account: '', amount: 400 }),
      investment({ id: 'tfr', tfr: 250 }),
      investment({ id: 'excess-tfr', tfr: 500 }),
    ]);
    expect(r.committed).toBe(200);
    expect(r.committedItems).toHaveLength(1);
  });

  it('respects excluded accounts and includes accounts without an exclusion setting', () => {
    const transactions = [investment(), investment({ id: 'other', account: 'other', amount: 100 })];
    expect(calculate(transactions, [{ id: 'cc', excludeFromNetWorth: true }]).committed).toBe(100);
    expect(calculate(transactions, [{ id: 'cc', excludeFromNetWorth: false }]).committed).toBe(350);
    expect(calculate(transactions).committed).toBe(350);
  });

  it('does not treat future withdrawals or income as spendable cash', () => {
    const r = calculate([
      investment(), investment({ id: 'withdrawal', direction: 'out', amount: 900 }),
      tx({ date: '2026-07-20', type: 'income', amount: 3000 }),
      tx({ date: '2026-07-20', type: 'transfer', amount: 500, toAccount: 'other' }),
    ]);
    expect(r.committed).toBe(250);
    expect(r.available).toBe(1650);
  });

  it('excludes past/today, out-of-month, expired series and synthetic input rows', () => {
    const r = calculate([
      investment({ id: 'past', date: '2026-07-09' }),
      investment({ id: 'today', date: '2026-07-10' }),
      investment({ id: 'august', date: '2026-08-01' }),
      investment({ id: 'expired', recurring: { freq: 'monthly', until: '2026-06-30' } }),
      investment({ id: 'synthetic', projected: true }),
      investment({ id: 'stale-template', date: '2026-06-10', recurring: { freq: 'monthly' } }),
    ]);
    expect(r.committed).toBe(0);
    expect(r.available).toBe(1900);
  });

  it('includes a stored future series instance even when its template has advanced', () => {
    const r = calculate([
      investment({ id: 'instance', seriesId: 'pac', amount: 175 }),
      investment({ id: 'template', seriesId: 'pac', date: '2026-08-15', recurring: { freq: 'monthly' } }),
    ]);
    expect(r.committed).toBe(175);
    expect(r.committedItems).toHaveLength(1);
  });

  it('prefers actual instance amount and account over duplicate generated occurrences', () => {
    const r = calculate([
      investment({ id: 'template', seriesId: 'pac', date: '2026-07-12', recurring: { freq: 'weekly' } }),
      investment({ id: 'edited', seriesId: 'pac', date: '2026-07-19', amount: 400, tfr: 50 }),
      investment({ id: 'external', seriesId: 'pac', date: '2026-07-26', account: '' }),
    ]);
    expect(r.committedItems.map(i => i.amount)).toEqual([250, 350]);
    expect(r.committed).toBe(600);
  });

  it('counts flexible intervals without changing their dates', () => {
    const r = calculate([investment({ date: '2026-07-12', recurring: { freq: 'weekly', mode: 'interval', interval: 2 } })]);
    expect(r.committedItems.map(i => i.date)).toEqual(['2026-07-12', '2026-07-26']);
    expect(r.committed).toBe(500);
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

  it('returns null autonomy without history, with a short reason', () => {
    const r = computeAvailableCash({ transactions: [], liquidity: 3000, horizon: 7, reserve: 0, now: NOW });
    expect(r.monthsOfAutonomy).toBeNull();
    expect(r.autonomyUnavailableReason).toBe('servono mesi completi di storico spese');
    expect(r.explanation[r.explanation.length - 1]).toContain('servono mesi completi di storico spese');
  });

  it('distinguishes "no history" from "history with no expenses of your own"', () => {
    // Mese completo con una sola spesa interamente a carico di altri: c'è storico,
    // ma la mediana delle uscite proprie è 0.
    const txs: Transaction[] = [tx({ date: '2026-06-10', amount: 100, shared: 100 })];
    const r = computeAvailableCash({ transactions: txs, liquidity: 3000, horizon: 7, reserve: 0, now: NOW });
    expect(r.monthsOfAutonomy).toBeNull();
    expect(r.autonomyUnavailableReason).toBe('nessuna uscita nei mesi completi di storico');
  });

  it('reports no reason when autonomy is available', () => {
    const txs: Transaction[] = [tx({ date: '2026-06-10', amount: 1000 })];
    const r = computeAvailableCash({ transactions: txs, liquidity: 3000, horizon: 7, reserve: 0, now: NOW });
    expect(r.monthsOfAutonomy).toBe(3);
    expect(r.autonomyUnavailableReason).toBeNull();
  });
});
