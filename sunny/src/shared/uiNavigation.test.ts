import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AdaptiveNav } from './components/AdaptiveNav';

function render(aiEnabled = false, showCommitments = false, route = '/') {
  return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [route] },
    createElement(AdaptiveNav, { onAdd() {}, onImport() {}, aiEnabled, showCommitments })));
}

describe('UI3 navigation preserves existing destination visibility', () => {
  it('offers labeled principal routes, neutral current state and Add', () => {
    const html = render();
    for (const label of ['Oggi', 'Patrimonio', 'Piano', 'Movimenti', 'Aggiungi movimento']) expect(html).toContain(label);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Salta al contenuto');
  });
  it('never creates a coach dead link when AI is disabled', () => {
    expect(render()).not.toContain('href="/ai-coach"');
    expect(render(true)).toContain('href="/ai-coach"');
  });
  it('keeps commitments contextual and gated', () => {
    expect(render(false, true, '/')).not.toContain('href="/commitments"');
    expect(render(false, false, '/wealth')).not.toContain('href="/commitments"');
    expect(render(false, true, '/wealth')).toContain('href="/commitments"');
  });
});
