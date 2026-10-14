import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {PlanEditor} from './PlanEditor';
import {initMonthlyBudget} from './monthlyBudget';
vi.mock('../../shared/providers/UiVersionProvider',()=>({useUiVersion:()=> '3.0'}));
vi.mock('./PlanDialog',()=>({PlanDialog:({children}:any)=><section>{children}</section>}));
describe('focused category editor',()=>{
 it('can set a historical archived category limit even without a saved limit',()=>{
  const html=renderToStaticMarkup(<PlanEditor uid="test" month="2026-09" plan={initMonthlyBudget({month:'2026-09'})} categories={[{id:'old',label:'Vecchia categoria',icon:'★',color:'#999',kind:'expense',archived:true}]} transactions={[]} now={new Date('2026-10-14T12:00:00Z')} section="expenses" focusCategory="old" onSave={async(_,p)=>p} onClose={()=>{}}/>);
  expect(html).toContain('aria-label="Limite Vecchia categoria"');
  expect((html.match(/<input/g)??[]).length).toBe(1);
  expect(html).not.toContain('Passi del piano');
 });
});
