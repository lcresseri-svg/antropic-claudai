import {describe,it,expect} from 'vitest';
import {buildWrappedMacroAreas,buildWrappedFrequentExpense} from './wrappedSpendingStories';
import {buildYearWrapped} from './yearWrapped';
import type {CategoryDef,MacroCategoryDef,Transaction} from '../../types';
const defs:CategoryDef[]=[
 {id:'rent',label:'Affitto',icon:'🏠',color:'#888888',kind:'expense',macroCategoryId:'home'},
 {id:'bills',label:'Bollette',icon:'💡',color:'#888888',kind:'expense',macroCategoryId:'home'},
 {id:'food',label:'Pranzo',icon:'🍝',color:'#888888',kind:'expense'},
];
const macros:MacroCategoryDef[]=[{id:'home',label:'Casa e vita',icon:'🏡',color:'#8FB0A0'}];
const getCat=(id:string)=>defs.find(c=>c.id===id)!;
const getAcc=(id:string)=>({id,label:'Banca',icon:'🏦',color:'#888888'});
const tx=(id:string,date:string,over:Partial<Transaction>={}):Transaction=>({id,date,description:'Caffè',amount:10,type:'expense',category:'food',account:'bank',...over});
const build=(transactions:Transaction[],extra={})=>buildYearWrapped({year:2026,todayISO:'2026-10-20',transactions,getCat,getAcc,macroCategories:macros,...extra});
const repeated=[tx('a','2026-01-01'),tx('b','2026-02-02'),tx('c','2026-03-03')];
describe('Wrapped macro areas',()=>{
 it('preserves totals, metadata and unassigned categories without mixing investment macros',()=>{
  const w=build([tx('r','2026-01-01',{category:'rent',amount:700,shared:100,refundedTotal:50}),tx('b','2026-01-02',{category:'bills',amount:100}),tx('f','2026-01-03',{amount:50})]);
  expect(w.macroAreas).toEqual([
   expect.objectContaining({id:'home',label:'Casa e vita',icon:'🏡',color:'#8FB0A0',total:650,share:650/700,categoryCount:2}),
   expect.objectContaining({id:null,label:'Senza macrocategoria',total:50,categoryCount:1}),
  ]);
  expect(w.macroAreas.reduce((s,g)=>s+g.total,0)).toBe(w.expenseTotal);
  expect(w.stories.indexOf('macroAreas')).toBeLessThan(w.stories.indexOf('topCategory'));
  expect(buildWrappedMacroAreas(w.categories,getCat,[{...macros[0],kind:'investment'}]).every(g=>g.id===null)).toBe(true);
 });
 it('does not resurrect deleted definitions or manufacture a story without assignments',()=>{
  const w=build([tx('r','2026-01-01',{category:'rent'}),tx('b','2026-01-02',{category:'bills'})],{macroCategories:[]});
  expect(w.macroAreas).toEqual([expect.objectContaining({id:null,total:20})]);expect(w.stories).not.toContain('macroAreas');
  expect(build([tx('r','2026-01-01',{category:'rent'})]).stories).not.toContain('macroAreas');
 });
 it('supports legacy assignments when definitions are omitted, but respects explicit deletion',()=>{
  const legacy=(id:string)=>({...getCat(id),macroCategoryId:undefined,macroCategory:'Casa'});
  const w=build([tx('r','2026-01-01',{category:'rent'}),tx('b','2026-01-02',{category:'bills'})],{getCat:legacy,macroCategories:undefined});
  expect(w.macroAreas[0]).toMatchObject({id:'legacy:casa',label:'Casa',total:20});
  expect(buildWrappedMacroAreas(w.categories,legacy,[])[0].id).toBeNull();
 });
 it('keeps programmed amounts in macro totals, using current archived assignments too',()=>{
  const w=build([tx('r','2026-01-01',{category:'rent'}),tx('b','2026-10-28',{category:'bills',amount:30})],{getCat:(id:string)=>({...getCat(id),archived:true})});
  expect(w.macroAreas[0].total).toBe(40);expect(w.expenseTotal).toBe(40);expect(w.hasPlanned).toBe(true);
 });
});
describe('Wrapped frequent expense',()=>{
 it('counts matching normalized descriptions within their category and uses personal net costs',()=>{
  const w=build([repeated[0],{...repeated[1],description:' CAFFÈ ',shared:2},{...repeated[2],description:'Caffè',refundedTotal:3},tx('other','2026-04-04',{category:'rent'})]);
  expect(w.frequentExpense).toMatchObject({description:'Caffè',count:3,total:25,average:8.33,months:3,source:'description'});
  expect(w.stories).toContain('frequentExpense');expect(w.stories).not.toContain('count');
  expect(w.stories.indexOf('largest')).toBe(w.stories.indexOf('topCategory')+1);
  expect(w.stories.indexOf('frequentExpense')).toBe(w.stories.indexOf('largest')+1);
 });
 it('tracks a series across renamed descriptions and categories',()=>{
  const result=buildWrappedFrequentExpense(repeated.map((t,i)=>({...t,seriesId:'s1',description:['Old','New','New'][i],category:i?'rent':'food'})),getCat);
  expect(result).toMatchObject({description:'New',count:3,total:30,source:'series'});
 });
 it('requires three actual positive expenses on three distinct dates, never projected or programmed records',()=>{
  const w=build([...repeated.slice(0,2),tx('future','2026-10-28'),tx('refund','2026-03-03',{refundedTotal:10}),tx('shared','2026-03-04',{shared:10}),tx('transfer','2026-03-05',{type:'transfer'}),tx('refund-row','2026-03-06',{type:'refund'})],{projected:[tx('p','2026-10-29',{projected:true})]});
  expect(w.frequentExpense).toBeNull();expect(w.stories).toContain('count');
  expect(buildWrappedFrequentExpense(repeated.map(t=>({...t,date:'2026-01-01'})),getCat)).toBeNull();
 });
 it('does not group blank manual descriptions or claim an unknown habit',()=>{
  expect(buildWrappedFrequentExpense(repeated.map(t=>({...t,description:'  '})),getCat)).toBeNull();
  expect(buildWrappedFrequentExpense(repeated.map(t=>({...t,description:'',seriesId:'s'})),getCat)).toMatchObject({description:'Pranzo',source:'series'});
 });
 it('ranks equal cent totals identically when floating sums and input order differ',()=>{
  const rows=[...repeated.map((t,i)=>({...t,description:'A',amount:[0.1,0.2,0.3][i]})),...repeated.map((t,i)=>({...t,id:'b'+t.id,description:'B',amount:[0.3,0.2,0.1][i]}))];
  expect(buildWrappedFrequentExpense(rows,getCat)).toMatchObject({description:'A',total:0.6,average:0.2});
  expect(buildWrappedFrequentExpense([...rows].reverse(),getCat)).toEqual(buildWrappedFrequentExpense(rows,getCat));
 });
 it('breaks ties deterministically, without fuzzy merchant or amount matching',()=>{
  const other=repeated.map(t=>({...t,id:'z'+t.id,description:'Pranzo',amount:20}));
  const result=buildWrappedFrequentExpense([...repeated,...other],getCat);
  expect(result?.description).toBe('Pranzo');
  expect(buildWrappedFrequentExpense([...other,...repeated].reverse(),getCat)).toEqual(result);
  expect(buildWrappedFrequentExpense(repeated.map((t,i)=>({...t,description:['Caffe','Caffè','Caffè bar'][i]})),getCat)).toBeNull();
 });
});
