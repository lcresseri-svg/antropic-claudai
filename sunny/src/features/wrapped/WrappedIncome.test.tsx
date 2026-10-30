import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {WrappedStoryBody} from './WrappedStories';
import {WrappedSummary} from './WrappedSummary';
import {buildYearWrapped} from './yearWrapped';
import type {Transaction} from '../../types';
const income=(year:number,amount:number):Transaction=>({id:`income-${year}`,date:`${year}-10-05`,amount,type:'income',category:'salary',account:'bank',description:'Stipendio'});
const model=(amount=1200,previous=1000)=>buildYearWrapped({year:2026,todayISO:'2026-10-20',transactions:[income(2026,amount),...(previous?[income(2025,previous)]:[])],getCat:id=>({id,label:id,kind:'income',icon:'',color:'#888'}),getAcc:id=>({id,label:id,icon:'',color:'#888'})});
const story=(w= model())=>renderToStaticMarkup(<WrappedStoryBody id="income" w={w}/>);
describe('Wrapped income story and positive summary',()=>{
 it('celebrates received income growth with a real amount and comparison',()=>{
  const html=story();expect(html).toContain('Entrate incassate');expect(html).toContain('sono entrati più soldi');expect(html).toContain('200,00');expect(html).toContain('+20%');
  const summary=renderToStaticMarkup(<WrappedSummary w={model()} onGoal={()=>{}}/>);expect(summary).toContain('Una buona notizia');expect(summary).toContain('Le entrate sono cresciute');
 });
 it.each([800,1000])('does not congratulate falling or unchanged income (%s)',amount=>{
  const w=model(amount),html=story(w);expect(html).not.toContain('sono entrati più soldi');
  expect(renderToStaticMarkup(<WrappedSummary w={w} onGoal={()=>{}}/>)).not.toContain('Una buona notizia');
 });
 it('keeps the income story without inventing a prior-year comparison',()=>{
  const html=story(model(1200,0));expect(html).toContain('Entrate incassate');expect(html).not.toContain('sono entrati più soldi');expect(html).not.toContain('anno scorso');
 });
 it('never describes future income as received or achieved growth',()=>{
  const w=buildYearWrapped({year:2026,todayISO:'2026-10-20',transactions:[{...income(2026,500),date:'2026-10-28'}],getCat:id=>({id,label:id,kind:'income',icon:'',color:'#888'}),getAcc:id=>({id,label:id,icon:'',color:'#888'})});
  const html=story(w);expect(html).toContain('Entrate in programma');expect(html).toContain('non ancora in tasca');expect(html).not.toContain('sono entrati più soldi');
 });
 it('states the actual comparison dates when February has different lengths',()=>{
  const w=buildYearWrapped({year:2024,todayISO:'2024-02-29',transactions:[{...income(2024,120),date:'2024-02-29'},{...income(2023,100),date:'2023-02-28'}],getCat:id=>({id,label:id,kind:'income',icon:'',color:'#888'}),getAcc:id=>({id,label:id,icon:'',color:'#888'})});
  for(const html of [story(w),renderToStaticMarkup(<WrappedSummary w={w} onGoal={()=>{}}/>)]){
   expect(html).toContain('29 febbraio 2024');expect(html).toContain('28 febbraio 2023');
  }
 });
 it('acknowledges income growth even when the final comparison shows more spending',()=>{
  const w=model();w.vsPrevYear={expensePct:0.5,savedPct:-0.5,prevExpense:1000,prevSaved:200};
  const html=renderToStaticMarkup(<WrappedStoryBody id="vsPrev" w={w}/>);expect(html).toContain('le entrate sono cresciute');
 });
});
