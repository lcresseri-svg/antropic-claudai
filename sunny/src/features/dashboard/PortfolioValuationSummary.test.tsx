import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortfolioValuationSummary } from './PortfolioValuationSummary';
import type { CategoryDef } from '../../types';
const cat = (id: string, lastValueUpdate?: string): CategoryDef => ({ id, label: id, kind: 'investment', color: '#888', icon: 'A', lastValueUpdate });
const base = { total: 1500, deposited: 1200, difference: 300, differencePct: 25 };
describe('qualified investment valuation', () => {
  it('discloses the capital fallback and suppresses an incomplete portfolio gain', () => {
    const html = renderToStaticMarkup(<PortfolioValuationSummary {...base} positions={[
      { cat: cat('Azioni', '2026-10-01'), controvalore: 1000 }, { cat: cat('Fondo'), controvalore: null },
    ]} />);
    expect(html).toContain('Valore con dati parziali');
    expect(html).toContain('1 posizione senza controvalore');
    expect(html).toContain('capitale versato');
    expect(html).not.toContain('+25');
    expect(html).toContain('1 ott 2026');
  });
  it('calls a portfolio with no market values capital, without a market reference', () => {
    const html = renderToStaticMarkup(<PortfolioValuationSummary {...base} positions={[{ cat: cat('Fondo'), controvalore: null }]} />);
    expect(html).toContain('Capitale versato');
    expect(html).not.toContain('Ultimo controvalore noto');
    expect(html).not.toContain('+25');
  });
  it('treats a known zero valuation as real and keeps a missing date explicit', () => {
    const html = renderToStaticMarkup(<PortfolioValuationSummary {...base} total={0} difference={-1200} differencePct={-100} positions={[{ cat: cat('Fondo'), controvalore: 0 }]} />);
    expect(html).toContain('Controvalore totale');
    expect(html).toContain('Data di aggiornamento non disponibile');
    expect(html).not.toContain('senza controvalore');
  });
});
