import { describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(()=>({docs:new Map<string,any>(), writes:[] as any[]}));
vi.mock('firebase/firestore',()=>({
  doc: (_db:unknown,...path:string[])=>path.join('/'),
  runTransaction: async (_db:unknown,fn:any)=>{
    state.writes=[];
    const result=await fn({get:async(p:string)=>({exists:()=>state.docs.has(p),data:()=>state.docs.get(p)}),
      set:(p:string,v:any)=>state.writes.push([p,v])});
    for(const [p,v] of state.writes) state.docs.set(p,v);
    return result;
  },
}));
import { saveMonthlyBudget, ensureMonthlyBudget, editLegacyBudget, revisionOf } from './monthlyBudgetStore';
import { initMonthlyBudget } from './monthlyBudget';
const p='users/u/budgetHistory/2026-10',mirror='users/u/meta/budget';
const base=()=>({...initMonthlyBudget({month:'2026-10'}),planningV3:{schemaVersion:1 as const,inputsReviewedAt:10,cashInvestmentBudgets:{fund:200}}});
const db={} as any;
describe('canonical atomic budget repository',()=>{
  it('saves snapshot and mirror together, preserves unknown fields',async()=>{
    state.docs.clear();state.docs.set(p,{...base(),other:'keep'});state.docs.set(mirror,{foreign:42});
    const saved=await saveMonthlyBudget(db,'u','2026-10',base(),revisionOf(state.docs.get(p)),new Date(2026,9,10));
    expect(saved.revision).toBe(1);
    expect(state.docs.get(p).other).toBe('keep');
    expect(state.docs.get(mirror).foreign).toBe(42);
    expect(state.docs.get(mirror).planningV3).toEqual(base().planningV3);
  });
  it('rejects conflict with no half writes',async()=>{
    const before=state.docs.get(p);
    await expect(saveMonthlyBudget(db,'u','2026-10',base(),-1,new Date(2026,9,10))).rejects.toThrow('modificato');
    expect(state.docs.get(p)).toBe(before);expect(state.writes).toHaveLength(0);
  });
  it('stale foreign draft fields cannot replace server-owned extras',async()=>{
    state.docs.set(p,{...base(),revision:8,foreign:'server'});
    await saveMonthlyBudget(db,'u','2026-10',{...base(),foreign:'stale'} as any,8,new Date(2026,9,10));
    expect(state.docs.get(p).foreign).toBe('server');
  });
  it('future and historical saves never touch current mirror',async()=>{
    const before=state.docs.get(mirror);
    await saveMonthlyBudget(db,'u','2026-11',{...base(),month:'2026-11'},null,new Date(2026,9,10));
    expect(state.docs.get(mirror)).toBe(before);
  });
  it('initialization creates only if absent, copied metadata needs review',async()=>{
    state.docs.clear();state.docs.set('users/u/budgetHistory/2026-09',{...base(),month:'2026-09'});
    await ensureMonthlyBudget(db,'u',new Date(2026,9,10));
    expect(state.docs.get(p).planningV3.inputsReviewedAt).toBe(0);
    const first=state.docs.get(p);
    await ensureMonthlyBudget(db,'u',new Date(2026,9,10));
    expect(state.docs.get(p)).toBe(first);
  });
  it('legacy edits preserve metadata, invalidate shared inputs, and increment revision',async()=>{
    state.docs.set(p,base());
    await editLegacyBudget(db,'u','2026-10',b=>({...b,savingsTarget:25}),new Date(2026,9,10));
    expect(state.docs.get(p).planningV3).toEqual({...base().planningV3,inputsReviewedAt:0});
    expect(state.docs.get(p).revision).toBe(1);
  });
  it('rejects negative, nonfinite, or unsupported new metadata before writes',async()=>{
    for(const value of [-1,Infinity,NaN]) await expect(saveMonthlyBudget(db,'u','2026-10',
      {...base(),planningV3:{...base().planningV3,cashInvestmentBudgets:{f:value}}},0)).rejects.toThrow();
  });
  it('keeps an offline save local instead of invoking a transaction',async()=>{
    vi.stubGlobal('navigator',{onLine:false});
    const before=state.docs.get(p);
    try{await expect(saveMonthlyBudget(db,'u','2026-10',base(),revisionOf(before))).rejects.toThrow('Offline');}
    finally{vi.unstubAllGlobals();}
    expect(state.docs.get(p)).toBe(before);
  });
});
