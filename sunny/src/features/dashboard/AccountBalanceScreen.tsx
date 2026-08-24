// "Saldo per conto" — analytics for how the cash balance of each liquidity
// account moves over time. Speculare a CategorySpendingScreen, but centred on a
// STOCK (the balance) rather than a flow. Period selector (Mese / 3M / 6M / 12M)
// + period navigation, a liquidity hero, and a ranked account list. Tapping an
// account opens a detail sheet. Investment accounts are excluded.

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, capitalize, formatDateFull } from '../../utils';
import { PERIOD_OPTS, PeriodType, getPeriodRange, localISO } from './categoryAnalytics';
import { aggregateAccountFlow, aggregateAccountBalanceTrend, balanceAsOf } from './accountAnalytics';
import { AnalysisHeader } from './AnalysisHeader';
import { PeriodControls } from './PeriodControls';
import { AccountDetailSheet } from './AccountDetailSheet';

interface Props {
  transactions: Transaction[];
}

const tone = (d: number) => (d > 0.005 ? 'text-green' : d < -0.005 ? 'text-red' : 'text-secondary');

export function AccountBalanceScreen({ transactions }: Props) {
  const navigate = useNavigate();
  const { accounts, insightDepth } = useSettings();
  const [period, setPeriod] = useState<PeriodType>('1m');
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => getPeriodRange(period, offset, now), [period, offset, now]);

  // Cash accounts only (investment accounts aren't liquidity).
  const cashAccounts = useMemo(() => accounts.filter(a => !a.isInvestment), [accounts]);

  const rows = useMemo(() => {
    return cashAccounts
      .map(acc => {
        // `current` = balance at the END of the analysed period (capped to today
        // by aggregateAccountFlow). Navigating back in time therefore shows the
        // saldo as it stood at the close of that period — not always today's.
        const flow = aggregateAccountFlow(transactions, acc, range, { now });
        return { acc, current: flow.closingBalance, delta: flow.delta };
      })
      .sort((a, b) => b.current - a.current);
  }, [cashAccounts, transactions, range, now]);

  const liquidity = useMemo(() => rows.reduce((s, r) => s + r.current, 0), [rows]);
  const totalDelta = useMemo(() => rows.reduce((s, r) => s + r.delta, 0), [rows]);
  const maxAbs = useMemo(() => Math.max(1, ...rows.map(r => Math.abs(r.current))), [rows]);

  // Changing the window closes any open detail.
  useEffect(() => { setSelectedId(null); }, [period, offset]);

  const selected = selectedId ? cashAccounts.find(a => a.id === selectedId) ?? null : null;
  const showDelta = insightDepth !== 'minimal';

  // Sparkline della liquidità: somma, bucket per bucket, delle curve dei conti
  // (stessa funzione del dettaglio conto, quindi stessi bucket e stessa
  // definizione di saldo — non un secondo calcolo che può divergere).
  const liquiditySeries = useMemo(() => {
    if (cashAccounts.length === 0) return [];
    const curves = cashAccounts.map(a => aggregateAccountBalanceTrend(transactions, a, period, offset, now));
    const len = Math.min(...curves.map(c => c.length));
    // Il primo punto è il saldo di APERTURA, cioè il giorno prima che il
    // periodo cominci. Senza, la curva partirebbe dalla fine della prima
    // settimana — dopo lo stipendio — e scenderebbe mentre la variazione qui
    // sopra dice "+1.026 €": due racconti opposti sullo stesso periodo.
    const openingISO = localISO(new Date(range.start.getTime() - 86_400_000));
    const opening = cashAccounts.reduce((s, a) => s + balanceAsOf(transactions, a, openingISO), 0);
    return [opening, ...Array.from({ length: len }, (_, i) => curves.reduce((s, c) => s + c[i].balance, 0))];
  }, [cashAccounts, transactions, period, offset, now, range.start]);

  return (
    <div className="pb-32">
      <AnalysisHeader title="Saldo per conto"
        subtitle="Come si muove la liquidità dei tuoi conti" backTo="/wealth" />

      <PeriodControls period={period} onPeriodChange={setPeriod}
        offset={offset} onOffsetChange={setOffset} label={range.label} />

      {rows.length === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-12 text-center">
          <p className="text-3xl mb-3 opacity-50">🏦</p>
          <p className="text-[13px] text-secondary">Nessun conto di liquidità da mostrare.</p>
        </div>
      ) : (
        <>
          {/* Hero — total liquidity at the end of the analysed period */}
          <div className="hero-card rounded-[26px] shadow-elev-2 p-[22px] mb-3.5 animate-rise-in">
            <p className="label-caps text-secondary mb-2">Liquidità totale</p>
            <p className={`text-[38px] leading-none font-bold balance-num ${liquidity < 0 ? 'text-red' : 'text-primary'}`}>
              {formatCurrency(liquidity)}
            </p>
            {showDelta && Math.abs(totalDelta) > 0.005 && (
              <div className="flex items-center gap-1.5 mt-2.5">
                <span className={`text-[11.5px] font-semibold balance-num px-2 py-[3px] rounded-full ${
                  totalDelta >= 0 ? 'text-green bg-green/[0.14]' : 'text-red bg-red/[0.14]'}`}>
                  {formatCurrency(totalDelta, { sign: true })}
                </span>
                <span className="text-[11.5px] text-secondary">nel periodo</span>
              </div>
            )}
            {liquiditySeries.length >= 2 && <LiquiditySparkline values={liquiditySeries} />}
            <p className="text-[12px] text-secondary mt-3">
              {range.isCurrent
                ? 'Somma dei saldi dei conti, oggi.'
                : `Somma dei saldi dei conti al ${formatDateFull(localISO(range.end))}.`}
            </p>
          </div>

          {/* Una card per conto: la variazione del periodo va SOTTO il nome,
              non in fila con il saldo — sono due cose diverse. */}
          <div className="space-y-3">
            {rows.map(r => {
              const barPct = maxAbs > 0 ? (Math.abs(r.current) / maxAbs) * 100 : 0;
              return (
                <button
                  key={r.acc.id}
                  onClick={() => setSelectedId(r.acc.id)}
                  className="w-full text-left glass-card rounded-[18px] shadow-elev-1 p-4 active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: r.acc.color + '26' }}>
                      {r.acc.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-medium text-primary truncate">{r.acc.label}</p>
                      {showDelta && Math.abs(r.delta) > 0.005 && (
                        <p className={`text-[11.5px] balance-num ${tone(r.delta)}`}>
                          {formatCurrency(r.delta, { sign: true })} nel periodo
                        </p>
                      )}
                    </div>
                    <span className={`text-[16px] font-bold balance-num flex-shrink-0 ${r.current < 0 ? 'text-red' : 'text-primary'}`}>
                      {formatCurrency(r.current)}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden progress-track">
                    <div className="h-full rounded-full bar-grow" style={{ width: `${Math.max(2, barPct)}%`, backgroundColor: r.acc.color }} />
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-[11.5px] text-tertiary mt-4 px-1">
            I conti investimento non sono liquidità: vivono nel tab Patrimonio.
          </p>
        </>
      )}

      {selected && (
        <AccountDetailSheet
          account={selected}
          transactions={transactions}
          period={period}
          offset={offset}
          periodLabel={range.label}
          now={now}
          depth={insightDepth}
          onClose={() => setSelectedId(null)}
          onSeeAll={() => navigate(`/transactions?account=${selected.id}`)}
        />
      )}
    </div>
  );
}

/** Area + linea oro della liquidità nel periodo. Come la sparkline del
 *  patrimonio in home: il dominio segue i dati, il numero sta sopra. */
function LiquiditySparkline({ values }: { values: number[] }) {
  const W = 320, H = 82, TOP = 8, BOTTOM = 70;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => (span === 0 ? (TOP + BOTTOM) / 2 : BOTTOM - ((v - min) / span) * (BOTTOM - TOP));
  const line = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-4" style={{ height: H }} preserveAspectRatio="none" aria-hidden>
      <path d={area} fill="rgba(var(--c-gold) / 0.13)" />
      <path d={line} fill="none" stroke="rgb(var(--c-gold))" strokeWidth="2"
        vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
