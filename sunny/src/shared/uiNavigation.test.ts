import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdaptiveNav } from './components/AdaptiveNav';

function render(aiEnabled = false, showCommitments = false, route = '/') {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [route] },
    createElement(AdaptiveNav, { onAdd() {}, onImport() {}, aiEnabled, showCommitments })));
}

describe('UI3.1 navigation adapts three primary destinations', () => {
  it('offers three stable destinations, a month shortcut and a separate add action', () => {
    const html = render();
    expect((html.match(/data-ui31-primary="true"/g) ?? [])).toHaveLength(3);
    for (const label of ['Oggi', 'Patrimonio', 'Il tuo mese', 'Movimenti', 'Aggiungi movimento']) expect(html).toContain(label);
    expect(html).toContain('href="/budget"');
    expect(html).toContain('Salta al contenuto');
  });
  it.each(['/budget', '/commitments', '/income', '/category-spending', '/insights'])('keeps Oggi selected inside its tools: %s', route => {
    expect(render(false, true, route)).toMatch(/aria-current="page"[^>]*data-ui31-primary="true"[^>]*href="\/"/);
  });
  it.each(['/wealth', '/investments', '/account-balance', '/wealth-history'])('keeps Patrimonio selected inside its details: %s', route => {
    expect(render(false, true, route)).toMatch(/aria-current="page"[^>]*data-ui31-primary="true"[^>]*href="\/wealth"/);
  });
  it('never creates a coach dead link when AI is disabled', () => {
    expect(render()).not.toContain('href="/ai-coach"');
    expect(render(true)).toContain('href="/ai-coach"');
  });
  it('keeps commitments reachable and gated', () => {
    expect(render(false, true, '/')).toContain('href="/commitments"');
    expect(render(false, false, '/wealth')).not.toContain('href="/commitments"');
    expect(render(false, true, '/wealth')).toContain('href="/commitments"');
  });
});
