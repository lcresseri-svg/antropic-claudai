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
import { aggregateAccountFlow } from './accountAnalytics';
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

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
          className="w-9 h-9 rounded-2xl bg-elevated flex items-center justify-center text-secondary active:scale-95 transition-transform flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-primary tracking-[-0.03em]">Saldo per conto</h1>
      </div>
      <p className="text-[13px] text-secondary mb-5 ml-12">Come si muove la liquidità dei tuoi conti nel tempo.</p>

      {/* Sticky controls */}
      <div className="sticky top-0 z-10 -mx-5 px-5 md:-mx-8 md:px-8 pt-1 pb-3 bg-bg border-b border-divider mb-5">
        {/* Period selector */}
        <div className="flex items-center gap-1.5 mb-3">
          {PERIOD_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setPeriod(opt.value); setOffset(0); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === opt.value ? 'bg-gold/10 text-gold' : 'text-secondary hover:text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Period navigator */}
        <div className="flex items-center justify-between bg-card rounded-xl px-1.5 py-1.5">
          <button
            onClick={() => setOffset(o => o + 1)}
            aria-label="Periodo precedente"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-primary">{capitalize(range.label)}</span>
            {offset > 0 && (
              <button onClick={() => setOffset(0)} className="text-[11px] font-medium text-gold">Oggi</button>
            )}
          </div>
          <button
            onClick={() => setOffset(o => Math.max(0, o - 1))}
            disabled={offset === 0}
            aria-label="Periodo successivo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-12 text-center">
          <p className="text-3xl mb-3 opacity-50">🏦</p>
          <p className="text-[13px] text-secondary">Nessun conto di liquidità da mostrare.</p>
        </div>
      ) : (
        <>
          {/* Hero — total liquidity at the end of the analysed period */}
          <div className="glass-card rounded-2xl p-5 mb-3">
            <p className="label-caps text-secondary mb-1.5">Liquidità totale</p>
            <p className={`text-[34px] leading-none font-bold balance-num ${liquidity < 0 ? 'text-red' : 'text-primary'}`}>
              {formatCurrency(liquidity)}
            </p>
            {showDelta && Math.abs(totalDelta) > 0.005 && (
              <p className={`text-[12px] mt-1.5 balance-num ${tone(totalDelta)}`}>
                {formatCurrency(totalDelta, { sign: true })}
                <span className="text-secondary"> nel periodo</span>
              </p>
            )}
            <p className="text-[12px] text-secondary mt-2">
              {range.isCurrent
                ? 'Somma dei saldi dei conti, oggi.'
                : `Somma dei saldi dei conti al ${formatDateFull(localISO(range.end))}.`}
            </p>
          </div>

          {/* Account ranking */}
          <div className="glass-card rounded-2xl overflow-hidden">
            {rows.map((r, i) => {
              const barPct = maxAbs > 0 ? (Math.abs(r.current) / maxAbs) * 100 : 0;
              return (
                <button
                  key={r.acc.id}
                  onClick={() => setSelectedId(r.acc.id)}
                  className={`w-full text-left px-4 py-3.5 active:bg-card-hover transition-colors ${i === rows.length - 1 ? '' : 'border-b border-divider'}`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: r.acc.color + '1a' }}>
                      {r.acc.icon}
                    </span>
                    <span className="text-[13px] text-primary flex-1 truncate">{r.acc.label}</span>
                    {showDelta && Math.abs(r.delta) > 0.005 && (
                      <span className={`text-[11px] balance-num flex-shrink-0 ${tone(r.delta)}`}>
                        {formatCurrency(r.delta, { sign: true })}
                      </span>
                    )}
                    <span className={`text-[13px] font-semibold balance-num flex-shrink-0 ${r.current < 0 ? 'text-red' : 'text-primary'}`}>
                      {formatCurrency(r.current)}
                    </span>
                  </div>
                  <div className="h-[3px] rounded-full overflow-hidden ml-11" style={{ backgroundColor: 'var(--progress-track)' }}>
                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.max(2, barPct)}%`, backgroundColor: r.acc.color }} />
                  </div>
                </button>
              );
            })}
          </div>
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
