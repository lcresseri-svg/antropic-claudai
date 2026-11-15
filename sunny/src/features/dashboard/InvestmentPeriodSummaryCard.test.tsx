import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvestmentPeriodSummaryCard } from './InvestmentPeriodSummaryCard';
import { formatCurrency } from '../../utils';

vi.mock('../../shared/hooks/useAnalysisPeriod', () => ({
  useAnalysisPeriod: () => ({ period: '1m', offset: 0, setPeriod: () => {}, setOffset: () => {} }),
}));
afterEach(() => vi.useRealTimers());

describe('InvestmentPeriodSummaryCard', () => {
  it('renders shared period navigation and separate deposit and returned capital amounts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 12));
    const html = renderToStaticMarkup(<InvestmentPeriodSummaryCard transactions={[
      { id: 'in', date: '2026-11-01', type: 'investment', amount: 500, tfr: 150, category: 'fund', account: '', description: 'Versamento' },
      { id: 'out', date: '2026-11-02', type: 'investment', direction: 'out', amount: 100, category: 'fund', account: 'bank', description: 'Disinvestimento' },
    ]} />);
    expect(html).toContain('Versamenti del periodo');
    expect(html).toContain('Periodo precedente');
    expect(html).toContain('Quest&#x27;anno');
    expect(html).toContain('Versato netto');
    expect(html).toContain(formatCurrency(250));
    expect(html).toContain(formatCurrency(500));
    expect(html).toContain(formatCurrency(150));
    expect(html).toContain(formatCurrency(100));
    expect(html).toContain('Capitale rimborsato dai disinvestimenti');
  });
  it('shows an explicit empty period message', () => {
    expect(renderToStaticMarkup(<InvestmentPeriodSummaryCard transactions={[]} />))
      .toContain('Nessun versamento o disinvestimento in questo periodo.');
  });
});
