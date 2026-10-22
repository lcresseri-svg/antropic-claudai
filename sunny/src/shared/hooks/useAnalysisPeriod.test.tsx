import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { useAnalysisPeriod } from './useAnalysisPeriod';
vi.mock('../providers/UiVersionProvider',()=>({useUiVersion:()=> '3.0',useUiSessionState:(_key:string,initial:unknown)=>[initial,()=>{}]}));
function Probe(){const {period,offset}=useAnalysisPeriod('income');return <output>{period}:{offset}</output>;}
const render=(route:string)=>renderToStaticMarkup(<MemoryRouter initialEntries={[route]}><Probe/></MemoryRouter>);
afterEach(()=>vi.useRealTimers());
describe('analysis entered from a selected calendar month',()=>{
  it.each([['2026-09',1],['2025-12',10],['2026-10',0],['2026-11',-1]])('opens %s rather than the current month', (month,offset)=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(2026,9,20,12));
    expect(render(`/income?month=${month}`)).toContain(`1m:${offset}`);
  });
  it('ignores malformed month links',()=>{
    expect(render('/income?month=invalid')).toContain('1m:0');
  });
});
