import { describe, it, expect } from 'vitest';
import {
  buildInvestmentDeposit, buildInvestmentWithdrawal,
  plusMinusLatente, isStaleValue, investmentValueDeltas,
} from './investmentTransactionBuilder';
import { Transaction, ownShare, investSign } from '../../types';

/** Net cash credited to an account by a set of transactions (mirrors useTransactions). */
function creditedTo(account: string, txs: Omit<Transaction, 'id'>[]): number {
  let bal = 0;
  for (const t of txs) {
    if (!t.account || t.account !== account) continue;
    if (t.type === 'income') bal += t.amount;
    else if (t.type === 'investment') bal -= investSign(t as Transaction) * t.amount;
    else if (t.type === 'expense') bal -= ownShare(t as Transaction);
  }
  return Math.round(bal * 100) / 100;
}

const base = {
  category: 'azioni_etf', categoryLabel: 'Azioni / ETF',
  toAccount: 'conto_corrente', date: '2026-06-12',
};

describe('buildInvestmentWithdrawal', () => {
  it('plusvalenza: genera income __plusvalenza__ corretta', () => {
    // versato 1000, controvalore 1500, prelevo 300 → quota 0.2,
    // capitale rimborsato 200, plus 100
    const r = buildInvestmentWithdrawal({ ...base, amount: 300, currentValue: 1500, deposited: 1000 });
    expect(r.quota).toBeCloseTo(0.2);
    expect(r.capitaleRimborsato).toBe(200);
    expect(r.plusMinus).toBe(100);
    const out = r.transactions.find(t => t.type === 'investment')!;
    expect(out.direction).toBe('out');
    expect(out.amount).toBe(200);
    const plus = r.transactions.find(t => t.type === 'income')!;
    expect(plus.category).toBe('__plusvalenza__');
    expect(plus.amount).toBe(100);
    expect(plus.account).toBe('conto_corrente');
    expect(r.transactions.every(t => t.groupId === out.groupId)).toBe(true);
  });

  it('in pari: solo investment out, nessuna plus/minus', () => {
    const r = buildInvestmentWithdrawal({ ...base, amount: 300, currentValue: 1000, deposited: 1000 });
    expect(r.plusMinus).toBe(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].type).toBe('investment');
    expect(r.transactions[0].amount).toBe(300);
  });

  it('minusvalenza: genera expense __minusvalenza__', () => {
    // versato 1000, controvalore 800, prelevo 400 → quota 0.5,
    // capitale rimborsato 500, minus −100
    const r = buildInvestmentWithdrawal({ ...base, amount: 400, currentValue: 800, deposited: 1000 });
    expect(r.capitaleRimborsato).toBe(500);
    expect(r.plusMinus).toBe(-100);
    const minus = r.transactions.find(t => t.type === 'expense')!;
    expect(minus.category).toBe('__minusvalenza__');
    expect(minus.amount).toBe(100);
  });

  it('parziale: quota proporzionale e nuovo controvalore', () => {
    const r = buildInvestmentWithdrawal({ ...base, amount: 750, currentValue: 3000, deposited: 2000 });
    expect(r.quota).toBe(0.25);
    expect(r.capitaleRimborsato).toBe(500);
    expect(r.newCurrentValue).toBe(2250);
  });

  it('liquidazione totale: quota cap a 1, capitale rimborsato = versato', () => {
    const r = buildInvestmentWithdrawal({ ...base, amount: 1500, currentValue: 1500, deposited: 1000 });
    expect(r.quota).toBe(1);
    expect(r.capitaleRimborsato).toBe(1000);
    expect(r.plusMinus).toBe(500);
    expect(r.newCurrentValue).toBe(0);
  });

  it('INVARIANTE: netto accreditato sul conto = importo − commissioni (plus, pari, minus)', () => {
    const cases = [
      { amount: 300, currentValue: 1500, deposited: 1000, fee: 5 },   // plus
      { amount: 300, currentValue: 1000, deposited: 1000, fee: 5 },   // pari
      { amount: 400, currentValue: 800,  deposited: 1000, fee: 5 },   // minus
      { amount: 400, currentValue: 800,  deposited: 1000 },           // minus, no fee
      { amount: 123.45, currentValue: 987.65, deposited: 876.54, fee: 1.99 }, // cents
    ];
    for (const c of cases) {
      const r = buildInvestmentWithdrawal({ ...base, ...c });
      expect(creditedTo('conto_corrente', r.transactions))
        .toBeCloseTo(c.amount - (c.fee ?? 0), 2);
    }
  });

  it('commissione su conto diverso: il conto destinazione riceve l\'intero importo', () => {
    const r = buildInvestmentWithdrawal({ ...base, amount: 300, currentValue: 1500, deposited: 1000, fee: 5, feeAccount: 'carta_credito' });
    expect(creditedTo('conto_corrente', r.transactions)).toBeCloseTo(300, 2);
    expect(creditedTo('carta_credito', r.transactions)).toBeCloseTo(-5, 2);
  });
});

describe('buildInvestmentDeposit', () => {
  it('genera direction in, con commissione collegata via groupId', () => {
    const txs = buildInvestmentDeposit({
      category: 'azioni_etf', amount: 500, date: '2026-06-12',
      account: 'conto_corrente', fee: 3, categoryLabel: 'Azioni / ETF',
    });
    expect(txs).toHaveLength(2);
    expect(txs[0].direction).toBe('in');
    expect(txs[0].groupId).toBeDefined();
    expect(txs[1].type).toBe('expense');
    expect(txs[1].groupId).toBe(txs[0].groupId);
    expect(creditedTo('conto_corrente', txs)).toBeCloseTo(-503, 2);
  });

  it('senza conto: nessuna commissione, nessun impatto sui saldi', () => {
    const txs = buildInvestmentDeposit({
      category: 'fondi', amount: 200, date: '2026-06-12', account: '', fee: 3, tfr: 250,
    });
    expect(txs).toHaveLength(1);
    expect(txs[0].tfr).toBe(200); // TFR cap all'importo
    expect(creditedTo('', txs)).toBe(0); // account '' filtered by creditedTo guard anyway
  });
});

describe('plusMinusLatente', () => {
  it('currentValue assente → null', () => {
    expect(plusMinusLatente(1000, undefined)).toBeNull();
  });
  it('calcola controvalore − versato', () => {
    expect(plusMinusLatente(1000, 1250)).toBe(250);
    expect(plusMinusLatente(1000, 800)).toBe(-200);
  });
});

describe('isStaleValue', () => {
  const now = new Date('2026-06-12');
  it('mai aggiornato → stale', () => expect(isStaleValue(undefined, now)).toBe(true));
  it('29 giorni → fresco', () => expect(isStaleValue('2026-05-15', now)).toBe(false));
  it('31 giorni → stale', () => expect(isStaleValue('2026-05-11', now)).toBe(true));
});

describe('investmentValueDeltas', () => {
  it('un versamento → delta = importo (la commissione/expense è ignorata)', () => {
    const txs = buildInvestmentDeposit({ category: 'etf', amount: 200, date: '2026-06-10', account: 'cc', fee: 5 });
    expect(investmentValueDeltas(txs)).toEqual({ etf: 200 });
  });
  it('più occorrenze (PAC) sulla stessa categoria → somma', () => {
    const txs = [
      buildInvestmentDeposit({ category: 'etf', amount: 100, date: '2026-04-10', account: 'cc' })[0],
      buildInvestmentDeposit({ category: 'etf', amount: 100, date: '2026-05-10', account: 'cc' })[0],
      buildInvestmentDeposit({ category: 'etf', amount: 100, date: '2026-06-10', account: 'cc' })[0],
    ];
    expect(investmentValueDeltas(txs)).toEqual({ etf: 300 });
  });
  it('categorie distinte restano separate; un prelievo sottrae', () => {
    const txs = [
      buildInvestmentDeposit({ category: 'etf', amount: 200, date: '2026-06-10', account: 'cc' })[0],
      buildInvestmentDeposit({ category: 'fondo', amount: 50, date: '2026-06-10', account: 'cc' })[0],
      { type: 'investment' as const, direction: 'out' as const, description: 'x', amount: 80, date: '2026-06-11', category: 'etf', account: 'cc' },
    ];
    expect(investmentValueDeltas(txs)).toEqual({ etf: 120, fondo: 50 });
  });
  it('nessun investimento → {}', () => {
    expect(investmentValueDeltas([{ type: 'expense', description: 'x', amount: 10, date: '2026-06-10', category: 'altro', account: 'cc' }])).toEqual({});
  });
});
