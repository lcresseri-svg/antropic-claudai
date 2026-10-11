import {describe,it,expect} from 'vitest';
import {parsePlanAmount,createPlanDraft,resolvePlanDraft,moveCategoryLimit,draftKey,applyLimitTransferToDraft,planDifferences} from './planDraft';
import {initMonthlyBudget} from './monthlyBudget';
describe('controlled Piano draft',()=>{
  it('keeps empty distinct from zero and accepts Italian cents',()=>{
    expect(parsePlanAmount('')).toBeNull();expect(parsePlanAmount('0')).toBe(0);
    expect(parsePlanAmount('1.234,56')).toBe(1234.56);expect(parsePlanAmount('12,50')).toBe(12.5);
    for(const s of ['-1','1e3','Infinity','1,234','ciao'])expect(parsePlanAmount(s)).toBeNull();
  });
  it('requires explicit inputs; retains legacy investments without converting them',()=>{
    const p={...initMonthlyBudget({month:'2026-10'}),investmentBudgets:{pension:500}};
    const d=createPlanDraft(p);
    expect(d.cash).toEqual({});expect(d.savings).toBe('');
    expect(()=>resolvePlanDraft(d,true)).toThrow();
    const r=resolvePlanDraft({...d,income:{expected:'0'},savings:'0',cashReviewed:true},true);
    expect(r.planningV3?.cashInvestmentBudgets).toEqual({});
    expect(r.investmentBudgets).toEqual({pension:500});
  });
  it('transfer preserves sum and rejects invalid/excess amounts',()=>{
    expect(moveCategoryLimit({a:100,b:20},'a','b',50)).toEqual({a:50,b:70});
    expect(()=>moveCategoryLimit({a:100,b:20},'a','b',101)).toThrow();
    expect(()=>moveCategoryLimit({a:100},'a','a',50)).toThrow();
  });
  it('local drafts are scoped to uid and month',()=>{
    expect(draftKey('a','2026-10')).not.toBe(draftKey('b','2026-10'));
    expect(draftKey('a','2026-10')).not.toBe(draftKey('a','2026-11'));
  });
  it('adds transfer deltas to recovered limits without replacing goals or other edits',()=>{
    const d={...createPlanDraft(initMonthlyBudget({month:'2026-10'})),savings:'123,45',limits:{a:'120',b:'25',other:'99'}};
    expect(applyLimitTransferToDraft(d,{a:100,b:20},{a:50,b:70})).toMatchObject({savings:'123,45',limits:{a:'70',b:'75',other:'99'}});
    expect(()=>applyLimitTransferToDraft({...d,limits:{a:'',b:'20'}},{a:100,b:20},{a:50,b:70})).toThrow();
  });
  it('comparison includes category, cash goals and income before replacement',()=>{
    const a={...initMonthlyBudget({month:'2026-10'}),categoryBudgets:{a:100},incomeBudgets:{salary:1000},
      planningV3:{schemaVersion:1 as const,inputsReviewedAt:1,cashInvestmentBudgets:{fund:200}}};
    const changes=planDifferences(a,{...a,categoryBudgets:{a:50},incomeBudgets:{salary:1200},planningV3:{...a.planningV3,cashInvestmentBudgets:{fund:300}}});
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({field:'categoryBudgets',id:'a',before:100,after:50}),
      expect.objectContaining({field:'cashInvestmentBudgets',id:'fund',before:200,after:300}),
      expect.objectContaining({field:'incomeBudgets',id:'salary',before:1000,after:1200}),
    ]));
  });
});
