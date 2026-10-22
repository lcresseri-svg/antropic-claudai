import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { DashboardV2 } from './DashboardV2';
import { aggregateFlow } from '../../shared/financialFlow';
import { formatCurrency } from '../../utils';
import type { Transaction } from '../../types';

const state = vi.hoisted(() => ({ version: '3.0' }));
const categories = [
  { id: 'fund', label: 'Fondo', kind: 'investment', icon: '', color: '#996600' },
  { id: 'food', label: 'Spesa', kind: 'expense', icon: '', color: '#996600' },
];

vi.mock('../../shared/providers/UiVersionProvider', async original => ({
  ...await original<typeof import('../../shared/providers/UiVersionProvider')>(),
  useUiVersion: () => state.version,
}));
vi.mock('../../shared/providers/settings', () => ({
  useSettings: () => ({
    accounts: [{ id: 'bank', label: 'Conto', icon: '', color: '#996600', initialBalance: 1000 }],
    categories, visibleCategories: categories, enableInvestments: true, includeInvestments: true,
    getCat: (id: string) => categories.find(c => c.id === id) ?? categories[1],
    getAcc: () => ({ id: 'bank', label: 'Conto', icon: '', color: '#996600' }),
    insightDepth: 'minimal', cashReserve: 0, homeOrder: [], saveHomeOrder: () => {},
  }),
}));

const tx = (patch: Partial<Transaction>): Transaction => ({
  id: 'deposit', type: 'investment', amount: 300, tfr: 200, account: 'bank',
  category: 'fund', date: '2026-10-03', description: 'Versamento', ...patch,
});

function investedValues(transactions: Transaction[]) {
  const html = renderToStaticMarkup(<MemoryRouter><DashboardV2
    transactions={transactions} monthlyFlow={aggregateFlow(transactions)} accountBalances={{ bank: 900 }}
    greeting="Oggi" netWorth={1200} liquidity={900} investmentTotal={300}
    monthlyIncome={0} monthlyExpenses={0} monthlyInvestments={450}
    investmentByCategory={{ fund: 300 }} trend={[]} savingsTarget={0}
    onSeeInsights={() => {}} onSeeInvestments={() => {}} onAddExpense={() => {}}
    onAddIncome={() => {}} onImportCSV={() => {}}
  /></MemoryRouter>);
  return [...html.matchAll(/aria-label="Analizza investito"[^>]*>[\s\S]*?<p class="balance-num[^"]*">([^<]*)<\/p>/g)]
    .map(match => match[1]);
}

afterEach(() => vi.useRealTimers());

describe.each(['2.0', '3.0'])('monthly Investito in UI%s', version => {
  beforeEach(() => {
    state.version = version;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 10, 12));
  });

  it('shows only deposits funded by accounts, excluding TFR, external money and withdrawals', () => {
    const values = investedValues([
      tx({}),
      tx({ id: 'external', amount: 150, tfr: 0, account: '' }),
      tx({ id: 'withdrawal', amount: 120, tfr: 0, direction: 'out' }),
    ]);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toBe(formatCurrency(100));
  });

  it('shows zero when contributions are entirely TFR or external', () => {
    const values = investedValues([
      tx({ amount: 200, tfr: 200 }),
      tx({ id: 'external', amount: 150, tfr: 0, account: '' }),
    ]);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toBe(formatCurrency(0));
  });
});
