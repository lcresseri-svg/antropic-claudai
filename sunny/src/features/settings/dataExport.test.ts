import { describe, it, expect } from 'vitest';
import { transactionsToCsv, buildExportPayload, CSV_COLUMNS } from './dataExport';
import { Transaction, BudgetState } from '../../types';

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

  it('includes the budget block when a budget is provided', () => {
    const budget: BudgetState = {
      savingsTarget: 500,
      categoryBudgets: { spesa: 400, acquisti: 200 },
      incomeBudgets: { stipendio: 2000 },
      investmentBudgets: {},
      suggestionAccepted: true,
    };
    const payload = buildExportPayload(
      { uid: 'u1', email: null, displayName: null }, [], [], [tx({})], budget,
    );
    expect(payload.budget).toBeDefined();
    expect(payload.budget!.categoryBudgets).toEqual({ spesa: 400, acquisti: 200 });
    expect(payload.budget!.savingsTarget).toBe(500);
    expect(payload.budget!.suggestionAccepted).toBe(true);
  });

  it('includes budgetHistory only when non-empty', () => {
    const budget: BudgetState = {
      savingsTarget: 0, categoryBudgets: {}, incomeBudgets: {}, investmentBudgets: {}, suggestionAccepted: false,
    };
    const history = [{ month: '2026-02', categoryBudgets: { spesa: 350 }, totalBudget: 350 }];
    const payload = buildExportPayload(
      { uid: 'u1', email: null, displayName: null }, [], [], [], budget, history,
    );
    expect(payload.budgetHistory).toHaveLength(1);
    expect(payload.budgetHistory![0].month).toBe('2026-02');
  });
});
