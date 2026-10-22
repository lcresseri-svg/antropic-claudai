import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Ui31FlowChart } from './Ui31MonthCharts';
import { aggregateFlow } from '../../shared/financialFlow';
import { formatCurrency } from '../../utils';
import type { Transaction } from '../../types';

const tx = (patch: Partial<Transaction>): Transaction => ({
  id: 'deposit', type: 'investment', amount: 300, tfr: 200, account: 'bank',
  category: 'fund', date: '2026-10-03', description: 'Versamento', ...patch,
});

describe('UI3.1 investments from accounts', () => {
  it.each([
    { name: 'mixed funding', deposit: tx({}), expected: 100 },
    { name: 'TFR and external funding only', deposit: tx({ amount: 200, tfr: 200 }), expected: 0 },
  ])('shows only the account-funded portion for $name', ({ deposit, expected }) => {
    const flow = aggregateFlow([
      deposit,
      tx({ id: 'external', amount: 150, tfr: 0, account: '' }),
      tx({ id: 'withdrawal', amount: 120, tfr: 0, direction: 'out' }),
    ]);
    const html = renderToStaticMarkup(<Ui31FlowChart flow={flow} />);

    expect(html).toContain(`<dt>Investimenti dai conti</dt><dd>${formatCurrency(expected)}</dd>`);
    expect(html).toContain(`<dt>Capitale disinvestito</dt><dd>${formatCurrency(120)}</dd>`);
    expect(html).toContain(`apporti esterni ${formatCurrency(150)} · TFR ${formatCurrency(200)}`);
  });
});
