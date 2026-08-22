// Analisi ENTRATE — speculare a CategorySpendingScreen (stessi controlli di
// periodo, stessa impaginazione, stessi helper di aggregazione), ma centrata su
// da dove arrivano i soldi e quanto è stabile il reddito.
//
// Il TOTALE mostrato coincide con la card "Entrate" della dashboard:
//   entrate ordinarie (type income) + capitale rientrato dai disinvestimenti.
// I versamenti senza conto e il TFR NON sono entrate (non toccano i conti):
// vivono nella card Investimenti.
//
// Accanto al totale c'è la statistica ENTRATE NETTE: il totale meno il capitale
// rientrato dai disinvestimenti (denaro già tuo che torna indietro, non reddito).
// Le plusvalenze realizzate restano dentro perché sono guadagno effettivo.

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, capitalize } from '../../utils';
import {
  PeriodType, PERIOD_OPTS, getPeriodRange, getPreviousPeriodRange,
  aggregateIncomeByCategory, aggregateIncomeStats, aggregateIncomeTrend,
  capitalReturnedIn, buildComposition,
} from './categoryAnalytics';
import { Donut } from './Donut';
import { AccountBalanceLineChart } from './AccountBalanceLineChart';

interface Props {
  transactions: Transaction[];
}

const deltaColor = (v: number) => (v > 0.005 ? 'text-green' : v < -0.005 ? 'text-red' : 'text-secondary');

export function IncomeScreen({ transactions }: Props) {
  const navigate = useNavigate();
  const { getCat, insightDepth } = useSettings();

  const [period, setPeriod] = useState<PeriodType>('1m');
  const [offset, setOffset] = useState(0);

  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => getPeriodRange(period, offset, now), [period, offset, now]);
  const prevRange = useMemo(() => getPreviousPeriodRange(period, offset, now), [period, offset, now]);

  const agg = useMemo(
    () => aggregateIncomeByCategory(transactions, range, prevRange),
    [transactions, range, prevRange],
  );
  const stats = useMemo(() => aggregateIncomeStats(transactions, range, agg), [transactions, range, agg]);
  const returned = useMemo(() => capitalReturnedIn(transactions, range), [transactions, range]);
  const trend = useMemo(() => aggregateIncomeTrend(transactions, 12, now), [transactions, now]);
  const composition = useMemo(() => buildComposition(agg.categories, agg.total), [agg]);

  // Totale della card "Entrate": ordinarie + capitale rientrato.
  const cashIn = agg.total + returned;
  // Peso delle plusvalenze realizzate sulle entrate nette.
  const gainShare = stats.netIncome > 0 ? (stats.realizedGains / stats.netIncome) * 100 : 0;
  const showDelta = insightDepth !== 'minimal';

  useEffect(() => { window.scrollTo({ top: 0 }); }, [period, offset]);

  const label = (id: string) => `${getCat(id).icon} ${getCat(id).label}`;
  // Una sola fonte oltre questa soglia = reddito molto concentrato.
  const CONCENTRATION_ALERT = 80;

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
        <h1 className="text-xl font-bold text-primary tracking-[-0.03em]">Entrate</h1>
      </div>
      <p className="text-[13px] text-secondary mb-5 ml-12">Da dove arrivano i tuoi soldi e quanto è stabile il reddito.</p>

      {/* Sticky controls */}
      <div className="sticky top-0 z-10 -mx-5 px-5 md:-mx-8 md:px-8 pt-1 pb-3 bg-bg border-b border-divider mb-5">
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

      {cashIn === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-12 text-center">
          <p className="text-3xl mb-3 opacity-50">💰</p>
          <p className="text-[13px] text-secondary">Nessuna entrata in questo periodo.</p>
        </div>
      ) : (
        <>
          {/* Totale periodo + ENTRATE NETTE */}
          <div className="glass-card rounded-2xl p-5 mb-3">
            <p className="label-caps text-secondary mb-1.5">Totale entrate periodo</p>
            <p className="text-[34px] leading-none font-bold text-green balance-num">{formatCurrency(cashIn)}</p>
            {showDelta && agg.deltaPercentage !== null && (
              <p className={`text-[13px] mt-2 balance-num ${deltaColor(agg.total - agg.previousTotal)}`}>
                {agg.deltaPercentage > 0 ? '+' : ''}{Math.round(agg.deltaPercentage)}%
                <span className="text-secondary"> rispetto al periodo precedente</span>
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-divider">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[14px] font-semibold text-primary">Entrate nette</p>
                <p className="text-[24px] leading-none font-bold text-green balance-num flex-shrink-0">
                  {formatCurrency(stats.netIncome)}
                </p>
              </div>
              <p className="text-[12px] text-secondary leading-snug mt-1.5">
                {returned > 0
                  ? 'Quanto hai davvero guadagnato: fuori il capitale rientrato dai disinvestimenti, che non è reddito ma denaro già tuo che torna indietro. Le plusvalenze realizzate restano dentro, quelle sono guadagno vero.'
                  : 'In questo periodo non è rientrato capitale da disinvestimenti: le entrate sono già tutte reddito vero.'}
              </p>

              {returned > 0 && (
                <ul className="mt-3.5 space-y-2">
                  <FlowRow label="Entrate lorde del periodo" value={cashIn} />
                  <FlowRow label="Capitale rientrato dai disinvestimenti" value={-returned} sign />
                  <FlowRow label="Entrate nette" value={stats.netIncome} strong />
                </ul>
              )}

              {stats.realizedGains > 0 && (
                <div className="mt-3.5 rounded-xl px-3.5 py-3 flex items-start gap-2.5" style={{ backgroundColor: 'rgba(138,146,112,0.14)' }}>
                  <span className="text-base flex-shrink-0">📈</span>
                  <p className="text-[12px] text-secondary leading-snug">
                    Di cui <span className="font-semibold text-green balance-num">{formatCurrency(stats.realizedGains)}</span> di
                    plusvalenze realizzate ({Math.round(gainShare)}% delle entrate nette)
                    e <span className="font-medium text-primary balance-num">{formatCurrency(stats.ordinaryIncome)}</span> di entrate ordinarie.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Kpi label="Media netta al mese" value={formatCurrency(stats.monthlyAverage)} />
            <Kpi label="Fonti attive" value={String(stats.activeSources)} />
            <Kpi label="Entrata più alta" value={formatCurrency(stats.topAmount)} />
            <Kpi label="Movimento medio" value={formatCurrency(stats.avgAmount)} />
          </div>

          {insightDepth === 'advanced' && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <Kpi label="Movimenti" value={String(stats.count)} />
              <Kpi label="Quota ricorrente" value={`${Math.round(stats.recurringShare)}%`} />
              <Kpi label="Mesi con entrate" value={`${stats.monthsWithIncome}/${range.months}`} />
              <Kpi label="Fonte principale" value={`${Math.round(stats.topSourceShare)}%`} />
            </div>
          )}

          {/* Andamento 12 mesi */}
          <div className="glass-card rounded-2xl p-5 mb-3">
            <p className="label-caps text-secondary mb-3">Andamento entrate · 12 mesi</p>
            <AccountBalanceLineChart
              points={trend}
              formatValue={formatCurrency}
              color="var(--accent-green)"
            />
          </div>

          {/* Composizione */}
          {composition.length > 0 && (
            <div className="glass-card rounded-2xl p-5 mb-3">
              <p className="label-caps text-secondary mb-4">Da dove arrivano</p>
              <div className="flex items-center gap-5 flex-wrap">
                <Donut
                  segments={composition.map(seg => ({
                    label: seg.categoryId === '__other__' ? 'Altre' : getCat(seg.categoryId).label,
                    value: seg.amount,
                    color: seg.categoryId === '__other__' ? '#8B8B8B' : getCat(seg.categoryId).color,
                    icon: seg.categoryId === '__other__' ? '•' : getCat(seg.categoryId).icon,
                  }))}
                  centerLabel="Entrate"
                  size={140}
                />
                <ul className="flex-1 space-y-3 min-w-[180px]">
                  {composition.map(seg => (
                    <li key={seg.categoryId} className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: seg.categoryId === '__other__' ? '#8B8B8B' : getCat(seg.categoryId).color }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-primary truncate">
                          {seg.categoryId === '__other__' ? '• Altre' : label(seg.categoryId)}
                        </p>
                        <p className="text-[11px] text-secondary">{Math.round(seg.percentage)}%</p>
                      </div>
                      <span className="text-[13px] font-semibold text-primary balance-num flex-shrink-0">
                        {formatCurrency(seg.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {stats.topSourceShare >= CONCENTRATION_ALERT && stats.activeSources > 0 && (
                <div className="mt-4 rounded-xl px-3.5 py-3 flex items-start gap-2.5" style={{ backgroundColor: 'rgba(230,185,92,0.12)' }}>
                  <span className="text-base flex-shrink-0">⚖️</span>
                  <p className="text-[12px] text-secondary leading-snug">
                    Il <span className="font-medium text-primary">{Math.round(stats.topSourceShare)}%</span> delle
                    entrate arriva da una sola fonte
                    {agg.categories[0] && <> ({getCat(agg.categories[0].categoryId).label})</>}: il reddito è molto concentrato.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Dettaglio per fonte */}
          <div className="glass-card rounded-2xl p-4">
            <p className="label-caps text-secondary mb-1 px-1">Dettaglio per fonte</p>
            <div className="divide-y divide-divider">
              {agg.categories.map(c => (
                <div key={c.categoryId} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                      style={{ backgroundColor: getCat(c.categoryId).color + '22' }}>
                      {getCat(c.categoryId).icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-primary truncate">{getCat(c.categoryId).label}</p>
                      <p className="text-[11px] text-secondary">
                        {c.transactionCount} {c.transactionCount === 1 ? 'movimento' : 'movimenti'} · media {formatCurrency(c.avgTransactionAmount)}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[15px] font-semibold text-primary balance-num">{formatCurrency(c.amount)}</p>
                      {showDelta && c.deltaPercentage !== null && (
                        <p className={`text-[11px] font-semibold balance-num ${deltaColor(c.deltaAmount)}`}>
                          {c.deltaPercentage > 0 ? '+' : ''}{Math.round(c.deltaPercentage)}%
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2.5 h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.min(100, c.percentageOfTotal)}%`, backgroundColor: getCat(c.categoryId).color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Riga della derivazione lorde → nette. `sign` mostra sempre il segno,
 *  `strong` evidenzia il risultato finale. */
function FlowRow({ label, value, sign, strong }: { label: string; value: number; sign?: boolean; strong?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={`text-[12px] leading-snug ${strong ? 'font-semibold text-primary' : 'text-secondary'}`}>{label}</span>
      <span className={`balance-num flex-shrink-0 ${strong ? 'text-[14px] font-semibold text-primary' : 'text-[13px] text-secondary'}`}>
        {sign && value < 0 ? `−${formatCurrency(Math.abs(value))}` : formatCurrency(value)}
      </span>
    </li>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-2xl px-3.5 py-3.5">
      <p className="text-[12px] font-medium text-secondary mb-2 truncate">{label}</p>
      <p className="text-[16px] font-semibold text-primary balance-num truncate">{value}</p>
    </div>
  );
}
