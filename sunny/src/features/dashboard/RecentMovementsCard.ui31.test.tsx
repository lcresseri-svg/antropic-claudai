import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RecentMovementsCard } from './RecentMovementsCard';
import { Transaction } from '../../types';
const ui=vi.hoisted(()=>({version:'3.0'}));
vi.mock('../../shared/providers/UiVersionProvider',()=>({useUiVersion:()=>ui.version}));
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({getCat:()=>({label:'Categoria',icon:'🍎',color:'#888888'}),getAcc:()=>({label:'Banca'})})}));
const tx=(id:string,date:string):Transaction=>({id,description:id,amount:10,type:'expense',category:'food',account:'bank',date});
const render=(transactions:Transaction[])=>renderToStaticMarkup(<RecentMovementsCard transactions={transactions} now={new Date(2026,9,19,12)} onSeeAll={()=>{}} onOpenTransaction={()=>{}}/>);
describe('UI3.1 recent movements',()=>{
 it('shows exactly three registered entries and keeps future entries in the month',()=>{
  ui.version='3.0';
  const html=render([tx('old','2026-10-01'),tx('third','2026-10-02'),tx('second','2026-10-03'),tx('first','2026-10-04'),tx('future','2026-10-20')]);
  expect((html.match(/<li/g)??[]).length).toBe(3);
  expect(html).not.toContain('future');
  expect(html).not.toContain('>old<');
 });
 it('provides an empty state when all available movements are future entries',()=>{
  ui.version='3.0';
  expect(render([tx('future','2026-10-20')])).toContain('Nessun movimento registrato');
 });
 it('keeps the UI2 recent movement contract with its upcoming row',()=>{
  ui.version='2.0';
  const html=render([tx('old','2026-10-01'),tx('third','2026-10-02'),tx('second','2026-10-03'),tx('first','2026-10-04'),tx('future','2026-10-20')]);
  expect((html.match(/<li/g)??[]).length).toBe(4);
  expect(html).toContain('future');
 });
});
