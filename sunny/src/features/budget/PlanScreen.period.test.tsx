import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { PlanScreen } from './PlanScreen';
vi.mock('../../shared/hooks/useBudget',()=>({useBudget:()=>({budgetHistory:[],loading:false,error:null,fromCache:false,retry:()=>{}})}));
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({categories:[],enableInvestments:false,aiEnabled:false})}));
vi.mock('../../shared/providers/UiVersionProvider',()=>({useUiVersion:()=> '3.0',useUiSessionState:(_key:string,initial:any)=>useState(initial)}));
vi.mock('../aiCoach/CoachEntryCard',()=>({CoachEntryCard:()=>null}));
vi.mock('./PlanEditor',()=>({PlanEditor:()=>null}));
vi.mock('./useMonthlyPlan',async importOriginal=>({...await importOriginal<any>(),usePlanCalendar:()=>new Date(2026,9,19,12)}));
describe('controlled plan period',()=>{
 it('uses the month container period and removes its duplicate period selector when embedded',()=>{
  const html=renderToStaticMarkup(<MemoryRouter><PlanScreen user={{uid:'test'} as User} transactions={[]} month="2026-09" onMonthChange={()=>{}} embedded/></MemoryRouter>);
  expect(html).toContain('Consuntivo');
  expect(html).not.toContain('aria-label="Mese del piano"');
 });
 it('keeps the standalone legacy month selector',()=>{
  const html=renderToStaticMarkup(<MemoryRouter><PlanScreen user={{uid:'test'} as User} transactions={[]}/></MemoryRouter>);
  expect(html).toContain('aria-label="Mese del piano"');
 });
});
