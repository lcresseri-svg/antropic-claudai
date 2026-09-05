import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvestmentOverviewCard } from './InvestmentOverviewCard';

const render = (marketValue: number | null, estimated = false, deposited = 1000) => renderToStaticMarkup(
  <InvestmentOverviewCard deposited={deposited} marketValue={marketValue} estimated={estimated}
    currentMonth="2026-09" points={[{ key: '2026-09', versato: deposited, deposits: 100, returned: 0 }]} />,
);

describe('InvestmentOverviewCard', () => {
  it('labels capital and performance separately and shows the current month as incomplete', () => {
    const html = render(1100);
    expect(html).toContain('Guadagno / perdita latente');
    expect(html).toContain('+10% sul capitale netto');
    expect(html).toContain('non annualizzato');
    expect(html).toContain('in corso');
    expect(html).toContain('non misura guadagni o perdite');
    expect(html).toContain('aria-valuenow="1"');
  });
  it('distinguishes a zero valuation (total loss) from an unknown valuation', () => {
    expect(render(0)).toContain('-100% sul capitale netto');
    const missing = render(null);
    expect(missing).toContain('Inserisci il valore delle posizioni');
    expect(missing).not.toContain('% sul capitale netto');
  });
  it('explicitly labels fallback valuations as estimates', () => {
    const html = render(1100, true);
    expect(html).toContain('Valore totale stimato');
    expect(html).toContain('Differenza stimata');
    expect(html).toContain('parzialmente stimati');
  });
  it('does not divide by zero when there is no invested capital', () => {
    const html = render(0, false, 0);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).not.toContain('% sul capitale netto');
  });
});
