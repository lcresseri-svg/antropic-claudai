import {describe,it,expect} from 'vitest';
import {initMonthlyBudget} from './monthlyBudget';
import {withCategoryLimit} from './categoryLimit';
describe('single-category budget edit',()=>{
 const base={...initMonthlyBudget({month:'2026-10'}),categoryBudgets:{home:500,food:200},incomeBudgets:{salary:2000},savingsTarget:300,status:'confirmed' as const,planningV3:{schemaVersion:1 as const,inputsReviewedAt:123,cashInvestmentBudgets:{fund:100}}};
 it('changes only the selected limit and preserves review, goals and other categories',()=>{
  const result=withCategoryLimit(base,'food','250,50');
  expect(result).toEqual({...base,categoryBudgets:{home:500,food:250.5},source:'manual'});
  expect(base.categoryBudgets.food).toBe(200);
 });
 it('removes only this limit with zero or the explicit remove action',()=>{
  expect(withCategoryLimit(base,'food','0').categoryBudgets).toEqual({home:500});
  expect(withCategoryLimit(base,'food',null).categoryBudgets).toEqual({home:500});
 });
 it('rejects empty, invalid and negative input without treating it as removal',()=>{
  for(const input of ['', '-10', 'abc','1,234'])expect(()=>withCategoryLimit(base,'food',input)).toThrow();
 });
 it('allows an unreviewed plan to keep its original unreviewed state',()=>{
  const empty=initMonthlyBudget({month:'2026-11'});const next=withCategoryLimit(empty,'food','150');
  expect(next.planningV3).toEqual(empty.planningV3);expect(next.status).toBe(empty.status);expect(next.incomeBudgets).toEqual(empty.incomeBudgets);
 });
});
