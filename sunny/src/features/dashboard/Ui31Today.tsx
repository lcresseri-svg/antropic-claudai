import { ReactNode } from 'react';
import { User } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { formatCurrency } from '../../utils';
import { useBudget } from '../../shared/hooks/useBudget';
import { useSettings } from '../../shared/providers/settings';
import { calculateMonthlyPlan, usePlanCalendar } from '../budget/useMonthlyPlan';
import { monthKeyOf, prevMonthKey } from '../budget/monthlyBudget';
import { TodayMonthSummary, TodayPriorities } from './Ui31TodaySummary';
import { RecentMovementsCard } from './RecentMovementsCard';
import { WrappedEntryCard } from '../wrapped/WrappedEntryCard';
import { Ui31SpendingComposition } from '../budget/Ui31MonthCharts';
import './ui31-today.css';
interface Props {
  balanceKnown?:boolean;
  transactionsLoading?:boolean;transactionsError?:string|null;rawTransactions?:Transaction[];user?:User;userId?:string;greeting?:string;transactions:Transaction[];projected?:Transaction[];liquidity:number;
  priority?:ReactNode;additionalPriorities?:ReactNode;additionalPriorityCount?:number;
  onEditTransaction?:(transaction:Transaction)=>void;onImportCSV:()=>void;
}
export function Ui31Today(p:Props) {
  const now=usePlanCalendar(),navigate=useNavigate(),settings=useSettings(),store=useBudget(p.user??null);
  const month=monthKeyOf(now),plan=store.budgetHistory.find(b=>b.month===month)??null;
  const view=calculateMonthlyPlan(month,now,settings.enableBudget?plan:null,p.rawTransactions??p.transactions,settings.categories,store.budgetHistory);
  const hasAccounts=settings.accounts.length>0;
  if(p.transactionsLoading||p.transactionsError||settings.settingsLoaded===false)return <div className="ui31-today"><header className="ui31-today-heading"><h1>Oggi</h1><p>{now.toLocaleDateString('it-IT',{day:'numeric',month:'long'})}</p></header>
    {p.transactionsError?<section className="ui31-month-summary" role="alert"><h2>Sintesi non disponibile</h2><p>I movimenti non sono affidabili al momento: {p.transactionsError}. Nessun saldo o margine viene presunto.</p><button onClick={()=>window.location.reload()}>Ricarica dati</button></section>:<section className="ui31-month-summary" role="status" aria-busy="true"><h2>Il tuo mese</h2><p>Caricamento dei movimenti…</p></section>}
  </div>;
  return <div className="ui31-today">
    <header className="ui31-today-heading"><div><h1>Oggi</h1><p>{now.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'})}</p></div><Link to={`/budget?view=overview&month=${month}`}>Il tuo mese <span aria-hidden="true">›</span></Link></header>
    {p.userId&&<div data-liquid-preserve style={{display:'contents'}}><WrappedEntryCard transactions={p.transactions} projected={p.projected??[]} userId={p.userId} onOpen={year=>navigate(`/wrapped/${year}`)}/></div>}
    {!hasAccounts?<section className="ui31-month-summary"><p className="ui31-metric-label">Da dove vuoi partire?</p><h2>Aggiungi il tuo primo conto</h2><p>Il saldo sarà quello che dichiari tu. Puoi anche partire dai movimenti di un file CSV.</p><Link className="ui31-primary-link" to="/settings?section=accounts">Aggiungi un conto <span aria-hidden="true">›</span></Link><button onClick={p.onImportCSV}>Importa CSV</button></section>:
      <TodayMonthSummary view={view} plan={plan} enabled={settings.enableBudget} loading={settings.enableBudget&&!!p.user&&store.loading} error={settings.enableBudget&&p.user?store.error:null} onRetry={store.retry} fromCache={!!p.user&&store.fromCache}/>}
    <TodayPriorities first={p.priority} additional={p.additionalPriorities} additionalCount={p.additionalPriorityCount}/>
    <div className="ui31-today-support">
      <section className="ui31-today-balance"><div className="ui31-section-heading"><h2>Saldo dei conti</h2><Link to="/wealth">Patrimonio <span aria-hidden="true">›</span></Link></div>{!hasAccounts?<p>Il saldo sarà disponibile dopo l’aggiunta di un conto.</p>:p.balanceKnown===false?<><p>Saldo iniziale non indicato. Nessun saldo viene presunto prima dei dati registrati.</p><Link to="/settings?section=accounts">Indica un saldo iniziale <span aria-hidden="true">›</span></Link></>:<><strong>{formatCurrency(p.liquidity)}</strong><p>Saldo ricostruito dai movimenti e dai saldi iniziali indicati. Distinto dal margine del piano.</p></>}
        {(!settings.enableBudget||(!store.loading&&!store.error))&&<Ui31SpendingComposition registered={view.A} scheduled={view.C}/>}
        <Link to={`/budget?view=overview&month=${month}`}>Leggi i flussi del mese <span aria-hidden="true">›</span></Link>
      </section>
      <div className="ui31-today-recent"><RecentMovementsCard transactions={p.transactions} now={now} onSeeAll={()=>navigate('/transactions')} onOpenTransaction={p.onEditTransaction}/></div>
    </div>
    <footer className="ui31-today-footer"><Link to={`/budget?view=due&month=${month}`}>Scadenze del mese</Link><Link to={`/recap/${prevMonthKey(month)}`}>Riepilogo del mese scorso</Link></footer>
  </div>;
}
