import { describe, it, expect } from 'vitest';
import { transactionsToCsv, buildExportPayload, CSV_COLUMNS } from './dataExport';
import { Transaction } from '../../types';
import { MonthlyBudget } from '../budget/monthlyBudget';

const tx = (over: Partial<Transaction>): Transaction => ({
  id: 'x', date: '2026-01-01', description: 'Test', amount: 10,
  type: 'expense', category: 'spesa', account: 'conto_corrente', ...over,
});

describe('transactionsToCsv', () => {
  it('starts with the header row', () => {
    const csv = transactionsToCsv([]);
    expect(csv).toBe(CSV_COLUMNS.join(','));
  });

  it('emits one CRLF-terminated line per transaction', () => {
    const csv = transactionsToCsv([tx({}), tx({ id: 'y' })]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3); // header + 2 rows
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = transactionsToCsv([tx({ description: 'Bar, "Da Gino"\nvia Roma' })]);
    expect(csv).toContain('"Bar, ""Da Gino""\nvia Roma"');
  });

  it('renders missing optional fields as empty cells', () => {
    const csv = transactionsToCsv([tx({ notes: undefined, groupId: undefined })]);
    const row = csv.split('\r\n')[1];
    // date,description,amount,type,category,account,toAccount,notes,shared,groupId,direction
    expect(row).toBe('2026-01-01,Test,10,expense,spesa,conto_corrente,,,,,');
  });

  it('exports the investment direction so a CSV round-trip preserves withdrawals', () => {
    const csv = transactionsToCsv([tx({ type: 'investment', category: 'azioni_etf', direction: 'out' })]);
    expect(csv.split('\r\n')[1].endsWith(',out')).toBe(true);
  });
});

describe('buildExportPayload', () => {
  it('captures user, settings and transactions with metadata', () => {
    const payload = buildExportPayload(
      { uid: 'u1', email: 'a@b.it', displayName: 'Mario' },
      [{ id: 'spesa', label: 'Spesa', icon: '🛒', color: '#000', kind: 'expense' }],
      [{ id: 'cc', label: 'Conto', icon: '🏦', color: '#000' }],
      [tx({})],
    );
    expect(payload.app).toBe('Sunny');
    expect(payload.schemaVersion).toBe(1);
    expect(payload.user.uid).toBe('u1');
    expect(payload.categories).toHaveLength(1);
    expect(payload.accounts).toHaveLength(1);
    expect(payload.transactions).toHaveLength(1);
    expect(payload.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('omits the budget block when no budget is provided (backward compatible)', () => {
    const payload = buildExportPayload(
      { uid: 'u1', email: null, displayName: null }, [], [], [tx({})],
    );
    expect(payload.budget).toBeUndefined();
    expect(payload.budgetHistory).toBeUndefined();
  });

  it('includes the current month budget block when a monthly budget is provided', () => {
    const current: MonthlyBudget = {
      month: '2026-06', savingsTarget: 500,
      categoryBudgets: { spesa: 400, acquisti: 200 }, incomeBudgets: {}, investmentBudgets: {},
      suggestionAccepted: true, status: 'confirmed', source: 'manual', confirmedAt: 123,
    };
    const payload = buildExportPayload(
      { uid: 'u1', email: null, displayName: null }, [], [], [tx({})],
      { currentMonth: '2026-06', current, history: [current] },
    );
    expect(payload.budget).toBeDefined();
    expect(payload.budget!.currentMonth).toBe('2026-06');
    expect(payload.budget!.currentBudget.categoryBudgets).toEqual({ spesa: 400, acquisti: 200 });
    expect(payload.budget!.currentBudget.status).toBe('confirmed');
    expect(payload.budgetHistory).toHaveLength(1);
    expect(payload.budgetHistory![0].month).toBe('2026-06');
  });

  it('falls back to the legacy budget as a synthetic current month when no snapshot exists', () => {
    const payload = buildExportPayload(
      { uid: 'u1', email: null, displayName: null }, [], [], [],
      {
        currentMonth: '2026-06',
        legacy: { savingsTarget: 300, categoryBudgets: { x: 50 }, incomeBudgets: {}, investmentBudgets: {}, suggestionAccepted: false },
      },
    );
    expect(payload.budget!.currentBudget.status).toBe('missing');
    expect(payload.budget!.currentBudget.categoryBudgets).toEqual({ x: 50 });
    expect(payload.budgetHistory).toBeUndefined();
  });
});
