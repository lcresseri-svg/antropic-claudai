import { describe, it, expect } from 'vitest';
import { Transaction } from '../../types';
import { buildCommitmentEvents, addDaysISO } from './commitmentProjection';
import { buildCommitments } from './commitments';
import { computeAvailableCash } from './availableCash';

const TODAY = '2026-07-10';
const NOW = new Date(`${TODAY}T12:00:00Z`);

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-07-01', description: 'x', amount: 0,
  type: 'expense', category: 'spesa', account: 'cc', ...over,
});

// Dataset che esercita tutte e tre le sorgenti: template attivo, occorrenze
// proiettate, una-tantum futura — più una spesa CONDIVISA (importo pieno 100,
// quota propria 40) che è l'unico punto in cui le due somme divergono.
const fixture: Transaction[] = [
  tx({ id: 'rent', seriesId: 'rent', date: '2026-07-15', description: 'Affitto', amount: 700,
    recurring: { freq: 'monthly' } }),
  tx({ id: 'gym', seriesId: 'gym', date: '2026-07-14', description: 'Palestra', amount: 100,
    shared: 60, recurring: { freq: 'weekly' } }),
  tx({ date: '2026-07-20', description: 'Assicurazione', amount: 150 }),
  // Serie conclusa e movimenti non-spesa: fuori da entrambe le viste.
  tx({ id: 'old', seriesId: 'old', date: '2026-07-13', description: 'Vecchio abbonamento', amount: 30,
    recurring: { freq: 'monthly', until: '2026-06-30' } }),
  tx({ date: '2026-07-12', type: 'transfer', description: 'Giroconto', amount: 400, toAccount: 'risp' }),
  tx({ id: 'sal', seriesId: 'sal', date: '2026-07-31', description: 'Stipendio', amount: 2000,
    type: 'income', recurring: { freq: 'monthly' } }),
];

describe('buildCommitmentEvents', () => {
  const events = buildCommitmentEvents(fixture, TODAY, addDaysISO(TODAY, 30));

  it('espone l\'importo pieno e il flag shared (la quota la applica chi somma)', () => {
    const palestra = events.filter(e => e.description === 'Palestra');
    expect(palestra.length).toBeGreaterThan(0);
    expect(palestra.every(e => e.amount === 100 && e.shared)).toBe(true);
    expect(events.find(e => e.description === 'Affitto')!.shared).toBe(false);
  });

  it('classifica ricorrenti e pianificate, esclude trasferimenti, entrate e serie concluse', () => {
    expect(events.find(e => e.description === 'Assicurazione')!.kind).toBe('pianificata');
    expect(events.find(e => e.description === 'Affitto')!.kind).toBe('ricorrente');
    for (const fuori of ['Giroconto', 'Stipendio', 'Vecchio abbonamento']) {
      expect(events.some(e => e.description === fuori)).toBe(false);
    }
  });

  it('deduplica la stessa occorrenza (serie + data) anche con template doppi', () => {
    const doppio: Transaction[] = [
      tx({ id: 'a', seriesId: 'net', date: '2026-07-20', description: 'Internet', amount: 30, recurring: { freq: 'monthly' } }),
      tx({ id: 'b', seriesId: 'net', date: '2026-07-20', description: 'Internet', amount: 30, recurring: { freq: 'monthly' } }),
    ];
    const e = buildCommitmentEvents(doppio, TODAY, addDaysISO(TODAY, 30));
    expect(e.filter(x => x.date === '2026-07-20')).toHaveLength(1);
  });

  it('Impegni e Liquidità disponibile vedono LA STESSA lista di eventi', () => {
    const c = buildCommitments(fixture, TODAY);
    const cash = computeAvailableCash({
      transactions: fixture, liquidity: 5000, horizon: 30, reserve: 0, now: NOW,
    });
    const key = (x: { date: string; description: string }) => `${x.date}|${x.description}`;

    expect(c.upcoming.map(key)).toEqual(events.map(key));
    expect(cash.committedItems.map(key)).toEqual(events.map(key));

    // Stessi eventi, somme diverse: importo pieno vs quota propria. La differenza
    // è esattamente la quota altrui (60 €) di ogni occorrenza condivisa.
    const shared = events.filter(e => e.shared).length;
    const full = events.reduce((s, e) => s + e.amount, 0);
    expect(c.upcoming.reduce((s, u) => s + u.amount, 0)).toBe(full);
    expect(cash.committed).toBe(full - shared * 60);
  });
});
