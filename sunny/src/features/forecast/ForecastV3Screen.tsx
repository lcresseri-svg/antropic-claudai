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
  recurring:          { label: '🔁 Ricorrente',         color: 'text-[#8A9270]',  bg: 'bg-[#8A9270]/15' },
  recurring_bundle:   { label: '📦 Bundle abbonamenti',  color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  fixed_monthly:      { label: '🔒 Fisso mensile',       color: 'text-[#8A9270]',  bg: 'bg-[#8A9270]/15' },
  periodic_fixed:     { label: '📅 Periodico',           color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  hybrid:             { label: '⚡ Ibrido',              color: 'text-gold',       bg: 'bg-gold/10' },
  variable_frequent:  { label: '📊 Variabile frequente', color: 'text-tertiary',   bg: 'bg-elevated' },
  variable_sparse:    { label: '📊 Variabile raro',      color: 'text-tertiary',   bg: 'bg-elevated' },
  volatile_mixed:     { label: '⚠️ Volatile',            color: 'text-[#C0706A]',  bg: 'bg-[#C0706A]/10' },
  stale:              { label: '💤 Inattiva',             color: 'text-tertiary',   bg: 'bg-elevated' },
  unknown:            { label: '❓ Sconosciuto',          color: 'text-tertiary',   bg: 'bg-elevated' },
};

function wapeGrade(wape: number): { label: string; color: string } {
  if (wape < 8)  return { label: 'A — Ottimo',   color: 'text-[#8A9270]' };
  if (wape < 15) return { label: 'B — Buono',    color: 'text-[#8A9270]' };
  if (wape < 25) return { label: 'C — Accettabile', color: 'text-gold' };
  return             { label: 'D — Migliorabile', color: 'text-[#C0706A]' };
}

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
  const fmtSigned = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(n)}`;
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
            <p className="text-xs text-tertiary uppercase tracking-wide mb-1">Spese previste a fine mese</p>
            <p className="text-3xl font-bold text-primary tracking-[-0.04em]">{fmt(v3.projectedExpenses)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-tertiary mb-1">Risparmio previsto</p>
            <p className={`text-xl font-semibold ${v3.savings >= 0 ? 'text-[#8A9270]' : 'text-[#C0706A]'}`}>
              {v3.savings >= 0 ? '+' : ''}{fmt(v3.savings)}
            </p>
          </div>
        </div>

        {compareV2 && <div className="h-px bg-divider" />}

        {compareV2 && (
          <div className="grid grid-cols-3 gap-3 text-center">
            <Kpi label="V2" value={fmt(v2.projectedExpenses)} sub="vecchio motore" />
            <Kpi label="V3" value={fmt(v3.projectedExpenses)} sub="nuovo motore" />
            <Kpi
              label="Differenza"
              value={`${v3.projectedExpenses >= v2.projectedExpenses ? '+' : ''}${fmt(v3.projectedExpenses - v2.projectedExpenses)}`}
              sub={`V3 ${v3.projectedExpenses > v2.projectedExpenses ? 'più alta' : 'più bassa'}`}
              highlight={Math.abs(v3.projectedExpenses - v2.projectedExpenses) > 50}
            />
          </div>
        )}

        <div className="h-px bg-divider" />

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
        <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-1">Comportamenti rilevati</p>
        <p className="text-[11px] text-tertiary mb-3">
          Il motore classifica ogni categoria in base alla regolarità storica per scegliere il metodo di stima più accurato.
        </p>
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
        <h2 className="text-base font-semibold text-primary mb-1">Dettaglio categorie</h2>
        <p className="text-xs text-tertiary mb-3">
          Clicca su una categoria per vedere come è composta la previsione e i segnali usati dal motore.
        </p>
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
                fmtSigned={fmtSigned}
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
          <span>Backtest V3 — accuratezza storica</span>
          <ChevronIcon open={showBacktest} />
        </button>
        {showBacktest && v3Backtest && (
          <div className="px-5 pb-5 border-t border-divider">
            <BacktestPanel result={v3Backtest} fmt={fmt} fmtSigned={fmtSigned} />
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
  v3, v2, label, icon, rlColor, fmt, fmtSigned, pct,
}: {
  v3: CategoryForecastV3;
  v2?: CategoryForecastV2;
  label: string;
  icon: string;
  rlColor: (r: number) => string;
  fmt: (n: number) => string;
  fmtSigned: (n: number) => string;
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

  const hasVariableSignals = v3.tailSamples > 0 || v3.paceRemainingSignal > 0;

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card-hover transition-colors text-left"
      >
        <span className="text-lg w-6 flex-shrink-0 text-center">{icon}</span>
        <span className="flex-1 text-sm font-medium text-primary">{label}</span>

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
        <div className="px-4 pb-3 border-t border-divider space-y-3 pt-3">
          {/* Behavior + confidence */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${meta.color} ${meta.bg}`}>
              {meta.label}
            </span>
            <span className="text-[10px] text-tertiary">
              confidenza {v3.behaviorResult.confidence === 'high' ? 'alta' : v3.behaviorResult.confidence === 'medium' ? 'media' : 'bassa'}
            </span>
            {v3.biasCorrection !== 1.0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/10 text-gold">
                bias ×{v3.biasCorrection.toFixed(2)}
              </span>
            )}
          </div>

          {/* Composition — what makes up the projected total */}
          <div>
            <p className="text-[10px] text-tertiary uppercase tracking-wide mb-1.5">Composizione previsione</p>
            <div className="space-y-1">
              {comp.actualVariableNormalSoFar > 0 && (
                <DetailRow label="Variabile già registrato" value={fmt(comp.actualVariableNormalSoFar)} hint="spesa variabile già avvenuta questo mese" />
              )}
              {comp.actualScheduledSoFar > 0 && (
                <DetailRow label="Ricorrenti già registrate" value={fmt(comp.actualScheduledSoFar)} hint="abbonamenti/ricorrenti già incassati" />
              )}
              {comp.actualOneOffSoFar > 0 && (
                <DetailRow label="Straordinarie già registrate" value={fmt(comp.actualOneOffSoFar)} hint="spese eccezionali già avvenute" />
              )}
              {comp.scheduledFuture > 0 && (
                <DetailRow label="Ricorrenti in arrivo" value={fmt(comp.scheduledFuture)} hint="abbonamenti/rate ancora da incassare" />
              )}
              {comp.plannedNormalFuture > 0 && (
                <DetailRow label="Pianificate in arrivo" value={fmt(comp.plannedNormalFuture)} />
              )}
              {comp.plannedOneOffFuture > 0 && (
                <DetailRow label="Straordinarie pianificate" value={fmt(comp.plannedOneOffFuture)} />
              )}
              <DetailRow
                label="Variabile stimata"
                value={fmt(comp.predictedVariableRemaining)}
                hint="stima statistica spesa futura non pianificata"
                highlight
              />
              <div className="flex justify-between items-baseline pt-1 border-t border-divider">
                <span className="text-xs font-semibold text-primary">Totale previsto</span>
                <span className="text-xs font-bold text-primary">{fmt(v3.projected)}</span>
              </div>
            </div>
          </div>

          {/* Variable estimation signals — only for statistical categories */}
          {hasVariableSignals && (
            <div>
              <p className="text-[10px] text-tertiary uppercase tracking-wide mb-1.5">Segnali di stima variabile</p>
              <div className="space-y-1 bg-elevated/50 rounded-lg p-2">
                {v3.paceRemainingSignal > 0 && (
                  <DetailRow label="Ritmo mese corrente" value={fmt(v3.paceRemainingSignal)} hint="estrapolazione dal ritmo di spesa attuale" muted />
                )}
                {v3.tailMedian > 0 && (
                  <DetailRow label="Coda storica (mediana)" value={fmt(v3.tailMedian)} hint="quanto si è speso dopo oggi nei mesi passati" muted />
                )}
                {v3.tailP75 > 0 && (
                  <DetailRow label="Cap P75 coda" value={fmt(v3.tailP75)} hint="tetto massimo applicato (75° percentile storico)" muted />
                )}
                {v3.tailSamples > 0 && (
                  <DetailRow label="Mesi campione coda" value={`${v3.tailSamples}`} hint="quanti mesi storici sono stati usati" muted />
                )}
                {v3.expectedRemainingTx > 0 && (
                  <DetailRow label="Transazioni attese" value={`${v3.expectedRemainingTx.toFixed(1)}`} hint="numero stimato di tx variabili rimanenti" muted />
                )}
                {v3.txCompletionFactor < 1 && (
                  <DetailRow
                    label="Completamento tx"
                    value={pct(1 - v3.txCompletionFactor)}
                    hint="% delle transazioni attese già registrate — più alto = meno coda stimata"
                    muted
                  />
                )}
              </div>
            </div>
          )}

          {/* Amount/count curve reference signals */}
          {(v3.amountCurveRemaining > 0 || v3.countCurveRemaining > 0) && (
            <div>
              <p className="text-[10px] text-tertiary uppercase tracking-wide mb-1.5">Curve di riferimento (non usate direttamente)</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-elevated/30 rounded-lg p-2">
                <DetailRow label="Curva importi" value={fmt(v3.amountCurveRemaining)} muted />
                <DetailRow label="Curva frequenza" value={fmt(v3.countCurveRemaining)} muted />
                <DetailRow label="Peso importi (α)" value={pct(v3.blendAlpha)} muted />
                <DetailRow label="Peso frequenza" value={pct(1 - v3.blendAlpha)} muted />
              </div>
            </div>
          )}

          {/* Behavior reasons from classifier */}
          {v3.behaviorResult.reasons.length > 0 && (
            <div>
              <p className="text-[10px] text-tertiary uppercase tracking-wide mb-1">Perché questo comportamento</p>
              <div className="flex flex-col gap-0.5">
                {v3.behaviorResult.reasons.map((r, i) => (
                  <p key={i} className="text-[10px] text-tertiary italic">· {r}</p>
                ))}
              </div>
            </div>
          )}

          {/* V2 comparison */}
          {v2 && (
            <div className="pt-1 border-t border-divider">
              <p className="text-[10px] text-tertiary uppercase tracking-wide mb-1">Confronto con motore V2</p>
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

          {/* Transaction classification chips */}
          {treatmentChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {treatmentChips.map(c => (
                <span key={c.label} className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-tertiary">
                  {c.label} · {c.count}
                </span>
              ))}
            </div>
          )}

          {v3.explanation && (
            <p className="text-xs text-tertiary italic">{v3.explanation}</p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label, value, hint, muted, highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  muted?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <div className="flex-1 min-w-0">
        <span className={`text-xs ${muted ? 'text-tertiary' : 'text-secondary'}`}>{label}</span>
        {hint && <p className="text-[10px] text-tertiary/70 leading-tight">{hint}</p>}
      </div>
      <span className={`text-xs font-medium flex-shrink-0 ${highlight ? 'text-gold' : muted ? 'text-tertiary' : 'text-primary'}`}>
        {value}
      </span>
    </div>
  );
}

function BacktestPanel({
  result, fmt, fmtSigned,
}: {
  result: BacktestResultV3;
  fmt: (n: number) => string;
  fmtSigned: (n: number) => string;
}) {
  if (result.snapshots.length === 0) {
    return <p className="text-sm text-tertiary pt-3">Nessun dato storico sufficiente per il backtest.</p>;
  }

  const grade = wapeGrade(result.wape);
  const biasDir = result.bias > 20 ? '↑ sovrastima' : result.bias < -20 ? '↓ sottostima' : '≈ centrato';
  const biasDirColor = Math.abs(result.bias) < 50 ? 'text-[#8A9270]' : 'text-[#C0706A]';

  return (
    <div className="space-y-5 pt-3">
      {/* Quality grade */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-elevated/50">
        <div>
          <p className={`text-lg font-bold ${grade.color}`}>{grade.label}</p>
          <p className="text-[11px] text-tertiary">
            basato su {result.snapshots.length} snapshot su {Math.round(result.snapshots.length / 5)} mesi storici
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-tertiary">WAPE</p>
          <p className={`text-xl font-bold ${grade.color}`}>{result.wape}%</p>
        </div>
      </div>

      {/* Section: Overall accuracy */}
      <div>
        <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Accuratezza totale</p>
        <p className="text-[11px] text-tertiary mb-2">
          Quante euro di errore fa il motore in media, guardando tutti i giorni snapshot (5, 10, 15, 20, 25 di ogni mese).
        </p>
        <div className="grid grid-cols-3 gap-3 text-center">
          <Kpi
            label="Errore medio"
            value={fmt(result.mae)}
            sub="MAE: media degli errori assoluti"
          />
          <Kpi
            label="Errore mediano"
            value={fmt(result.medAE)}
            sub="MedAE: la metà degli snapshot è sotto"
          />
          <Kpi
            label="Errore relativo"
            value={`${result.wape}%`}
            sub="WAPE: errore in % del totale reale"
          />
        </div>
        <div className="grid grid-cols-3 gap-3 text-center mt-3">
          <Kpi
            label="Bias sistematico"
            value={`${result.bias >= 0 ? '+' : ''}${fmt(result.bias)}`}
            sub={biasDir}
          />
          <div>
            <p className="text-xs text-tertiary mb-0.5">Direzione bias</p>
            <p className={`text-sm font-semibold ${biasDirColor}`}>{biasDir}</p>
            <p className="text-[11px] text-tertiary">+: sovrastima · −: sottostima</p>
          </div>
          <Kpi
            label="R²"
            value={`${result.r2}`}
            sub="correlazione previsione/reale (1.0 = perfetto)"
          />
        </div>
      </div>

      {/* Section: Component breakdown */}
      <div className="h-px bg-divider" />
      <div>
        <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Accuratezza per componente</p>
        <p className="text-[11px] text-tertiary mb-3">
          La previsione è composta da due parti. La parte <strong className="text-secondary">deterministica</strong> (fisso/ricorrente)
          e la parte <strong className="text-secondary">variabile</strong> (stima statistica). Idealmente gli errori delle due componenti
          sono diversi — se sono uguali al totale c'è un bug nei calcoli.
        </p>

        <div className="space-y-3">
          {/* Variable component */}
          <div className="rounded-xl bg-elevated/50 p-3">
            <p className="text-xs font-medium text-secondary mb-2">
              📊 Componente variabile
              <span className="text-[10px] text-tertiary font-normal ml-2">
                (stima statistica spesa futura imprevedibile)
              </span>
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Kpi label="MAE variabile" value={fmt(result.variableTail.mae)} sub="errore medio coda" />
              <Kpi
                label="Bias variabile"
                value={`${result.variableTail.bias >= 0 ? '+' : ''}${fmt(result.variableTail.bias)}`}
                sub={result.variableTail.bias > 20 ? '↑ sovrastima coda' : result.variableTail.bias < -20 ? '↓ sottostima coda' : '≈ centrato'}
              />
              <Kpi label="WAPE variabile" value={`${result.variableTail.wape.toFixed(1)}%`} sub="errore % coda" />
            </div>
          </div>

          {/* Deterministic component */}
          <div className="rounded-xl bg-elevated/50 p-3">
            <p className="text-xs font-medium text-secondary mb-2">
              🔒 Componente deterministica
              <span className="text-[10px] text-tertiary font-normal ml-2">
                (fisso/ricorrente/pianificato — dovrebbe essere quasi zero)
              </span>
            </p>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Kpi label="MAE determin." value={fmt(result.deterministic.mae)} sub="errore medio fisso" />
              <Kpi
                label="Bias determin."
                value={`${result.deterministic.bias >= 0 ? '+' : ''}${fmt(result.deterministic.bias)}`}
                sub={result.deterministic.bias > 20 ? '↑ ricorrenti mancanti' : result.deterministic.bias < -20 ? '↓ ricorrenti doppi' : '≈ ok'}
              />
              <Kpi label="WAPE determin." value={`${result.deterministic.wape.toFixed(1)}%`} sub="errore % fisso" />
            </div>
          </div>
        </div>
      </div>

      {/* Section: Per-day progression */}
      {result.byDay.length > 0 && (
        <>
          <div className="h-px bg-divider" />
          <div>
            <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Accuratezza per giorno snapshot</p>
            <p className="text-[11px] text-tertiary mb-2">
              Come cambia l'accuratezza a seconda di quando nel mese si fa la previsione.
              L'errore al giorno 5 deve essere molto più alto che al giorno 25.
            </p>
            <div className="space-y-1.5">
              {result.byDay.map(d => {
                const biasColor = Math.abs(d.bias) < 80 ? 'text-[#8A9270]' : Math.abs(d.bias) < 200 ? 'text-gold' : 'text-[#C0706A]';
                const maxMae = Math.max(...result.byDay.map(x => x.mae));
                const barWidth = maxMae > 0 ? Math.round((d.mae / maxMae) * 100) : 0;
                return (
                  <div key={d.day} className="py-2 border-b border-divider last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-secondary w-16 flex-shrink-0">Giorno {d.day}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-elevated overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gold/60"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-primary w-16 text-right flex-shrink-0">
                        {fmt(d.mae)}
                      </span>
                      <span className={`text-xs font-medium w-24 text-right flex-shrink-0 ${biasColor}`}>
                        {d.bias >= 0 ? '+' : ''}{fmt(d.bias)}
                      </span>
                      <span className="text-[10px] text-tertiary w-12 text-right flex-shrink-0">{d.count} m.</span>
                    </div>
                    {(d.variableMae > 0 || d.variableBias !== 0) && (
                      <div className="flex items-center gap-2 pl-16">
                        <span className="text-[10px] text-tertiary flex-1">
                          var. MAE {fmt(d.variableMae)}
                        </span>
                        <span className={`text-[10px] ${Math.abs(d.variableBias) < 80 ? 'text-tertiary' : 'text-[#C0706A]'}`}>
                          bias {d.variableBias >= 0 ? '+' : ''}{fmt(d.variableBias)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[10px] text-tertiary mt-1.5 px-16">
              <span>MAE</span>
              <span>Bias (+ sovrastima · − sottostima)</span>
              <span>mesi</span>
            </div>
          </div>
        </>
      )}

      {/* Section: Bias correction */}
      <div className="h-px bg-divider" />
      <div className="rounded-xl bg-elevated/50 p-3">
        <p className="text-xs font-semibold text-secondary mb-1">Fattore di correzione bias: ×{result.biasFactor.toFixed(2)}</p>
        <p className="text-[11px] text-tertiary">
          {result.biasFactor > 1.05
            ? `Il motore sotto-stimava la spesa variabile: moltiplicare per ${result.biasFactor.toFixed(2)} la porta verso il reale.`
            : result.biasFactor < 0.95
            ? `Il motore sovra-stimava la spesa variabile: ridurre a ×${result.biasFactor.toFixed(2)} la porta verso il reale.`
            : 'Il motore è già ben calibrato — la correzione bias è minima (×≈1.0).'}
          {' '}Attiva "Correzione bias" in alto per applicarla.
        </p>
      </div>

      {/* Section: Raw snapshots */}
      <div className="h-px bg-divider" />
      <div>
        <p className="text-xs font-semibold text-tertiary uppercase tracking-wide mb-2">Campioni snapshot (ultimi 20)</p>
        <p className="text-[11px] text-tertiary mb-2">
          Ogni riga è un test: il motore riceve solo i dati fino al giorno indicato, poi confronta la sua previsione con il reale di fine mese.
        </p>
        <div className="space-y-0.5 max-h-52 overflow-y-auto">
          {result.snapshots.slice(0, 20).map((s, i) => {
            const errColor = Math.abs(s.relError) <= 0.1 ? 'text-[#8A9270]' : Math.abs(s.relError) <= 0.2 ? 'text-gold' : 'text-[#C0706A]';
            return (
              <div key={i} className="flex items-center gap-2 py-1 border-b border-divider/50 last:border-0">
                <span className="text-[10px] text-secondary w-14 flex-shrink-0">{s.monthKey}</span>
                <span className="text-[10px] text-tertiary w-8 flex-shrink-0">g.{s.snapshotDay}</span>
                <span className="text-[10px] text-secondary flex-1">reale: {fmt(s.actual)}</span>
                <span className="text-[10px] text-secondary flex-1">prev: {fmt(s.predicted)}</span>
                <span className={`text-[10px] font-medium ${errColor}`}>
                  {s.error >= 0 ? '+' : ''}{fmt(s.error)}
                  <span className="text-tertiary ml-0.5">({Math.round(s.relError * 100)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
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
