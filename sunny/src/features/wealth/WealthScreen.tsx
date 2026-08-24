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
import { AccountsCard } from '../dashboard/AccountsCard';
import { InvestmentSummaryCard } from '../dashboard/InvestmentSummaryCard';

interface Props {
  transactions: Transaction[];
  netWorth: number;
  liquidity: number;
  investmentTotal: number;
  accountBalances: Record<string, number>;
  investmentByCategory: Record<string, number>;
}

export function WealthScreen(p: Props) {
  const navigate = useNavigate();
  const { accounts, categories, enableInvestments, includeInvestments } = useSettings();
  const [accMode, setAccMode] = useState<'balance' | 'spending'>('balance');

  const now = useMemo(() => new Date(), []);

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

  const share = (v: number) => (p.netWorth > 0 ? Math.round((v / p.netWorth) * 100) : 0);

  return (
    <div className="pb-32 md:pb-6">
      <div className="h-14 flex items-center justify-between md:h-auto md:mb-5">
        <h1 className="text-[17px] md:text-xl font-semibold text-primary tracking-[-0.03em]">Patrimonio</h1>
        <button type="button" onClick={() => navigate('/wealth-history')}
          className="text-[12px] font-medium text-gold">
          Storico ›
        </button>
      </div>

      {/* Desktop: due colonne indipendenti in altezza, come la home. */}
      <div className="flex flex-col md:flex-row gap-3.5 md:gap-4 md:items-start">
        <div className="flex flex-col gap-3.5 md:gap-4 md:flex-1 md:min-w-0">
        {/* Hero: il patrimonio e come si è mosso */}
        <section className="hero-card rounded-[26px] shadow-elev-2 p-[22px] animate-rise-in">
          <p className="label-caps text-secondary mb-2">Patrimonio netto</p>
          <p className="balance-num text-[38px] leading-none font-bold text-primary">
            {formatCurrency(p.netWorth)}
          </p>
          {wealth.hasHistory && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className={`text-[11.5px] font-semibold rounded-full px-2 py-[3px] ${
                wealth.delta >= 0 ? 'text-green bg-green/[0.14]' : 'text-red bg-red/[0.14]'}`}>
                {formatCurrency(wealth.delta, { sign: true })}
              </span>
              <span className="text-[11.5px] text-secondary">negli ultimi 3 mesi</span>
            </div>
          )}
          {wealth.hasHistory && (
            <div className="mt-4 -mx-1">
              <WealthLineChart points={wealth.points} formatValue={formatCurrency} height={112} />
            </div>
          )}
        </section>

        {/* Le due componenti del patrimonio */}
        <div className="grid grid-cols-2 gap-3.5 md:gap-4">
          <Split label="Liquidità" value={p.liquidity} pct={share(p.liquidity)}
            onClick={() => navigate('/account-balance')} />
          {enableInvestments && (
            <Split label="Investito" value={p.investmentTotal} pct={share(p.investmentTotal)} gold
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

        {enableInvestments && (
          <div className="md:w-[352px] md:flex-none">
            <InvestmentSummaryCard
              investmentByCategory={p.investmentByCategory}
              total={p.investmentTotal}
              onClick={() => navigate('/investments')}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Split({ label, value, pct, gold, onClick }: {
  label: string;
  value: number;
  pct: number;
  gold?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick}
      className="glass-card rounded-[20px] shadow-elev-1 p-4 text-left active:scale-[0.99] transition-transform">
      <p className="label-caps text-secondary mb-1.5">{label}</p>
      <p className={`balance-num text-[17px] font-semibold ${gold ? 'text-gold' : 'text-primary'}`}>
        {formatCurrency(value)}
      </p>
      <p className="text-[11px] text-tertiary mt-1">{pct}% del totale</p>
    </button>
  );
}
