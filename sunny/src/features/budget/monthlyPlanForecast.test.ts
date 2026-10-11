import {it,expect} from 'vitest';
import {calculateMonthlyPlan} from './useMonthlyPlan';
import {Transaction,CategoryDef} from '../../types';
it.each([['weekly',300],['daily',2100]] as const)('V4 includes every deduplicated %s occurrence included in C',(freq,total)=>{
  const now=new Date(2026,9,10,12);
  const cat:CategoryDef={id:'casa',label:'Casa',icon:'🏠',color:'#888',kind:'expense'};
  const tx=(id:string,date:string,amount:number):Transaction=>({id,date,amount,type:'expense',category:'casa',account:'bank',description:'Affitto'});
  const rows=[tx('july','2026-07-01',400),tx('aug','2026-08-01',400),tx('sep','2026-09-01',400),
    {...tx('template','2026-10-11',100),seriesId:'s',recurring:{freq}},
    {...tx('materialized','2026-10-18',100),seriesId:'s'}];
  const result=calculateMonthlyPlan('2026-10',now,null,rows,[cat],[]);
  expect(result.C).toBe(total*100);
  expect(result.forecast!.total).toBeGreaterThanOrEqual(total);
  expect(result.forecast!.byCategory.casa).toBe(total);
});
