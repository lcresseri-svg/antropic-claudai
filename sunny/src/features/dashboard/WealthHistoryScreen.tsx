// "Andamento patrimonio" — how total wealth moves over time, split into its two
// components (liquidity + investments). Unlike the dashboard's net worth (which
// honours the includeInvestments preference), HERE investments are ALWAYS part
// of the total: the screen exists precisely to show the full picture.
// Layout: hero (today's total + components) → chart (3 series) → KPI 1M/3M/6M/1A
// → variation of the selected period → statistics → "what moved the wealth"
// breakdown → deterministic interpretive note. All values are computed at
// runtime by wealthAnalytics.ts — nothing derived is persisted.

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatDateFull } from '../../utils';
import {
  WealthPeriod, WealthMetricSummary, WEALTH_PERIOD_OPTS,
  buildWealthPeriodSummary, buildWealthComparisons, buildWealthNote,
} from './wealthAnalytics';
import { WealthLineChart } from './WealthLineChart';

interface Props {
  transactions: Transaction[];
}

const EPS = 0.005;
const tone = (d: number) => (d > EPS ? 'text-green' : d < -EPS ? 'text-red' : 'text-secondary');
const arrow = (d: number) => (d > EPS ? '↑' : d < -EPS ? '↓' : '→');
const fmtPct = (p: number | null) =>
  p == null ? '—' : `${p >= 0 ? '+' : '−'}${Math.abs(p).toLocaleString('it-IT', { maximumFractionDigits: 1 })}%`;

const DOT = {
  total: 'var(--accent-gold)',
  liquidity: 'var(--accent-blue)',
  investments: 'var(--accent-green)',
};

export function WealthHistoryScreen({ transactions }: Props) {
  const navigate = useNavigate();
  // FULL lists (incl. archived): archived accounts/categories still carry
  // balance history — same source useTransactions feeds netWorth from.
  const { accounts, categories } = useSettings();
  const [period, setPeriod] = useState<WealthPeriod>('3m');

  const now = useMemo(() => new Date(), []);
  const summary = useMemo(
    () => buildWealthPeriodSummary(transactions, accounts, categories, period, { now }),
    [transactions, accounts, categories, period, now],
  );
  const comparisons = useMemo(
    () => buildWealthComparisons(transactions, accounts, categories, { now }),
    [transactions, accounts, categories, now],
  );
  const note = useMemo(() => buildWealthNote(summary), [summary]);

  const last = summary.points[summary.points.length - 1];

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
        <h1 className="text-xl font-bold text-primary tracking-[-0.03em]">Andamento patrimonio</h1>
      </div>
      <p className="text-[13px] text-secondary mb-5 ml-12">Liquidità e investimenti insieme, nel tempo.</p>

      {/* Sticky period selector */}
      <div className="sticky top-0 z-10 -mx-5 px-5 md:-mx-8 md:px-8 pt-1 pb-3 bg-bg border-b border-divider mb-5">
        <div className="flex items-center gap-1.5">
          {WEALTH_PERIOD_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === opt.value ? 'bg-gold text-bg' : 'bg-elevated text-secondary hover:text-primary'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hero — today's total + the two components */}
      <div className="glass-card rounded-3xl p-6 mb-4">
        <p className="label-caps text-secondary mb-2">Patrimonio totale</p>
        <p className="text-[38px] leading-none font-bold text-primary balance-num">{formatCurrency(last.total)}</p>
        <p className="text-[11px] text-secondary mt-2">
          al {formatDateFull(summary.endDate)}
          <span className={`ml-2 font-semibold balance-num ${tone(summary.total.delta)}`}>
            {formatCurrency(summary.total.delta, { sign: true })} ({fmtPct(summary.total.deltaPct)}) nel periodo
          </span>
        </p>
        <div className="flex gap-8 mt-5 pt-4 border-t border-divider">
          <div>
            <p className="label-caps text-secondary mb-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: DOT.liquidity }} />
              Liquidità
            </p>
            <p className="text-sm font-semibold text-primary balance-num">{formatCurrency(last.liquidity)}</p>
            <p className={`text-[11px] balance-num ${tone(summary.liquidity.delta)}`}>
              {formatCurrency(summary.liquidity.delta, { sign: true })}
            </p>
          </div>
          <div>
            <p className="label-caps text-secondary mb-1.5 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: DOT.investments }} />
              Investimenti
            </p>
            <p className="text-sm font-semibold text-primary balance-num">{formatCurrency(last.investments)}</p>
            <p className={`text-[11px] balance-num ${tone(summary.investments.delta)}`}>
              {formatCurrency(summary.investments.delta, { sign: true })}
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="glass-card rounded-2xl p-5 mb-4">
        <div className="flex items-baseline justify-between mb-4">
          <p className="label-caps text-secondary">Andamento</p>
          <p className="text-[11px] text-secondary">{summary.label}</p>
        </div>
        <WealthLineChart points={summary.points} formatValue={formatCurrency} />
        {summary.points.length >= 2 && (
          <p className="text-[10px] text-secondary/70 text-center mt-2">
            La linea tratteggiata indica il totale a inizio periodo ({formatCurrency(summary.total.startValue)}).
          </p>
        )}
      </div>

      {/* KPI — total variation over the four trailing windows */}
      <section className="mb-4">
        <p className="label-caps text-secondary mb-3 px-0.5">Variazione del totale</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {comparisons.map(c => (
            <div key={c.period} className="glass-card rounded-2xl p-4">
              <p className="text-[11px] text-secondary mb-1.5">{c.label}</p>
              <p className={`text-xl font-bold balance-num tracking-[-0.02em] ${tone(c.total.delta)}`}>
                <span className="mr-1">{arrow(c.total.delta)}</span>{fmtPct(c.total.deltaPct)}
              </p>
              <p className="text-[10px] text-secondary mt-1.5 balance-num">
                da {formatCurrency(c.total.startValue)}
              </p>
              <p className="text-[10px] text-secondary balance-num">
                a {formatCurrency(c.total.endValue)}
              </p>
              <p className={`text-[11px] font-semibold mt-1 balance-num ${tone(c.total.delta)}`}>
                {formatCurrency(c.total.delta, { sign: true })}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {/* Variation of the SELECTED period, all three metrics */}
        <div className="glass-card rounded-2xl p-5">
          <p className="label-caps text-secondary mb-4">Variazione periodo selezionato</p>
          <div className="space-y-3.5">
            {([summary.total, summary.liquidity, summary.investments] as WealthMetricSummary[]).map(m => (
              <div key={m.metric} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-primary flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ background: DOT[m.metric] }} />
                    {m.label}
                  </p>
                  <p className="text-[11px] text-secondary balance-num mt-0.5">
                    {formatCurrency(m.startValue)} → {formatCurrency(m.endValue)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-[13px] font-semibold balance-num ${tone(m.delta)}`}>
                    {formatCurrency(m.delta, { sign: true })}
                  </p>
                  <p className={`text-[11px] balance-num ${tone(m.delta)}`}>{fmtPct(m.deltaPct)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Period statistics (total) */}
        <div className="glass-card rounded-2xl p-5">
          <p className="label-caps text-secondary mb-4">Statistiche periodo</p>
          <div className="space-y-2.5 text-[13px]">
            <StatRow label="Massimo" value={formatCurrency(summary.maxTotal)} />
            <StatRow label="Minimo" value={formatCurrency(summary.minTotal)} />
            <StatRow label="Media" value={formatCurrency(summary.averageTotal)} />
            <StatRow
              label="Miglior giorno"
              value={summary.bestTotalDay ? formatDateFull(summary.bestTotalDay.date) : '—'}
              valueClass={summary.bestTotalDay ? 'text-green' : 'text-secondary'}
            />
            <StatRow
              label="Peggior giorno"
              value={summary.worstTotalDay ? formatDateFull(summary.worstTotalDay.date) : '—'}
              valueClass={summary.worstTotalDay ? 'text-red' : 'text-secondary'}
            />
          </div>
        </div>

        {/* Component statistics */}
        <div className="glass-card rounded-2xl p-5">
          <p className="label-caps text-secondary mb-4">Componenti</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[12px] font-medium text-primary mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: DOT.liquidity }} />
                Liquidità
              </p>
              <div className="space-y-1.5 text-[12px]">
                <StatRow label="Max" value={formatCurrency(summary.maxLiquidity)} />
                <StatRow label="Min" value={formatCurrency(summary.minLiquidity)} />
                <StatRow label="Media" value={formatCurrency(summary.averageLiquidity)} />
              </div>
            </div>
            <div>
              <p className="text-[12px] font-medium text-primary mb-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: DOT.investments }} />
                Investimenti
              </p>
              <div className="space-y-1.5 text-[12px]">
                <StatRow label="Max" value={formatCurrency(summary.maxInvestments)} />
                <StatRow label="Min" value={formatCurrency(summary.minInvestments)} />
                <StatRow label="Media" value={formatCurrency(summary.averageInvestments)} />
              </div>
            </div>
          </div>
        </div>

        {/* What moved the wealth */}
        <div className="glass-card rounded-2xl p-5">
          <p className="label-caps text-secondary mb-4">Cosa ha mosso il patrimonio</p>
          <div className="space-y-3">
            <MoverRow label="Liquidità" delta={summary.liquidity.delta} pct={summary.liquidity.deltaPct}
              maxAbs={Math.max(Math.abs(summary.liquidity.delta), Math.abs(summary.investments.delta), Math.abs(summary.total.delta), 1)} />
            <MoverRow label="Investimenti" delta={summary.investments.delta} pct={summary.investments.deltaPct}
              maxAbs={Math.max(Math.abs(summary.liquidity.delta), Math.abs(summary.investments.delta), Math.abs(summary.total.delta), 1)} />
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-secondary">Trasferimenti interni</span>
              <span className="text-secondary">non incidono sul totale</span>
            </div>
            <div className="flex items-center justify-between pt-2.5 border-t border-divider">
              <span className="text-[13px] font-semibold text-primary">Totale</span>
              <span className={`text-[13px] font-bold balance-num ${tone(summary.total.delta)}`}>
                {formatCurrency(summary.total.delta, { sign: true })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Deterministic interpretive note */}
      <div className="glass-card rounded-2xl p-4 flex items-start gap-3">
        <span className="text-base leading-none mt-0.5">💡</span>
        <p className="text-[12px] text-secondary leading-relaxed">{note}</p>
      </div>
    </div>
  );
}

function StatRow({ label, value, valueClass = 'text-primary' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-secondary">{label}</span>
      <span className={`font-medium balance-num ${valueClass}`}>{value}</span>
    </div>
  );
}

/** Horizontal delta bar — green grows, red shrinks, proportional to the biggest mover. */
function MoverRow({ label, delta, pct, maxAbs }: { label: string; delta: number; pct: number | null; maxAbs: number }) {
  const width = Math.min(100, (Math.abs(delta) / maxAbs) * 100);
  const positive = delta > EPS;
  const negative = delta < -EPS;
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-primary font-medium">{label}</span>
        <span className={`balance-num font-semibold ${tone(delta)}`}>
          {formatCurrency(delta, { sign: true })} ({fmtPct(pct)})
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--progress-track)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${positive || negative ? Math.max(width, 2) : 0}%`,
            background: positive ? 'var(--accent-green)' : negative ? 'var(--accent-red)' : 'transparent',
          }}
        />
      </div>
    </div>
  );
}
