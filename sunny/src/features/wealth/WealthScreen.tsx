import '../dashboard/ui31Analysis.css';
import {DataHeadline} from '../../shared/components/DataHeadline';
import {useUiVersion} from '../../shared/providers/UiVersionProvider';
// Tab "Patrimonio" — la casa di tutto ciò che prima stava in fondo alla home.
//
// La home risponde a "quanto posso spendere?"; questa schermata risponde a
// "quanto ho?". Da qui il taglio: patrimonio in cima con il suo andamento a 12
// mesi, la scomposizione in liquidità e investito, e poi i due dettagli che il
// redesign ha tolto dalla home — saldo per conto e investimenti per categoria,
// riusando le card che già esistevano (AccountsCard, InvestmentSummaryCard)
// invece di riscriverle.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { accountDelta } from '../../shared/financialFlow';
import { isPending } from '../../shared/recurrence';
import { formatCurrency } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { buildWealthHistory } from '../dashboard/wealthAnalytics';
import { localISO } from '../dashboard/categoryAnalytics';
import { WealthLineChart } from '../dashboard/WealthLineChart';
import { useIsDesktop } from '../../shared/hooks/useMediaQuery';
import { AccountsCard } from '../dashboard/AccountsCard';
import { InvestmentSummaryCard } from '../dashboard/InvestmentSummaryCard';
import { buildCommitments } from './commitments';
import { CommitmentsEntryRow } from './CommitmentsEntryRow';
import { AvailableCashSummary } from './AvailableCashSummary';
import { computeAvailableCash } from './availableCash';
import { hasRecordedAccountBalance } from '../../shared/accountBalanceAvailability';

interface Props {
  transactions: Transaction[];
  rawTransactions?: Transaction[];
  showAvailableCash?: boolean;
  loading?: boolean;
  error?: string | null;
  netWorth: number;
  liquidity: number;
  investmentTotal: number;
  accountBalances: Record<string, number>;
  investmentByCategory: Record<string, number>;
  /** Il flag `commitments` è acceso per questo utente. Spento: nessuna riga,
   *  nessun link morto verso una schermata che non si può aprire. */
  showCommitments?: boolean;
}

export function WealthScreen(p: Props) {
  const ui3=useUiVersion()==='3.0';
  const navigate = useNavigate();
  const { accounts, categories, enableInvestments, includeInvestments, cashReserve, settingsLoaded } = useSettings();
  const [accMode, setAccMode] = useState<'balance' | 'spending'>('balance');
  // Su desktop il grafico cresce: l'altezza è un numero che entra nell'SVG,
  // quindi non si può esprimere con una variante Tailwind.
  const isDesktop = useIsDesktop();

  const now = useMemo(() => new Date(), []);
  const balanceKnown = hasRecordedAccountBalance(accounts,p.accountBalances);
  const cash = useMemo(() => ui3 && p.showAvailableCash && balanceKnown && !p.loading && !p.error && settingsLoaded !== false
    ? computeAvailableCash({ transactions: p.rawTransactions ?? p.transactions, liquidity: p.liquidity, horizon: 'eom', reserve: cashReserve ?? 0, now, accounts }) : null,
  [ui3, p.showAvailableCash, balanceKnown, p.loading, p.error, p.rawTransactions, p.transactions, p.liquidity, cashReserve, settingsLoaded, now, accounts]);

  // Andamento a 12 mesi + variazione sugli ultimi 3, dallo stesso motore della
  // schermata "Andamento patrimonio": una sola definizione di patrimonio.
  const wealth = useMemo(() => {
    const points = buildWealthHistory(p.transactions, accounts, categories, '1y', { now });
    const value = (i: number) => (includeInvestments ? points[i]?.total : points[i]?.liquidity) ?? 0;
    // Tre mesi indietro = tre punti indietro (a 1 anno il passo è mensile).
    const from = Math.max(0, points.length - 4);
    const delta = value(points.length - 1) - value(from);
    return { points, delta, hasHistory: points.length >= 2 };
  }, [p.transactions, accounts, categories, includeInvestments, now]);

  // Spese e investimenti del mese per conto: servono alla vista "Vedi spese"
  // di AccountsCard, che resta identica a com'era in home.
  const { expenseByAccount, investByAccount } = useMemo(() => {
    const todayISO = localISO(now);
    const ym = todayISO.slice(0, 7);
    const expense: Record<string, number> = {};
    const invest: Record<string, number> = {};
    for (const t of p.transactions) {
      if (t.date.slice(0, 7) !== ym || isPending(t, todayISO)) continue;
      if (t.type === 'expense') {
        expense[t.account] = (expense[t.account] ?? 0) + ownShare(t);
      } else if (t.type === 'investment' && t.account) {
        invest[t.account] = (invest[t.account] ?? 0) - accountDelta(t, t.account);
      }
    }
    return { expenseByAccount: expense, investByAccount: invest };
  }, [p.transactions, now]);

  // Quanto del mese è già promesso. Sta qui perché è la seconda metà della
  // domanda a cui questa schermata risponde: i saldi e gli investimenti sono
  // ciò che possiedi, gli impegni sono ciò che è già di qualcun altro.
  const fixedMonthlyCost = useMemo(
    () => (p.showCommitments ? buildCommitments(p.transactions, localISO(now)).fixedMonthlyCost : 0),
    [p.showCommitments, p.transactions, now],
  );

  const share = (v: number) => (p.netWorth > 0 ? Math.round((v / p.netWorth) * 100) : 0);

  if(ui3 && (p.loading || p.error || settingsLoaded === false || (!balanceKnown && p.investmentTotal === 0))) return <div className="ui-family-wealth ui31-wealth"><h1 className="text-xl font-semibold mb-6">Patrimonio</h1><section className="ui31-cash-summary" role={p.error?'alert':p.loading||settingsLoaded===false?'status':undefined}>
    <h2>{p.error?'Sintesi non disponibile':p.loading||settingsLoaded===false?'Caricamento del patrimonio…':'Saldo iniziale non indicato'}</h2>
    <p>{p.error?'I dati non sono affidabili al momento. Nessun patrimonio o liquidità viene presunto.':p.loading||settingsLoaded===false?'Sto caricando conti e movimenti.':'Puoi indicare un saldo iniziale o registrare i primi movimenti. Un saldo assente resta distinto da uno zero dichiarato.'}</p>
    {p.error?<button onClick={()=>window.location.reload()}>Ricarica dati</button>:!p.loading&&settingsLoaded!==false&&<button onClick={()=>navigate('/settings?section=accounts')}>Indica un saldo iniziale</button>}
  </section></div>;

  return (
    <div className="ui-family-wealth ui31-wealth pb-32 md:pb-6">
      <div className="h-14 flex items-center justify-between md:h-auto md:mb-5">
        <h1 className="text-[17px] md:text-xl font-semibold text-primary tracking-[-0.03em]">Patrimonio</h1>
        <button type="button" onClick={() => navigate('/wealth-history')}
          className="text-[12px] font-medium text-gold">
          Storico ›
        </button>
      </div>

      {/* Desktop: due colonne indipendenti in altezza, come la home. */}
      <div className="ui-wealth-layout flex flex-col wide:flex-row gap-3.5 md:gap-4 ultra:gap-6 wide:items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 wide:flex-1 wide:min-w-0">
        {/* Hero: il patrimonio e come si è mosso */}
        <section className="hero-card rounded-[26px] shadow-elev-2 p-[22px] animate-rise-in">
          {ui3 ? <DataHeadline label={balanceKnown?'Patrimonio netto':'Capitale investito registrato'} value={balanceKnown?p.netWorth:p.investmentTotal} period={!balanceKnown?(includeInvestments?'Saldo dei conti non indicato · patrimonio totale da completare':'Investimenti esclusi dal patrimonio · saldo dei conti non indicato'):includeInvestments?'Saldo ricostruito dei conti inclusi + capitale investito · non controvalore di mercato':'Saldo ricostruito dei conti inclusi · investimenti esclusi dal totale'}/> : <>          <p className="label-caps text-secondary mb-2">Patrimonio netto</p>
          <p className="balance-num text-[38px] leading-none font-bold text-primary">
            {formatCurrency(p.netWorth)}
          </p>
</>}
          {(!ui3||balanceKnown) && wealth.hasHistory && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className={`text-[11.5px] font-semibold rounded-full px-2 py-[3px] ${
                wealth.delta >= 0 ? 'text-green bg-green/[0.14]' : 'text-red bg-red/[0.14]'}`}>
                {formatCurrency(wealth.delta, { sign: true })}
              </span>
              <span className="text-[11.5px] text-secondary">negli ultimi 3 mesi</span>
            </div>
          )}
          {(!ui3||balanceKnown) && (wealth.hasHistory || (ui3 && wealth.points.length > 0)) && (
            <div className="mt-4 -mx-1">
              <WealthLineChart points={wealth.points} formatValue={formatCurrency} height={ui3 ? isDesktop ? 200 : 144 : isDesktop ? 140 : 112} includeInvestments={ui3 ? includeInvestments : true} />
            </div>
          )}
          {ui3 && balanceKnown && includeInvestments && p.netWorth > 0 && p.liquidity >= 0 && p.investmentTotal >= 0 && <div className="ui31-wealth-composition" aria-label="Composizione del patrimonio, base capitale">
            <div className="ui31-composition-track" aria-hidden="true"><span style={{flex: p.liquidity, background: 'var(--ui31-chart-blue, var(--accent-blue))'}}/><span style={{flex: p.investmentTotal, background: 'var(--ui31-chart-gold, var(--accent-gold))'}}/></div>
            <div className="ui31-composition-labels"><span>Liquidità · {share(p.liquidity)}%</span><span>Capitale investito · {share(p.investmentTotal)}%</span></div>
          </div>}
          {p.showCommitments && (
            <div className="mt-4 pt-3 border-t border-divider">
              <CommitmentsEntryRow fixedMonthlyCost={fixedMonthlyCost}
                onClick={() => navigate('/commitments')} />
            </div>
          )}
        </section>

        {/* Le due componenti del patrimonio */}
        <div className="liquid-wealth-splits grid grid-cols-2 gap-3.5 md:gap-4">
          {!ui3||balanceKnown?<Split label="Liquidità" value={p.liquidity} pct={share(p.liquidity)} showPercent={!ui3 || (p.netWorth > 0 && p.liquidity >= 0 && p.investmentTotal >= 0)}
            onClick={() => navigate('/account-balance')} />:<p>Saldo dei conti da indicare</p>}
          {enableInvestments && (
            <Split label={ui3 ? "Capitale investito" : "Investito"} value={p.investmentTotal} pct={share(p.investmentTotal)} showPercent={!ui3 || (balanceKnown && includeInvestments && p.netWorth > 0 && p.liquidity >= 0 && p.investmentTotal >= 0)} gold
              onClick={() => navigate('/investments')} />
          )}
        </div>

        {/* Saldo per conto — la card di sempre, spostata qui dalla home */}
        <AccountsCard
          accountBalances={p.accountBalances}
          expenseByAccount={expenseByAccount}
          investByAccount={investByAccount}
          mode={accMode}
          onToggle={() => setAccMode(m => (m === 'balance' ? 'spending' : 'balance'))}
          onOpenDetail={() => navigate('/account-balance')}
        />
        </div>

        {(enableInvestments || (ui3 && p.showAvailableCash)) && (
          <div className="ui31-wealth-support wide:w-[352px] ultra:w-[384px] wide:flex-none">
            {cash && <AvailableCashSummary cash={cash}/>}
            {ui3 && p.showAvailableCash && !cash && <p>La stima della liquidità sarà disponibile dopo la registrazione del saldo dei conti.</p>}
            {enableInvestments && <InvestmentSummaryCard
              investmentByCategory={p.investmentByCategory}
              total={p.investmentTotal}
              onClick={() => navigate('/investments')}
            />}
          </div>
        )}
      </div>
    </div>
  );
}

function Split({ label, value, pct, gold, onClick, showPercent = true }: {
  label: string;
  value: number;
  pct: number;
  gold?: boolean;
  showPercent?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="ui-open-row glass-card rounded-[20px] shadow-elev-1 p-4 text-left active:scale-[0.99] transition-transform">
      <p className="label-caps text-secondary mb-1.5">{label}</p>
      <p className={`balance-num text-[17px] font-semibold ${gold ? 'text-gold' : 'text-primary'}`}>
        {formatCurrency(value)}
      </p>
      {showPercent && <p className="text-[11px] text-tertiary mt-1">{pct}% del totale</p>}
    </button>
  );
}
