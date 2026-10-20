import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvestmentSummaryCard } from './InvestmentSummaryCard';
vi.mock('../../shared/providers/UiVersionProvider', () => ({ useUiVersion: () => '3.0' }));
vi.mock('../../shared/providers/settings', () => ({ useSettings: () => ({ getCat: (id: string) => ({ id, label: 'Fondo', icon: 'A', color: '#999' }) }) }));
describe('investment summary access', () => {
  it('offers a native keyboard reachable control to open investments', () => {
    const html = renderToStaticMarkup(<InvestmentSummaryCard investmentByCategory={{ fund: 100 }} total={100} onClick={() => {}} />);
    expect(html).toContain('<button');
    expect(html).toContain('Apri investimenti');
    expect(html).not.toContain('role="button"');
  });
});
