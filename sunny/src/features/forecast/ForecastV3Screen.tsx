/**
 * Admin-only screen for Forecast Engine V3.
 * Shows V3 forecast with per-category behavior badges, confidence intervals,
 * and a side-by-side comparison with V2.
 */
import { useState } from 'react';
import { Transaction, CategoryDef } from '../../types';
import { useForecastV2 } from './useForecastV2';
import { useForecastV3 } from './useForecastV3';
import { CategoryForecastV3, BacktestResultV3 } from './forecastTypesV3';
import { CategoryForecastV2 } from './forecastTypes';
import { CategoryBehavior } from './forecastTypesV3';

interface Props {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
}

const BEHAVIOR_META: Record<CategoryBehavior, { label: string; color: string; bg: string }> = {
  recurring:          { label: '🔁 Ricorrente',      color: 'text-[#8A9270]',  bg: 'bg-[#8A9270]/15' },
  recurring_bundle:   { label: '📦 Bundle abbonamenti', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  fixed_monthly:      { label: '🔒 Fisso mensile',    color: 'text-[#8A9270]',  bg: 'bg-[#8A9270]/15' },
  periodic_fixed:     { label: '📅 Periodico',        color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  hybrid:             { label: '⚡ Ibrido',           color: 'text-gold',       bg: 'bg-gold/10' },
  variable_frequent:  { label: '📊 Variabile freq.',  color: 'text-tertiary',   bg: 'bg-elevated' },
  variable_sparse:    { label: '📊 Variabile raro',   color: 'text-tertiary',   bg: 'bg-elevated' },
  volatile_mixed:     { label: '⚠️ Volatile',         color: 'text-[#C0706A]',  bg: 'bg-[#C0706A]/10' },
  stale:              { label: '💤 Inattiva',          color: 'text-tertiary',   bg: 'bg-elevated' },
  unknown:            { label: '❓ Sconosciuto',       color: 'text-tertiary',   bg: 'bg-elevated' },
};

export function ForecastV3Screen({ transactions, expenseCategories, monthlyIncome, monthlyInvestments }: Props) {
  const [showBacktest, setShowBacktest] = useState(false);
  const [withBias, setWithBias] = useState(false);
  const [compareV2, setCompareV2] = useState(true);

  const { forecast: v3, backtest: v3Backtest } = useForecastV3({
    transactions, expenseCategories, monthlyIncome, monthlyInvestments,
    withBacktest: showBacktest,
    withBiasCorrection: withBias,
  });

  const { forecast: v2 } = useForecastV2({
    transactions, expenseCategories, monthlyIncome, monthlyInvestments,
  });

  const fmt = (n: number) => `€${Math.round(Math.abs(n)).toLocaleString('it-IT')}`;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const rlColor = (r: number) => r >= 0.7 ? 'text-[#8A9270]' : r >= 0.4 ? 'text-gold' : 'text-[#C0706A]';
  const rlLabel = (r: number) => r >= 0.7 ? 'Alta' : r >= 0.4 ? 'Media' : 'Bassa';

  const v3CatMap = Object.fromEntries(v3.categories.map(c => [c.categoryId, c]));
  const v2CatMap = Object.fromEntries(v2.categories.map(c => [c.categoryId, c]));

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gold/10 text-gold">Admin · Sperimentale</span>
          <span className="text-xs text-tertiary">Motore V3</span>
        </div>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Previsione V3</h1>
        <p className="text-sm text-secondary mt-0.5">
          Anti double-count · stale detection · cadenze periodiche · intervalli di confidenza
        </p>
      </div>

      {/* Summary comparison */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-tertiary uppercase tracking-wide mb-1">Spese previste V3</p>
            <p className="text-3xl font-bold text-primary tracking-[-0.04em]">{fmt(v3.projectedExpenses)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-tertiary mb-1">Risparmio previsto</p>
            <p className={`text-xl font-semibold ${v3.savings >= 0 ? 'text-[#8A9270]' : 'text-[#C0706A]'}`}>
              {v3.savings >= 0 ? '+' : ''}{fmt(v3.savings)}
            </p>
          </div>
        </div>

        {compareV2 && (
          <div className="h-px bg-divider" />
        )}

        {compareV2 && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <Kpi label="V2" value={fmt(v2.projectedExpenses)} sub="previsione V2" />
            <Kpi label="V3" value={fmt(v3.projectedExpenses)} sub="previsione V3" />
            <Kpi
              label="Δ"
              value={`${v3.projectedExpenses >= v2.projectedExpenses ? '+' : ''}${fmt(v3.projectedExpenses - v2.projectedExpenses)}`}
              sub={`V3 ${v3.projectedExpenses > v2.projectedExpenses ? 'più alta' : 'più bassa'} di V2`}
              highlight={Math.abs(v3.projectedExpenses - v2.projectedExpenses) > 50}
            />
          </div>
        )}

        <div className="h-px bg-divider" />

        {/* Controls */}
        <div className="flex flex-wrap gap-2">
          <Toggle label="Confronto V2" value={compareV2} onChange={setCompareV2} />
          <Toggle
            label={withBias && v3.biasCorrectionApplied ? `Correzione bias (×${v3.biasFactor.toFixed(2)})` : 'Correzione bias'}
            value={withBias}
            onChange={setWithBias}
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <ReliabilityBar value={v3.overallReliability} />
          <span className={`text-xs font-medium ${rlColor(v3.overallReliability)}`}>
            Affidabilità {rlLabel(v3.overallReliability)} · {pct(v3.overallReliability)}
          </span>
        </div>
      </div>

      {/* Behavior legend */}
      <div className="glass-card rounded-2xl p-4">
        <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-3">Legenda comportamenti</p>
        <div className="flex flex-wrap gap-1.5">
          {(Object.entries(BEHAVIOR_META) as [CategoryBehavior, typeof BEHAVIOR_META[CategoryBehavior]][]).map(([key, meta]) => (
            <span key={key} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color} ${meta.bg}`}>
              {meta.label}
            </span>
          ))}
        </div>
      </div>

      {/* Category breakdown */}
      <div>
        <h2 className="text-base font-semibold text-primary mb-3">Per categoria</h2>
        <div className="space-y-2">
          {v3.categories
            .filter(c => c.projected > 0 || c.actualSoFar > 0)
            .sort((a, b) => b.projected - a.projected)
            .map(c => (
              <CategoryRow
                key={c.categoryId}
                v3={c}
                v2={compareV2 ? v2CatMap[c.categoryId] : undefined}
                label={expenseCategories.find(x => x.id === c.categoryId)?.label ?? c.categoryId}
                icon={expenseCategories.find(x => x.id === c.categoryId)?.icon ?? ''}
                rlColor={rlColor}
                fmt={fmt}
                pct={pct}
              />
            ))}
        </div>
      </div>

      {/* Backtest section */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowBacktest(s => !s)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-primary hover:bg-card-hover transition-colors"
        >
          <span>Backtest V3 (multi-snapshot)</span>
          <ChevronIcon open={showBacktest} />
        </button>
        {showBacktest && v3Backtest && (
          <div className="px-5 pb-5 border-t border-divider">
            <BacktestPanel result={v3Backtest} fmt={fmt} />
          </div>
        )}
        {showBacktest && !v3Backtest && (
          <div className="px-5 pb-5 pt-4 border-t border-divider">
            <p className="text-sm text-tertiary">Caricamento backtest…</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-tertiary mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-gold' : 'text-primary'}`}>{value}</p>
      <p className="text-[11px] text-tertiary">{sub}</p>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
        value ? 'bg-gold/15 text-gold' : 'bg-elevated text-tertiary'
      }`}
    >
      {label}
    </button>
  );
}

function ReliabilityBar({ value }: { value: number }) {
  const color = value >= 0.7 ? '#8A9270' : value >= 0.4 ? '#E6B95C' : '#C0706A';
  return (
    <div className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

function CategoryRow({
  v3, v2, label, icon, rlColor, fmt, pct,
}: {
  v3: CategoryForecastV3;
  v2?: CategoryForecastV2;
  label: string;
  icon: string;
  rlColor: (r: number) => string;
  fmt: (n: number) => string;
  pct: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const meta = BEHAVIOR_META[v3.behavior];
  const comp = v3.composition;
  const tb = v3.treatmentBreakdown;

  const v2Delta = v2 ? v3.projected - v2.projected : undefined;
  const showDelta = v2Delta !== undefined && Math.abs(v2Delta) >= 5;

  const treatmentChips = [
    { label: 'Variabile', count: tb.variableNormal },
    { label: 'Ricorrenti', count: tb.scheduledRecurring },
    { label: 'Pianificate', count: tb.plannedNormal + tb.plannedOneOff },
    { label: 'Straordinarie', count: tb.oneOffExtra },
  ].filter(c => c.count > 0);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors text-left"
      >
        <span className="text-lg w-6 flex-shrink-0 text-center">{icon}</span>
        <span className="flex-1 text-sm font-medium text-primary">{label}</span>

        {/* Confidence interval + projected */}
        <div className="text-right flex-shrink-0">
          <span className="text-sm font-semibold text-primary">{fmt(v3.projected)}</span>
          {v3.projectedHigh > v3.projectedLow && (
            <span className="text-[10px] text-tertiary block">
              {fmt(v3.projectedLow)}–{fmt(v3.projectedHigh)}
            </span>
          )}
        </div>

        {showDelta && (
          <span className={`text-[10px] font-medium flex-shrink-0 ${v2Delta! < 0 ? 'text-[#8A9270]' : 'text-[#C0706A]'}`}>
            {v2Delta! >= 0 ? '+' : ''}{fmt(v2Delta!)}
          </span>
        )}

        <span className={`text-xs ml-1 flex-shrink-0 ${rlColor(v3.reliability)}`}>
          {pct(v3.reliability)}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-divider space-y-2 pt-3">
          {/* Behavior badge + reasons */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color} ${meta.bg}`}>
              {meta.label}
            </span>
            {v3.behaviorResult.confidence !== 'low' && (
              <span className="text-[10px] text-tertiary">
                confidenza {v3.behaviorResult.confidence === 'high' ? 'alta' : 'media'}
              </span>
            )}
            {v3.biasCorrection !== 1.0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold">
                bias ×{v3.biasCorrection.toFixed(2)}
              </span>
            )}
          </div>

          {/* Composition */}
          {comp.actualVariableNormalSoFar > 0 && (
            <DetailRow label="Variabile registrato" value={fmt(comp.actualVariableNormalSoFar)} />
          )}
          {comp.actualScheduledSoFar > 0 && (
            <DetailRow label="Ricorrenti registrate" value={fmt(comp.actualScheduledSoFar)} />
          )}
          {comp.actualOneOffSoFar > 0 && (
            <DetailRow label="Straordinarie registrate" value={fmt(comp.actualOneOffSoFar)} />
          )}
          {comp.scheduledFuture > 0 && (
            <DetailRow label="Ricorrenti previste" value={fmt(comp.scheduledFuture)} />
          )}
          {comp.plannedNormalFuture > 0 && (
            <DetailRow label="Pianificate (normali)" value={fmt(comp.plannedNormalFuture)} />
          )}
          {comp.plannedOneOffFuture > 0 && (
            <DetailRow label="Pianificate (straordinarie)" value={fmt(comp.plannedOneOffFuture)} />
          )}
          <DetailRow label="Variabile stimata" value={fmt(comp.predictedVariableRemaining)} />

          {(v3.amountCurveRemaining > 0 || v3.countCurveRemaining > 0) && (
            <>
              <div className="h-px bg-divider" />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <DetailRow label="Curva importi" value={fmt(v3.amountCurveRemaining)} muted />
                <DetailRow label="Curva frequenza" value={fmt(v3.countCurveRemaining)} muted />
                <DetailRow label="Peso amt" value={pct(v3.blendAlpha)} muted />
                <DetailRow label="Peso freq" value={pct(1 - v3.blendAlpha)} muted />
              </div>
            </>
          )}

          {/* V3 reasons */}
          {v3.behaviorResult.reasons.length > 0 && (
            <div className="flex flex-col gap-0.5 pt-0.5">
              {v3.behaviorResult.reasons.map((r, i) => (
                <p key={i} className="text-[10px] text-tertiary italic">· {r}</p>
              ))}
            </div>
          )}

          {/* V2 comparison */}
          {v2 && (
            <div className="pt-1 border-t border-divider">
              <p className="text-[10px] text-tertiary uppercase tracking-wide mb-1">Confronto V2</p>
              <div className="flex justify-between">
                <span className="text-xs text-secondary">V2: {fmt(v2.projected)}</span>
                <span className="text-xs text-secondary">V3: {fmt(v3.projected)}</span>
                {showDelta && (
                  <span className={`text-xs font-medium ${v2Delta! < 0 ? 'text-[#8A9270]' : 'text-[#C0706A]'}`}>
                    Δ {v2Delta! >= 0 ? '+' : ''}{fmt(v2Delta!)}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Treatment chips */}
          {treatmentChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {treatmentChips.map(c => (
                <span key={c.label} className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-tertiary">
                  {c.label} · {c.count}
                </span>
              ))}
            </div>
          )}

          {v3.explanation && (
            <p className="text-xs text-tertiary pt-1 italic">{v3.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`text-xs ${muted ? 'text-tertiary' : 'text-secondary'}`}>{label}</span>
      <span className={`text-xs font-medium ${muted ? 'text-tertiary' : 'text-primary'}`}>{value}</span>
    </div>
  );
}

function BacktestPanel({ result, fmt }: { result: BacktestResultV3; fmt: (n: number) => string }) {
  if (result.snapshots.length === 0) {
    return <p className="text-sm text-tertiary pt-3">Nessun dato storico sufficiente per il backtest.</p>;
  }

  return (
    <div className="space-y-4 pt-3">
      {/* Summary metrics — total */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Kpi label="MAE" value={fmt(result.mae)} sub="errore assoluto medio" />
        <Kpi label="MedAE" value={fmt(result.medAE)} sub="errore assoluto mediano" />
        <Kpi label="WAPE" value={`${result.wape}%`} sub="errore relativo pesato" />
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Kpi label="Bias" value={`${result.bias >= 0 ? '+' : ''}${fmt(result.bias)}`} sub="errore sistematico" />
        <Kpi label="Fattore bias" value={`×${result.biasFactor.toFixed(2)}`} sub="correzione applicabile" />
        <Kpi label="R²" value={`${result.r2}`} sub="coeff. determinaz." />
      </div>

      {/* Component breakdown */}
      <div className="h-px bg-divider" />
      <p className="text-xs text-tertiary uppercase tracking-wide">Coda variabile</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Kpi label="MAE var." value={fmt(result.variableTail.mae)} sub="errore coda variabile" />
        <Kpi
          label="Bias var."
          value={`${result.variableTail.bias >= 0 ? '+' : ''}${fmt(result.variableTail.bias)}`}
          sub="sovra/sotto-stima"
        />
        <Kpi label="WAPE var." value={`${result.variableTail.wape.toFixed(1)}%`} sub="APE pesato variabile" />
      </div>
      <p className="text-xs text-tertiary uppercase tracking-wide">Deterministic</p>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Kpi label="MAE det." value={fmt(result.deterministic.mae)} sub="errore fisso/ricorrente" />
        <Kpi
          label="Bias det."
          value={`${result.deterministic.bias >= 0 ? '+' : ''}${fmt(result.deterministic.bias)}`}
          sub="sov/sot-stima fisso"
        />
        <Kpi label="WAPE det." value={`${result.deterministic.wape.toFixed(1)}%`} sub="APE pesato fisso" />
      </div>

      {/* Per-day breakdown with variable component */}
      {result.byDay.length > 0 && (
        <>
          <div className="h-px bg-divider" />
          <p className="text-xs text-tertiary uppercase tracking-wide">Per giorno snapshot</p>
          <div className="space-y-1">
            {result.byDay.map(d => (
              <div key={d.day} className="py-1.5 border-b border-divider last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-secondary w-16">Giorno {d.day}</span>
                  <span className="text-xs text-primary flex-1">MAE: {fmt(d.mae)}</span>
                  <span className={`text-xs font-medium ${Math.abs(d.bias) < 50 ? 'text-[#8A9270]' : 'text-gold'}`}>
                    Bias: {d.bias >= 0 ? '+' : ''}{fmt(d.bias)}
                  </span>
                  <span className="text-xs text-tertiary">{d.count} punti</span>
                </div>
                {(d.variableMae > 0 || d.variableBias !== 0) && (
                  <div className="flex items-center gap-3 mt-0.5 pl-16">
                    <span className="text-[10px] text-tertiary flex-1">
                      var. MAE {fmt(d.variableMae)}
                    </span>
                    <span className={`text-[10px] ${Math.abs(d.variableBias) < 30 ? 'text-tertiary' : 'text-[#C0706A]'}`}>
                      bias {d.variableBias >= 0 ? '+' : ''}{fmt(d.variableBias)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Sample snapshots */}
      <p className="text-xs text-tertiary uppercase tracking-wide">Campioni snapshot</p>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {result.snapshots.slice(0, 20).map((s, i) => (
          <div key={i} className="flex items-center gap-2 py-1 border-b border-divider last:border-0">
            <span className="text-[10px] text-secondary w-16">{s.monthKey}</span>
            <span className="text-[10px] text-tertiary w-8">g.{s.snapshotDay}</span>
            <span className="text-[10px] text-primary flex-1">Reale: {fmt(s.actual)}</span>
            <span className="text-[10px] text-primary flex-1">Prev: {fmt(s.predicted)}</span>
            <span className={`text-[10px] font-medium ${Math.abs(s.relError) <= 0.1 ? 'text-[#8A9270]' : Math.abs(s.relError) <= 0.2 ? 'text-gold' : 'text-[#C0706A]'}`}>
              {s.error >= 0 ? '+' : ''}{fmt(s.error)} ({Math.round(s.relError * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      className={`text-tertiary transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
