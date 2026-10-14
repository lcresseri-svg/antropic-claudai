import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SpendingBreakdownCard} from './SpendingBreakdownCard';
import {formatCurrency} from '../../utils';
const state=vi.hoisted(()=>({version:'3.0'}));
vi.mock('../../shared/providers/UiVersionProvider',()=>({useUiVersion:()=>state.version}));
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({getCat:(id:string)=>({label:id,color:'#888888'})})}));
describe('home spending overview',()=>{
 it('limits UI3 to five categories and a remainder preserving all amounts',()=>{
  state.version='3.0';
  const categoryTotals=Object.fromEntries(Array.from({length:12},(_,i)=>[`Category ${i+1}`,120-i*10]));
  const html=renderToStaticMarkup(<SpendingBreakdownCard categoryTotals={categoryTotals} onSeeAll={()=>{}}/>);
  expect((html.match(/class="liquid-spending-row"/g)||[]).length).toBe(6);
  expect(html).toContain('Altre 7');
  expect(html).toContain(formatCurrency(280));
  expect(html).not.toContain('Category 6<');
  expect(html).toContain('Tutte');
 });
 it('retains the existing UI2 ring with all category wedges',()=>{
  state.version='2.0';
  const html=renderToStaticMarkup(<SpendingBreakdownCard categoryTotals={Object.fromEntries(Array.from({length:12},(_,i)=>[`Category ${i+1}`,120-i*10]))} onSeeAll={()=>{}}/>);
  expect((html.match(/<path /g)||[]).length).toBe(12);
  expect(html).not.toContain('<dl');
 });
});
