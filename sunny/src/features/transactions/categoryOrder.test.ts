import { describe, it, expect } from 'vitest';
import { CategoryDef, Transaction, TransactionType } from '../../types';
import {
  scoreCategoryUsage,
  orderCategoriesByUsage,
  USAGE_MIN_TRANSACTIONS,
} from './categoryOrder';

const TODAY = '2026-08-25';
const DAY_MS = 86_400_000;

/** Data ISO di `days` giorni fa (negativo = nel futuro). */
const iso = (days: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10);

const cat = (id: string, kind: TransactionType = 'expense'): CategoryDef =>
  ({ id, label: id, icon: '🏷️', color: '#8A9270', kind });

let n = 0;
const tx = (category: string, days: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, date: iso(days), description: 'x', amount: 10,
  type: 'expense', category, account: 'cc', ...over,
});

/** `count` transazioni identiche sulla stessa categoria e alla stessa distanza. */
const many = (count: number, category: string, days: number, over: Partial<Transaction> = {}) =>
  Array.from({ length: count }, () => tx(category, days, over));

const ids = (cs: CategoryDef[]) => cs.map(c => c.id);

describe('scoreCategoryUsage / orderCategoriesByUsage', () => {
  it('dieci usi di due mesi fa battono due usi di ieri', () => {
    const cats = [cat('ieri'), cat('vecchia')];
    const txs = [...many(10, 'vecchia', 60), ...many(2, 'ieri', 1)];

    const scores = scoreCategoryUsage(txs, 'expense', TODAY);
    // Due emivite intere: 10 × 0,25 = 2,5 contro 2 × 0,977 = 1,95.
    expect(scores.get('vecchia')).toBeCloseTo(2.5, 6);
    expect(scores.get('ieri')).toBeCloseTo(1.954, 3);

    expect(ids(orderCategoriesByUsage(cats, txs, 'expense', TODAY))).toEqual(['vecchia', 'ieri']);
  });

  it('un uso di ieri batte dieci usi fuori dalla finestra dei 180 giorni', () => {
    const cats = [cat('vecchia'), cat('ieri'), cat('riempitivo')];
    const txs = [
      ...many(10, 'vecchia', 240),   // otto mesi fa: non entrano nemmeno nel conteggio
      ...many(1, 'ieri', 1),
      ...many(9, 'riempitivo', 90),  // serve solo a superare il cold start
    ];

    const scores = scoreCategoryUsage(txs, 'expense', TODAY);
    expect(scores.get('vecchia')).toBeUndefined();
    expect(scores.get('ieri')).toBeGreaterThan(0);

    // Dieci usi di otto mesi fa non valgono un uso di ieri: la categoria
    // fuori finestra chiude la fila anche se era prima nell'ordine manuale.
    expect(ids(orderCategoriesByUsage(cats, txs, 'expense', TODAY)))
      .toEqual(['riempitivo', 'ieri', 'vecchia']);
  });

  it('a parità di punteggio conserva l\'ordine manuale', () => {
    // 'mai1'/'mai2' non sono mai state usate (score 0), 'usata1'/'usata2' hanno
    // esattamente la stessa storia. L'ordine manuale le mette tutte al
    // contrario: solo il punteggio può spostarle, e solo fra tier diversi.
    const cats = [cat('mai1'), cat('mai2'), cat('usata1'), cat('usata2')];
    const ages = [3, 10, 20, 40, 70];
    const txs = [
      ...ages.map(d => tx('usata1', d)),
      ...ages.map(d => tx('usata2', d)),
    ];

    const scores = scoreCategoryUsage(txs, 'expense', TODAY);
    expect(scores.get('usata1')).toBe(scores.get('usata2'));

    expect(ids(orderCategoriesByUsage(cats, txs, 'expense', TODAY)))
      .toEqual(['usata1', 'usata2', 'mai1', 'mai2']);
  });

  it('sotto le 10 transazioni qualificanti restituisce l\'array in ingresso', () => {
    const cats = [cat('a'), cat('b')];
    const nine = many(USAGE_MIN_TRANSACTIONS - 1, 'b', 5);

    const cold = orderCategoriesByUsage(cats, nine, 'expense', TODAY);
    expect(cold).toBe(cats);                 // stesso riferimento, nessuna copia
    expect(ids(cold)).toEqual(['a', 'b']);   // e quindi l'ordine manuale intatto

    // La decima transazione è ciò che sblocca il riordino: senza questa
    // asserzione il test sopra passerebbe anche se il punteggio fosse rotto.
    const warm = orderCategoriesByUsage(cats, [...nine, tx('b', 5)], 'expense', TODAY);
    expect(ids(warm)).toEqual(['b', 'a']);
  });

  it('previsti, proiezioni e template scaduti non contano', () => {
    const cats = [cat('fantasma'), cat('reale')];
    const txs = [
      ...many(10, 'reale', 10),
      tx('fantasma', -7),                     // previsto: documento datato nel futuro
      tx('fantasma', 10, { projected: true }), // proiezione: riga di sola vista
      // Template di una serie finita: `isPending` lo lascia passare, ma è
      // datato nel futuro e non è un movimento avvenuto.
      tx('fantasma', -30, { recurring: { freq: 'monthly', until: iso(30) } }),
    ];

    const scores = scoreCategoryUsage(txs, 'expense', TODAY);
    expect(scores.get('fantasma')).toBeUndefined();
    expect(scores.get('reale')).toBeGreaterThan(0);

    expect(ids(orderCategoriesByUsage(cats, txs, 'expense', TODAY))).toEqual(['reale', 'fantasma']);
  });

  it('un genere non contamina l\'altro', () => {
    // Stesso id di categoria su generi diversi: se il filtro per `kind` non
    // ci fosse, le entrate spingerebbero la spesa omonima in cima.
    const cats = [cat('condivisa'), cat('spesa')];
    const txs = [
      ...many(10, 'condivisa', 1, { type: 'income' }),
      ...many(10, 'spesa', 30),
    ];

    const spese = scoreCategoryUsage(txs, 'expense', TODAY);
    expect(spese.get('condivisa')).toBeUndefined();
    expect(spese.get('spesa')).toBeGreaterThan(0);

    const entrate = scoreCategoryUsage(txs, 'income', TODAY);
    expect(entrate.get('condivisa')).toBeGreaterThan(0);
    expect(entrate.get('spesa')).toBeUndefined();

    expect(ids(orderCategoriesByUsage(cats, txs, 'expense', TODAY))).toEqual(['spesa', 'condivisa']);
  });

  it('categorie vuote o storia vuota non rompono nulla', () => {
    const cats = [cat('a'), cat('b')];

    expect(scoreCategoryUsage([], 'expense', TODAY).size).toBe(0);
    expect(orderCategoriesByUsage([], [], 'expense', TODAY)).toEqual([]);
    expect(orderCategoriesByUsage(cats, [], 'expense', TODAY)).toBe(cats);
    // Nessuna categoria da ordinare, ma una storia che supererebbe il cold start.
    expect(orderCategoriesByUsage([], many(12, 'a', 5), 'expense', TODAY)).toEqual([]);
    // Documento con data sporca: scartato, non fa esplodere il punteggio.
    expect(scoreCategoryUsage([tx('a', 0, { date: '' })], 'expense', TODAY).size).toBe(0);
  });
});
