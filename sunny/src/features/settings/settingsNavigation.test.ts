import {describe,it,expect} from 'vitest';
import {settingsParent,SETTINGS_TITLES} from './settingsNavigation';
describe('settings header hierarchy',()=>{
 it('returns management lists to Gestione, then to the settings menu',()=>{
  for(const section of ['accounts','categories','macros'] as const)expect(settingsParent(section)).toBe('gestione');
  expect(settingsParent('gestione')).toBe('menu');expect(settingsParent('menu')).toBeNull();
 });
 it('provides a title and a parent for every leaf, including direct links',()=>{
  for(const section of Object.keys(SETTINGS_TITLES) as (keyof typeof SETTINGS_TITLES)[]){expect(SETTINGS_TITLES[section].length).toBeGreaterThan(0);if(section!=='menu')expect(settingsParent(section)).not.toBeNull();}
  expect(settingsParent('shortcut')).toBe('menu');expect(settingsParent('riserva')).toBe('menu');
 });
});
