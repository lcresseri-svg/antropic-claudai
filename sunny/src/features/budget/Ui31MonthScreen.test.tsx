import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { Ui31MonthScreen } from './Ui31MonthScreen';
import { Transaction } from '../../types';
const state=vi.hoisted(()=>({enabled:true}));
const accounts=[{id:'bank',label:'Banca',icon:'',color:'#888'},{id:'card',label:'Carta',icon:'',color:'#888',creditCardPolicies:[{fromMonth:'2026-09',enabled:true,paymentDay:10,paymentAccountId:'bank'}]}];
vi.mock('../../shared/hooks/useBudget',()=>({useBudget:()=>({budgetHistory:[],loading:false,error:null,fromCache:false,retry:()=>{}})}));
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({enableBudget:state.enabled,accounts,categories:[{id:'food',label:'Alimentari',kind:'expense',color:'#888',icon:'🍎'}]})}));
vi.mock('../../shared/providers/UiVersionProvider',()=>({useUiVersion:()=> '3.0',useUiNavigationMemory:()=>null,useUiSessionState:(_key:string,initial:any)=>useState(initial)}));
vi.mock('./PlanScreen',()=>({PlanScreen:({month,embedded}:any)=><div data-plan-month={month} data-embedded={embedded}/> }));
vi.mock('./useMonthlyPlan',async importOriginal=>({...await importOriginal<any>(),usePlanCalendar:()=>new Date(2026,9,19,12)}));
const tx:Transaction={id:'grocery',amount:40,type:'expense',category:'food',account:'bank',date:'2026-09-04',description:'Mercato'};
const render=(url:string,transactions:Transaction[]=[tx])=>renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><Ui31MonthScreen user={{uid:'test'} as User} transactions={transactions}/></MemoryRouter>);
describe('Il tuo mese',()=>{
  it('defaults to Piano and supplies a single controlled period to the existing plan',()=>{
    state.enabled=true;
    const html=render('/budget?month=2026-09');
    expect(html).toContain('data-plan-month="2026-09"');
    expect(html).toContain('data-embedded="true"');
    expect(html).toContain('aria-label="Mese selezionato"');
  });
  it('keeps overview and due dates accessible when the plan is disabled',()=>{
    state.enabled=false;
    expect(render('/budget?view=overview&month=2026-09')).toContain('Uscite registrate');
    const html=render('/budget?view=plan');
    expect(html).toContain('Il piano è facoltativo');
    expect(html).not.toContain('data-plan-month');
    expect(html).toContain('Scadenze');
    state.enabled=true;
  });
  it('shows actual scheduled occurrences in the selected month, not monthly equivalents',()=>{
    const html=render('/budget?view=due&month=2026-11',[{...tx,date:'2026-11-10',description:'Rinnovo annuale',amount:120,recurring:{freq:'yearly'}}]);
    expect(html).toContain('Rinnovo annuale');
    expect(html).toContain('10/11/2026');
    expect(html).not.toContain('data-plan-month');
    expect(html).toContain('occorrenze effettive');
  });
  it('keeps purchases statistical and shows their single bank payment in the later cash month',()=>{
    const purchase={...tx,date:'2026-09-04',account:'card',amount:100};
    const september=render('/budget?view=overview&month=2026-09',[purchase]);
    expect(september).toMatch(/Variazione della liquidità<\/span><strong>0,00/);
    const october=render('/budget?view=overview&month=2026-10',[purchase]);
    expect(october).toContain('Addebiti carte');
    expect(october).toMatch(/Variazione della liquidità<\/span><strong>−?[-]?100,00/);
    const due=render('/budget?view=due&month=2026-10',[purchase]);
    expect(due).toContain('Addebito carta');
    expect(due).toContain('10/10/2026');
  });
  it('offers the category detail before a period-specific movements route',()=>{
    const html=render('/budget?view=overview&month=2026-09');
    expect(html).toContain('Alimentari');
    expect(html).toContain('cat=food');
    expect(html).toContain('from=2026-09-01');
    expect(html).toContain('to=2026-09-30');
    expect(html).toContain('Mercato');
  });
});
