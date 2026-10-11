import { describe, it, expect } from 'vitest';
import { selectMonthlyPlan, localDay } from './monthlyPlanSelectors';
import { initMonthlyBudget } from './monthlyBudget';
import { Transaction } from '../../types';
const now = new Date(2026, 9, 10, 12);
const plan = { ...initMonthlyBudget({ month: '2026-10' }), status: 'confirmed' as const,
  incomeBudgets: { salary: 2400 }, savingsTarget: 400, categoryBudgets: { a: 1700 },
  planningV3: { schemaVersion: 1 as const, inputsReviewedAt: 1, cashInvestmentBudgets: { fund: 200 } } };
const tx = (id: string, amount: number, over: Partial<Transaction> = {}): Transaction =>
  ({ id, amount, type: 'expense', category: 'a', date: '2026-10-05', account: 'bank', description: id, ...over });
const select = (transactions: Transaction[], p = plan, month = '2026-10') =>
  selectMonthlyPlan({ month, now, plan: p, transactions, categories: [], forecast: { total: 1600, byCategory: {} } });
describe('Piano contract (amounts in cents)', () => {
  it('includes forecast-only categories without reserving their estimate or doubling actuals', () => {
    const r=selectMonthlyPlan({month:'2026-10',now,plan,transactions:[tx('spent',900),tx('due',350,{date:'2026-10-20'})],categories:[],
      forecast:{total:1750,byCategory:{a:1600,historyOnly:150,empty:0}}});
    expect(r.categories.find(c=>c.id==='historyOnly')).toMatchObject({forecast:15000,spent:0,scheduled:0,limit:null,remaining:null});
    expect(r.categories.find(c=>c.id==='a')).toMatchObject({forecast:160000,spent:90000,scheduled:35000,remaining:45000});
    expect(r.categories.some(c=>c.id==='empty')).toBe(false);
    expect([r.M,r.U]).toEqual([55000,10000]);
  });
  it('preserves an explicit zero forecast, distinguishes missing estimates and flags forecast risk', () => {
    const r=selectMonthlyPlan({month:'2026-10',now,plan:{...plan,categoryBudgets:{a:100,b:100,c:100}},transactions:[],categories:[],
      forecast:{total:150,byCategory:{a:150,b:0}}});
    expect(r.categories.find(c=>c.id==='a')).toMatchObject({forecast:15000,state:'forecast-risk'});
    expect(r.categories.find(c=>c.id==='b')?.forecast).toBe(0);
    expect(r.categories.find(c=>c.id==='c')?.forecast).toBeNull();
  });
  it.each(['2026-09','2026-11'])('does not leak current forecast-only categories into %s', month=>{
    const r=selectMonthlyPlan({month,now,plan,transactions:[],categories:[],forecast:{total:150,byCategory:{historyOnly:150}}});
    expect(r.categories.some(c=>c.id==='historyOnly')).toBe(false);
    expect(r.categories.every(c=>c.forecast===null)).toBe(true);
  });
  it('separates margin, cushion and forecast without counting commitments twice', () => {
    const r = select([tx('spent', 900), tx('due', 350, { date: '2026-10-20' }), tx('invest', 200, { type: 'investment' })]);
    expect([r.E, r.S, r.Ir, r.A, r.C, r.P, r.M, r.U, r.forecastGap]).toEqual([240000,40000,20000,90000,35000,180000,55000,10000,20000]);
  });
  it('cash investment includes non-TFR only, never external capital or withdrawals', () => {
    const r = select([tx('fund',300,{ type:'investment',tfr:100 }),tx('external',900,{type:'investment',account:''}),
      tx('withdraw',800,{type:'investment',direction:'out'}),tx('future',60,{type:'investment',date:'2026-10-20'})]);
    expect([r.It,r.Ia,r.Ic,r.Ir,r.P,r.E]).toEqual([20000,20000,6000,26000,174000,240000]);
  });
  it('unlimited and archived/unknown categories remain in totals', () => {
    const r = select([tx('a',80,{category:'unknown'}),tx('b',20,{category:'unknown',date:'2026-10-20'})]);
    const row = r.categories.find(c=>c.id==='unknown')!;
    expect([row.limit,row.remaining,row.state,r.A,r.C]).toEqual([null,null,'unlimited',8000,2000]);
  });
  it('remaining subtracts scheduled and explains overrun', () => {
    const r = select([tx('a',150),tx('b',80,{date:'2026-10-20'})],{...plan,categoryBudgets:{a:200}});
    expect(r.categories[0]).toMatchObject({remaining:-3000,state:'committed-over'});
  });
  it('annual expense is counted once, in full, only in its due month', () => {
    const t=tx('annual',120,{date:'2026-10-20',recurring:{freq:'yearly'},seriesId:'series'});
    expect(select([t]).C).toBe(12000);
    expect(select([t],plan,'2026-11').C).toBe(0);
  });
  it('deduplicates templates, materialized and virtual occurrences by series/date', () => {
    const t=tx('template',100,{date:'2026-10-11',recurring:{freq:'weekly'},seriesId:'s'});
    const r=select([t,tx('real',100,{date:'2026-10-18',seriesId:'s'}),tx('virtual',100,{date:'2026-10-18',seriesId:'s',projected:true})]);
    expect(r.C).toBe(30000);
    expect(r.upcoming).toHaveLength(3);
  });
  it('received refunds reduce original statistical expense once; future refunds do not', () => {
    const r=select([tx('original',100,{refundedTotal:80}),tx('r',40,{type:'refund',refundOf:'original'}),
      tx('later',40,{type:'refund',refundOf:'original',date:'2026-10-20'}), tx('internal',500,{type:'transfer'})]);
    expect([r.A,r.C,r.receivedIncome]).toEqual([6000,0,0]);
  });
  it('refund of previous month never becomes ordinary current income', () => {
    expect(select([tx('old',100,{date:'2026-09-01'}),tx('r',40,{type:'refund',refundOf:'old'})]).receivedIncome).toBe(0);
  });
  it('unreviewed plan has no availability; reviewed zero may be negative', () => {
    expect(select([],{...plan,planningV3:{...plan.planningV3,inputsReviewedAt:0}}).M).toBeNull();
    expect(select([],{...plan,incomeBudgets:{salary:0}}).M).toBe(-60000);
  });
  it('future/past never expose current forecast, future has no realized spending', () => {
    expect(select([tx('f',90,{date:'2026-11-02'})],plan,'2026-11')).toMatchObject({A:0,C:9000,forecast:null});
    expect(select([],plan,'2026-09').forecast).toBeNull();
  });
  it('local date handles near midnight and DST without UTC slicing', () => {
    for (const d of [new Date(2026,9,1,0,5),new Date(2026,9,25,0,5),new Date(2026,2,29,23,55)])
      expect(localDay(d)).toBe(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  });
  it('financial month/day membership follows injected local midnight and DST',()=>{
    const rows=[tx('sep',10,{date:'2026-09-30'}),tx('oct',20,{date:'2026-10-01'}),tx('tomorrow',30,{date:'2026-10-02'})];
    const r=selectMonthlyPlan({month:'2026-10',now:new Date(2026,9,1,0,5),plan,transactions:rows,categories:[]});
    expect([r.A,r.C]).toEqual([2000,3000]);
    const dst=selectMonthlyPlan({month:'2026-03',now:new Date(2026,2,29,0,5),plan,transactions:[
      tx('today',10,{date:'2026-03-29'}),tx('next',20,{date:'2026-03-30'})],categories:[]});
    expect([dst.A,dst.C]).toEqual([1000,2000]);
  });
  it('uses integer cents including shared expenses', () => {
    const r=select([tx('a',0.3,{shared:0.1}),tx('b',0.1)]);
    expect(r.A).toBe(30);
  });
  it('shows an archived category and keeps its amount',()=>{
    const r=selectMonthlyPlan({month:'2026-10',now,plan,transactions:[tx('a',12)],
      categories:[{id:'a',label:'Vecchia',icon:'📁',kind:'expense',archived:true,color:'#888'}]});
    expect(r.categories[0]).toMatchObject({label:'Vecchia',archived:true,spent:1200});
  });
});
