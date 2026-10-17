import { describe, expect, it } from 'vitest';
import { portfolioHistory } from './portfolioHistory';
import type { CategoryDef, Transaction } from '../../types';
const cat = (over: Partial<CategoryDef> = {}): CategoryDef => ({id:'fund',label:'Fondo',kind:'investment',icon:'',color:'#fff',initialBalance:1000,subscriptionDate:'2024-01-01',...over});
const tx = (over: Partial<Transaction> = {}): Transaction => ({id:'t',description:'Versamento',type:'investment',category:'fund',account:'a',date:'2026-07-10',amount:100,...over});
describe('portfolio capital history', () => {
 it('keeps all years, cash contributions and withdrawals, not statistical spreading', () => {
  const points=portfolioHistory([cat()], [tx({statsSpreadMonths:12}),tx({id:'out',date:'2026-09-02',direction:'out',amount:50})], '2026-10-17');
  expect(points).toHaveLength(34);
  expect(points[0]).toEqual({key:'2024-01',versato:1000});
  expect(points.find(p=>p.key==='2026-07')?.versato).toBe(1100);
  expect(points[33]).toEqual({key:'2026-10',versato:1050});
 });
 it('excludes future, projected and archived movements and positions', () => {
  const points=portfolioHistory([cat(),cat({id:'old',archived:true})], [tx({date:'2026-11-01'}),tx({projected:true}),tx({category:'old'})], '2026-10-17');
  expect(points.every(p=>p.versato===1000)).toBe(true);
 });
 it('dates new opening capital without moving it into earlier months', () => {
  const points=portfolioHistory([cat(),cat({id:'new',subscriptionDate:'2026-09-01',initialBalance:500})], [], '2026-10-17');
  expect(points.find(p=>p.key==='2026-08')?.versato).toBe(1000);
  expect(points[33].versato).toBe(1500);
 });
 it('handles a single known month and clamps each position separately', () => {
  expect(portfolioHistory([cat({subscriptionDate:undefined})], [], '2026-10-17')).toEqual([{key:'2026-10',versato:1000}]);
  const points=portfolioHistory([cat()], [tx({direction:'out',amount:2000})], '2026-10-17');
  expect(points[33].versato).toBe(0);
 });
});
