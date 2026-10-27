import {describe,it,expect} from 'vitest';
import {pageNavigation} from './pageNavigation';
describe('app bar routes',()=>{
 it('keeps the home and immersive Wrapped outside page navigation',()=>{
  for(const ui3 of [true,false]){expect(pageNavigation('/',ui3)).toBeNull();expect(pageNavigation('/wrapped/2026',ui3)).toBeNull();}
 });
 it('provides direct-link fallback parents without treating unknown routes as Settings',()=>{
  expect(pageNavigation('/wealth-history',false)).toEqual({title:'Andamento patrimonio',backTo:'/wealth'});
  expect(pageNavigation('/monthly-plan',true)?.backTo).toBe('/budget');
  expect(pageNavigation('/settings/nested',false)?.title).toBe('Impostazioni');expect(pageNavigation('/settings-other',true)).toBeNull();
 });
});
