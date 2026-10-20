import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SettingsMenuResults } from './SettingsMenuResults';
function Section(_props: {title:string; children:React.ReactNode}) { return null; }
function Entry(_props:{label:string;sub?:string}) { return null; }
it('reports no matches while keeping gated entries out of search counts', () => {
  const html = renderToStaticMarkup(<SettingsMenuResults active query="admin"><Section title="Sunny"><Entry label="Come funziona" />{false && <Entry label="Metriche admin" />}</Section></SettingsMenuResults>);
  expect(html).toContain('Nessuna impostazione trovata');
  expect(html).toContain('role="status"');
});
it('counts matches across group and description', () => {
  const html = renderToStaticMarkup(<SettingsMenuResults active query="aspetto chiaro"><Section title="Aspetto"><Entry label="Tema scuro" sub="Chiaro o scuro" /></Section></SettingsMenuResults>);
  expect(html).toContain('1 impostazione trovata');
});
