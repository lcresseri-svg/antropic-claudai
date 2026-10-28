import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  transactions: [] as Array<Record<string, unknown>>,
  accounts: [] as Array<Record<string, unknown>>,
  send: vi.fn(),
}));
vi.mock('../functions/src/shared', () => ({
  db: {
    doc: () => ({ get: async () => ({ data: () => ({ accounts: fixtures.accounts }) }) }),
    collection: () => {
      const query = (rows: typeof fixtures.transactions): unknown => ({
        where: (field: string, op: string, value: string) => query(rows.filter(row =>
          op === '>=' ? String(row[field]) >= value : op === '==' ? row[field] === value : String(row[field]) <= value)),
        get: async () => {
          const docs = rows.map(row => ({ id: row.id, data: () => row }));
          return { docs, forEach: (fn: (doc: typeof docs[number]) => void) => docs.forEach(fn) };
        },
      });
      return query(fixtures.transactions);
    },
  },
  usersWithReminder: async () => ['user'],
  sendToUser: fixtures.send,
  euro: (amount: number) => `${amount}€`,
  addPeriod: (date:string) => { const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);return next.toISOString().slice(0,10); },
  todayRomeISO: () => new Date().toISOString().slice(0, 10), verifyBearer: vi.fn(), ALLOWED_ORIGINS: [],
}));

import { sendMonthlySummary, remindMonthEnd } from '../functions/src/notifications';

const purchase = { id: 'purchase', date: '2026-10-10', type: 'expense', amount: 100, account: 'card', description: 'Purchase', category: 'food' };
const policy = { fromMonth: '2026-10', enabled: true, paymentDay: 10, paymentAccountId: 'bank' };
const runSummary = () => sendMonthlySummary.run({ scheduleTime: new Date().toISOString() });

describe('monthly notification credit-card cash flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
    fixtures.send.mockClear();
    fixtures.accounts = [{ id: 'card', label: 'Visa', creditCardPolicies: [policy] }, { id: 'bank' }];
    fixtures.transactions = [purchase, { ...purchase, id: 'salary', type: 'income', account: 'bank', amount: 1000 }];
  });
  afterEach(() => vi.useRealTimers());

  it('keeps purchase-month liquidity intact until the bank payment', async () => {
    await runSummary();
    expect(fixtures.send.mock.calls[0][2]).toContain('1000€ di flusso netto (100%)');
  });

  it('rebuilds the payment from prior-month sources instead of counting a stale duplicate', async () => {
    vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
    fixtures.transactions.push({
      ...purchase, id: '__cc__card__2026-10', date: '2026-11-10', type: 'transfer', amount: 999,
      account: 'bank', toAccount: 'card', creditCardSettlement: { cardId: 'card', period: '2026-10', paymentDay: 10, paymentAccountId: 'bank', policyFromMonth: '2026-10' },
    });
    await runSummary();
    expect(fixtures.send.mock.calls[0][2]).toContain('-100€ di flusso netto');
  });

  it('retains cash-date refunds and non-TFR investment effects for ordinary accounts', async () => {
    fixtures.accounts = [{ id: 'bank' }];
    fixtures.transactions = [
      { ...purchase, account: 'bank', shared: 20 },
      { ...purchase, id: 'refund', type: 'refund', date: '2026-10-20', account: 'bank', amount: 30 },
      { ...purchase, id: 'investment', type: 'investment', account: 'bank', amount: 50, tfr: 20 },
      { ...purchase, id: 'external', type: 'investment', account: '', amount: 90 },
      { ...purchase, id: 'template', account: 'bank', recurring: { freq: 'monthly' } },
    ];
    await runSummary();
    expect(fixtures.send.mock.calls[0][2]).toContain('-80€ di flusso netto');
  });

  it('defers refunds on the card while bank refunds credit cash on receipt', async () => {
    fixtures.transactions = [
      purchase,
      { ...purchase, id: 'card-refund', type: 'refund', amount: 20 },
      { ...purchase, id: 'bank-refund', type: 'refund', account: 'bank', amount: 10 },
    ];
    await runSummary();
    expect(fixtures.send.mock.calls[0][2]).toContain('10€ di flusso netto');
    vi.setSystemTime(new Date('2026-12-01T10:00:00Z'));
    await runSummary();
    expect(fixtures.send.mock.calls[1][2]).toContain('-80€ di flusso netto');
  });

  it('does not subtract a receipt for an earlier source month from current-month expense statistics', async () => {
    vi.setSystemTime(new Date('2026-10-31T19:00:00Z'));
    fixtures.transactions = [
      purchase,
      {...purchase,id:'old-expense',date:'2026-09-03'},
      {...purchase,id:'old-refund',type:'refund',refundOf:'old-expense',amount:20,date:'2026-10-20'},
    ];
    await remindMonthEnd.run({scheduleTime:new Date().toISOString()});
    expect(fixtures.send.mock.calls[0][2]).toContain('uscite 100€');
  });

  it.each(['2026-10-20','2026-09-30'])('keeps proportional residual expenses in the original month for a receipt on %s', async receiptDate => {
    vi.setSystemTime(new Date('2026-10-31T19:00:00Z'));
    fixtures.transactions = [
      {...purchase,id:'a',amount:60}, {...purchase,id:'b',amount:40},
      {...purchase,id:'ra',type:'refund',refundOf:'a',amount:48,date:receiptDate},
      {...purchase,id:'rb',type:'refund',refundOf:'b',amount:32,date:receiptDate},
    ];
    await remindMonthEnd.run({scheduleTime:new Date().toISOString()});
    expect(fixtures.send.mock.calls[0][2]).toContain('uscite 20€');
  });
});
