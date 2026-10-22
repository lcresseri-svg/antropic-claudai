import { expect, it } from 'vitest';
import { matchesSettingsQuery } from './settingsSearch';
it('finds a setting by separate words across group, title and description', () => {
  expect(matchesSettingsQuery('Profondità delle analisi','Quanti dettagli negli insight','Funzioni','funzioni profondita dettagli')).toBe(true);
  expect(matchesSettingsQuery('Tema scuro','Chiaro o scuro','Aspetto','TEMA   SCURO')).toBe(true);
  expect(matchesSettingsQuery('Tema scuro','Chiaro o scuro','Aspetto','conto')).toBe(false);
});
it('treats a whitespace query as unfiltered', () => {
  expect(matchesSettingsQuery('Tema scuro',undefined,'Aspetto','  ')).toBe(true);
});
