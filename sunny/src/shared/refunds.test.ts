import { describe, it, expect } from 'vitest';
import {
  isRefund, buildRefundIndex, applyRefunds, refundsFor, summarizeRefunds, refundableExpenses,
} from './refunds';
import { Transaction, ownShare, grossOwnShare } from '../types';
import { aggregateFlow, accountDelta, liquidityDelta, netFlowDelta } from './financialFlow';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), date: '2026-06-10', description: '', amount: 0,
  type: 'expense', category: 'spesa', account: 'conto', ...over,
});

// Spesa di 100 a giugno, storno di 30 incassato a LUGLIO (mese successivo).
const SPESA = tx({ id: 'e1', amount: 100, date: '2026-06-10', category: 'shopping' });
const STORNO = tx({ id: 'r1', type: 'refund', amount: 30, date: '2026-07-05', refundOf: 'e1', category: 'shopping' });

describe('indice storni', () => {
  it('somma gli storni per spesa', () => {
    const idx = buildRefundIndex([SPESA, STORNO, tx({ type: 'refund', amount: 20, refundOf: 'e1' })]);
    expect(idx.get('e1')).toBe(50);
  });

  it('ignora le righe projected e gli storni con data futura', () => {
    const txs = [
      SPESA,
      tx({ type: 'refund', amount: 10, refundOf: 'e1', projected: true }),
      tx({ type: 'refund', amount: 15, refundOf: 'e1', date: '2026-09-01' }),
      STORNO,
    ];
    expect(buildRefundIndex(txs, '2026-07-31').get('e1')).toBe(30);
    // senza "oggi" nessun filtro sulle date future
    expect(buildRefundIndex(txs).get('e1')).toBe(45);
  });

  it('isRefund riconosce solo il tipo dedicato', () => {
    expect(isRefund(STORNO)).toBe(true);
    expect(isRefund(SPESA)).toBe(false);
    expect(isRefund(tx({ type: 'income' }))).toBe(false);
  });
});

describe('applyRefunds → spesa netta nelle statistiche', () => {
  it('annota refundedTotal sulla spesa e ownShare diventa netto', () => {
    const [spesa] = applyRefunds([SPESA, STORNO]);
    expect(spesa.refundedTotal).toBe(30);
    expect(ownShare(spesa)).toBe(70);        // statistiche: spesa netta
    expect(grossOwnShare(spesa)).toBe(100);  // cassa: importo pieno
    expect(spesa.amount).toBe(100);          // documento originale invariato
  });

  it('lo sconto cade nel mese della SPESA, non in quello dello storno', () => {
    const out = applyRefunds([SPESA, STORNO]);
    const giugno = out.filter(t => t.type === 'expense' && t.date.startsWith('2026-06'));
    expect(giugno.reduce((s, t) => s + ownShare(t), 0)).toBe(70);
    // lo storno di luglio non è una spesa e non riduce luglio
    expect(out.filter(t => t.type === 'expense' && t.date.startsWith('2026-07'))).toHaveLength(0);
  });

  it('si combina con la quota condivisa', () => {
    const cond = tx({ id: 'e2', amount: 100, shared: 40 });
    const [spesa] = applyRefunds([cond, tx({ type: 'refund', amount: 25, refundOf: 'e2' })]);
    expect(grossOwnShare(spesa)).toBe(60);   // 100 − 40 di quota altrui
    expect(ownShare(spesa)).toBe(35);        // − 25 di storno
  });

  it('non va mai sotto zero', () => {
    const [spesa] = applyRefunds([SPESA, tx({ type: 'refund', amount: 500, refundOf: 'e1' })]);
    expect(ownShare(spesa)).toBe(0);
  });

  it('senza storni restituisce l\'array originale (nessuna copia)', () => {
    const txs = [SPESA];
    expect(applyRefunds(txs)).toBe(txs);
  });
});

describe('cassa: la spesa resta intera, lo storno rientra alla sua data', () => {
  it('il conto scende di 100 a giugno e risale di 30 a luglio', () => {
    const [spesa, storno] = applyRefunds([SPESA, STORNO]);
    expect(accountDelta(spesa, 'conto')).toBe(-100);  // non −70: lo storico è reale
    expect(accountDelta(storno, 'conto')).toBe(30);
    expect(liquidityDelta(spesa) + liquidityDelta(storno)).toBe(-70);
  });

  it('lo storno accredita solo il conto scelto', () => {
    const s = tx({ type: 'refund', amount: 30, refundOf: 'e1', account: 'revolut' });
    expect(accountDelta(s, 'revolut')).toBe(30);
    expect(accountDelta(s, 'conto')).toBe(0);
  });

  it('nel flusso è un componente a sé, NON un\'entrata ordinaria', () => {
    const f = aggregateFlow(applyRefunds([SPESA, STORNO]));
    expect(f.ordinaryIncome).toBe(0);       // mai contato come entrata
    expect(f.refundsReceived).toBe(30);
    expect(f.expenses).toBe(100);           // spesa lorda: la cassa ha visto uscire 100
    expect(f.cashIn).toBe(30);
    expect(f.netFlow).toBe(-70);            // variazione reale della liquidità
  });

  it('il subtotale di lista quadra col flusso', () => {
    const txs = applyRefunds([SPESA, STORNO]);
    expect(txs.reduce((s, t) => s + netFlowDelta(t), 0)).toBe(-70);
  });
});

describe('summarizeRefunds (limiti e preview)', () => {
  it('calcola stornato, netto e residuo stornabile', () => {
    const r = summarizeRefunds(SPESA, [STORNO]);
    expect(r.gross).toBe(100);
    expect(r.refunded).toBe(30);
    expect(r.net).toBe(70);
    expect(r.remaining).toBe(70);
    expect(r.fullyRefunded).toBe(false);
  });

  it('riconosce la spesa stornata per intero', () => {
    const r = summarizeRefunds(SPESA, [tx({ type: 'refund', amount: 100, refundOf: 'e1' })]);
    expect(r.remaining).toBe(0);
    expect(r.fullyRefunded).toBe(true);
  });

  it('in modifica lo storno corrente non conta contro sé stesso', () => {
    const r = summarizeRefunds(SPESA, [STORNO], 'r1');
    expect(r.refunded).toBe(0);
    expect(r.remaining).toBe(100);
  });

  it('la base stornabile è al netto della quota altrui', () => {
    const cond = tx({ id: 'e2', amount: 100, shared: 40 });
    expect(summarizeRefunds(cond, []).remaining).toBe(60);
  });
});

describe('selezione della spesa da stornare', () => {
  it('elenca solo le spese con residuo, dalla più recente', () => {
    const vecchia = tx({ id: 'e0', amount: 50, date: '2026-05-01' });
    const piena = tx({ id: 'e3', amount: 80, date: '2026-06-20' });
    const list = refundableExpenses([
      SPESA, STORNO, vecchia, piena,
      tx({ type: 'refund', amount: 80, refundOf: 'e3' }),   // e3 già stornata del tutto
      tx({ id: 'i1', type: 'income', amount: 900 }),         // non è una spesa
      tx({ id: 'p1', amount: 10, projected: true }),         // occorrenza virtuale
    ]);
    expect(list.map(t => t.id)).toEqual(['e1', 'e0']);
  });

  it('refundsFor restituisce gli storni della spesa, dal più recente', () => {
    const vecchio = tx({ id: 'r0', type: 'refund', amount: 5, date: '2026-06-15', refundOf: 'e1' });
    expect(refundsFor([SPESA, STORNO, vecchio], 'e1').map(t => t.id)).toEqual(['r1', 'r0']);
  });
});

// ── Integrazione con gli aggregatori reali ─────────────────────────────────
// Non ri-testano quei moduli: verificano che, passando dal solo `applyRefunds`,
// la spesa netta arrivi davvero fino a categorie / budget / statistiche senza
// che nessuno di loro conosca gli storni.
describe('integrazione: la spesa netta arriva agli aggregatori', () => {
  const txs = applyRefunds([SPESA, STORNO]);

  it('categorie: il totale di giugno è netto', async () => {
    const { aggregateCategorySpending, getPeriodRange, getPreviousPeriodRange } =
      await import('../features/dashboard/categoryAnalytics');
    const now = new Date(2026, 5, 30);
    const agg = aggregateCategorySpending(txs, getPeriodRange('1m', 0, now), getPreviousPeriodRange('1m', 0, now), { now });
    expect(agg.total).toBe(70);
    expect(agg.categories.find(c => c.categoryId === 'shopping')?.amount).toBe(70);
  });

  it('aggregati mensili: spese e categoria del mese della spesa sono nette', async () => {
    const { buildMonthlyAggregates } = await import('./monthlyAggregates');
    const giugno = buildMonthlyAggregates(txs, '2026-08').months.find(m => m.month === '2026-06');
    expect(giugno?.expenses).toBe(70);
    expect(giugno?.expensesByCategory.shopping).toBe(70);
  });

  it('lo storno non compare come entrata in nessun mese', async () => {
    const { buildMonthlyAggregates } = await import('./monthlyAggregates');
    const months = buildMonthlyAggregates(txs, '2026-08').months;
    expect(months.reduce((s, m) => s + m.income, 0)).toBe(0);
    // e luglio (mese dello storno) non ha spese negative inventate
    expect(months.find(m => m.month === '2026-07')?.expenses ?? 0).toBe(0);
  });
});
