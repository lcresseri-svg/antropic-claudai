import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { TodayMonthSummary, TodayPriorities } from './Ui31TodaySummary';
import { initMonthlyBudget, MonthlyBudget } from '../budget/monthlyBudget';
import { selectMonthlyPlan } from '../budget/monthlyPlanSelectors';
import { Transaction } from '../../types';
const now = new Date(2026, 9, 19, 12);
const plan: MonthlyBudget = { ...initMonthlyBudget({ month: '2026-10' }), status: 'confirmed', incomeBudgets: { salary: 2400 }, savingsTarget: 400,
  planningV3: { schemaVersion: 1, inputsReviewedAt: 1, cashInvestmentBudgets: { fund: 200 } } };
const transaction: Transaction = {id:'expense',type:'expense',amount:900,category:'food',account:'bank',date:'2026-10-01',description:'Spesa'};
const render = (p: Partial<Parameters<typeof TodayMonthSummary>[0]> = {}, budget: MonthlyBudget | null = plan) => renderToStaticMarkup(<MemoryRouter><TodayMonthSummary
  view={selectMonthlyPlan({ month:'2026-10', now, plan:budget, transactions:[transaction], categories:[] })}
  plan={budget} enabled loading={false} error={null} onRetry={()=>{}} {...p}/></MemoryRouter>);
describe('Oggi month hierarchy', () => {
  it('qualifies confirmed margin beside expected income and links to the plan', () => {
    const html=render();
    expect(html).toContain('Margine del piano');
    expect(html).toContain('Confermato');
    expect(html).toContain('Il margine dipende');
    expect(html).toContain('/budget?view=plan');
    expect(html).not.toContain('Liquidità libera');
  });
  it('labels a calculable draft as unconfirmed', () => {
    const html=render({}, {...plan,status:'draft'});
    expect(html).toContain('Margine della bozza');
    expect(html).toContain('Da confermare');
    expect(html).toContain('Rivedi e conferma');
  });
  it.each(['missing','disabled','incomplete'] as const)('%s shows registered expenses without presumed margin', state => {
    const budget=state==='missing'?null:state==='incomplete'?{...plan,planningV3:undefined}:plan;
    const html=render({enabled:state!=='disabled'},budget);
    expect(html).toContain('Uscite registrate');
    expect(html).not.toContain('Margine del piano');
    expect(html).toContain(state==='incomplete'?'Completa le entrate':'/budget?view=overview');
  });
  it('does not replace an error with a financial zero', () => {
    const html=render({error:'Connessione persa'});
    expect(html).toContain('role="alert"');
    expect(html).toContain('Riprova');
    expect(html).not.toContain('ui31-month-number');
  });
  it('keeps a negative margin and its consequence explicit', () => {
    const html=render({}, {...plan,incomeBudgets:{salary:100}});
    expect(html).toContain('Il piano supera le risorse');
    expect(html).toContain('Rivedi piano');
  });
  it('keeps the first priority visible when more priorities exist', () => {
    const html=renderToStaticMarkup(<TodayPriorities first={<p>Conferma pagamento negozio</p>} additional={<p>Scadenza affitto</p>} additionalCount={2}/>);
    expect(html.indexOf('Conferma pagamento negozio')).toBeLessThan(html.indexOf('<details'));
    expect(html).toContain('Altri 2 elementi');
  });
});
