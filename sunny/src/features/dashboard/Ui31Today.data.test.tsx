import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { Ui31Today } from './Ui31Today';
vi.mock('../../shared/hooks/useBudget',()=>({useBudget:()=>({budgetHistory:[],loading:false,error:null,fromCache:false,retry:()=>{}})}));
vi.mock('../../shared/providers/settings',()=>({useSettings:()=>({categories:[],accounts:[{id:'bank'}],enableBudget:true,settingsLoaded:true})}));
vi.mock('./RecentMovementsCard',()=>({RecentMovementsCard:()=> <p>Recenti registrati</p>}));
vi.mock('../wrapped/WrappedEntryCard',()=>({WrappedEntryCard:()=>null}));
vi.mock('../budget/useMonthlyPlan',async importOriginal=>({...await importOriginal<any>(),usePlanCalendar:()=>new Date(2026,9,19,12)}));
const render=(props:Partial<Parameters<typeof Ui31Today>[0]>)=>renderToStaticMarkup(<MemoryRouter><Ui31Today user={{uid:'test'} as User} transactions={[]} liquidity={123456} onImportCSV={()=>{}} {...props}/></MemoryRouter>);
describe('Oggi transaction reliability',()=>{
  it('does not display an assumed balance when the opening amount was deferred',()=>{
    const html=render({liquidity:0,balanceKnown:false});
    expect(html).toContain('Saldo iniziale non indicato');
    expect(html).toContain('Indica un saldo iniziale');
    expect(html).not.toContain('Saldo attuale dei conti inclusi');
  });
  it('waits for transactions before presenting any summary, balance or recent values',()=>{
    const html=render({transactionsLoading:true});
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('Saldo dei conti');
    expect(html).not.toContain('Recenti registrati');
    expect(html).not.toContain('ui31-month-number');
  });
  it('shows a recoverable transaction error without stale financial figures',()=>{
    const html=render({transactionsError:'Connessione persa'});
    expect(html).toContain('role="alert"');
    expect(html).toContain('Ricarica dati');
    expect(html).not.toContain('Saldo dei conti');
    expect(html).not.toContain('Recenti registrati');
    expect(html).not.toContain('ui31-month-number');
  });
});
