import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {SeriesDetailSheet} from './SeriesDetailSheet';
import type {Transaction} from '../../types';
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({getCat:(id:string)=>({id,label:id,icon:'🍎',color:'#996600'})})}));
vi.mock('../../shared/useScrollLock',()=>({useScrollLock:vi.fn()}));
vi.mock('../../shared/hooks/useEscapeKey',()=>({useEscapeKey:vi.fn()}));
vi.mock('../../shared/components/DialogSurface',()=>({DialogSurface:({children}:any)=><section>{children}</section>}));
const past:Transaction={id:'past',type:'expense',amount:1.24,date:'2026-09-30',description:'Voce originale',category:'food',account:'bank',seriesId:'s'};
const template:Transaction={...past,id:'template',amount:.74,date:'2026-11-30',description:'Regola futura',recurring:{freq:'monthly',until:'2026-10-30'}};
const props={open:true,onClose:vi.fn(),onEditSingle:vi.fn(),onEditSeries:vi.fn(),onViewMovements:vi.fn()};
describe('selected series occurrence',()=>{
 it('shows the actual selected amount and description separately from the template',()=>{
  const html=renderToStaticMarkup(<SeriesDetailSheet {...props} anchor={past} allTransactions={[past,template]}/>);
  expect(html).toContain('Questa occorrenza');expect(html).toContain('Voce originale');
  expect(html).toMatch(/text-\[26px\][^>]*>1,24/);
 });
 it('refreshes a selected occurrence from the latest snapshot after recovery or edit',()=>{
  const html=renderToStaticMarkup(<SeriesDetailSheet {...props} anchor={{...past,amount:.74}} allTransactions={[past,template]}/>);
  expect(html).toMatch(/text-\[26px\][^>]*>1,24/);
 });
 it('refreshes projected content from the current template while keeping its occurrence date',()=>{
  const projection={...past,id:'projection',amount:.74,projected:true,date:'2026-12-30'};
  const html=renderToStaticMarkup(<SeriesDetailSheet {...props} anchor={projection} allTransactions={[{...template,amount:1.24}]}/>);
  expect(html).toMatch(/text-\[26px\][^>]*>1,24/);expect(html).toContain('Regola futura');expect(html).toContain('30 dic 2026');
 });
 it('keeps the template amount when opening the series itself',()=>{
  const html=renderToStaticMarkup(<SeriesDetailSheet {...props} anchor={template} allTransactions={[past,template]}/>);
  expect(html).toMatch(/text-\[26px\][^>]*>0,74/);expect(html).not.toContain('Questa occorrenza');
 });
});
