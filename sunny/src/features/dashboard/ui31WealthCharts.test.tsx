import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WealthLineChart } from './WealthLineChart';
vi.mock('../../shared/providers/UiVersionProvider', () => ({ useUiVersion: () => '3.0' }));
const points = [
  { date: '2026-09-01', label: 'Set', total: 9700, liquidity: 200, investments: 9500 },
  { date: '2026-10-01', label: 'Ott', total: 9900, liquidity: 300, investments: 9600 },
];
const formatValue = (value: number) => `${value} EUR`;
describe('wealth chart inclusion and sparse history', () => {
  it('keeps an excluded investment out of the chart and accessible source values', () => {
    const html = renderToStaticMarkup(<WealthLineChart points={points} formatValue={formatValue} includeInvestments={false} />);
    expect(html).not.toContain('9700 EUR');
    expect(html).not.toContain('9600 EUR');
    expect(html).not.toContain('Nascondi Investimenti');
    expect(html).not.toContain('data-wealth-series="inv"');
    expect(html).toContain('300 EUR');
    expect(html).toContain('Liquidità inclusa');
  });
  it('offers the exact single point without drawing an invented trend', () => {
    const html = renderToStaticMarkup(<WealthLineChart points={[points[0]]} formatValue={formatValue} />);
    expect(html).toContain('9700 EUR');
    expect(html).toContain('Vedi dati');
    expect(html).toContain('Un solo punto disponibile');
    expect(html).not.toContain('<path');
  });
});
