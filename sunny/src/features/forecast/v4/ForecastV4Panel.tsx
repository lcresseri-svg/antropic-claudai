/**
 * Admin-only diagnostics panel for Forecast Engine V4.
 *
 * Rendered ONLY when the caller has already passed isForecastV4EnabledForUser
 * (see forecastFeatureGate.ts). Never mount this for normal users.
 *
 * Shows the V4 forecast, its component decomposition, a V3 comparison, the
 * per-category breakdown (spent / before-budget / budget / gap / reliability /
 * adjustment / final / reasons) and an on-demand 4-model backtest.
 */
import { useMemo, useState } from 'react';
import { Transaction, CategoryDef } from '../../../types';
import { computeForecastV4 } from './forecastEngineV4';
import { runBacktestV4 } from './forecastBacktestV4';
import {
  compareV4toV3, overallConfidenceV4, componentWeightsV4, buildForecastV4DiagnosticsReport,
} from './forecastDiagnosticsV4';
import {
  ForecastV4CategoryResult, ForecastBacktestV4Result, BudgetHistoryEntryV4, ConfidenceV4,
} from './forecastTypesV4';
import { FORECAST_V4_WARNING } from './forecastEngineV4';

interface Props {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  categoryBudgets: Record<string, number>;
  budgetHistory?: BudgetHistoryEntryV4[];
  /** V3 projected expenses for the comparison row. */
  v3ProjectedExpenses: number;
}

const fmt = (n: number) => `€${Math.round(Math.abs(n)).toLocaleString('it-IT')}`;
const fmtSigned = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(n)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const CONF_META: Record<ConfidenceV4, { label: string; cls: string }> = {
  high:   { label: 'Alta',  cls: 'text-[#8A9270] bg-[#8A9270]/15' },
  medium: { label: 'Media', cls: 'text-gold bg-gold/10' },
  low:    { label: 'Bassa', cls: 'text-[#C0706A] bg-[#C0706A]/10' },
};

export function ForecastV4Panel({
  transactions, expenseCategories, categoryBudgets, budgetHistory, v3ProjectedExpenses,
}: Props) {
  const [applyBudget, setApplyBudget] = useState(true);
  const [showBacktest, setShowBacktest] = useState(false);

  const v4 = useMemo(() => computeForecastV4({
    transactions, expenseCategories, categoryBudgets, budgetHistory,
    applyBudgetSignal: applyBudget,
  }), [transactions, expenseCategories, categoryBudgets, budgetHistory, applyBudget]);

  const backtest = useMemo<ForecastBacktestV4Result[] | null>(() => {
    if (!showBacktest) return null;
    return runBacktestV4(transactions, expenseCategories, { categoryBudgets, budgetHistory });
  }, [showBacktest, transactions, expenseCategories, categoryBudgets, budgetHistory]);

  const comparison = compareV4toV3(v4.totalForecast, v3ProjectedExpenses);
  const weights = componentWeightsV4(v4);
  const overall = overallConfidenceV4(v4);
  const c = v4.components;

  const categories = Object.values(v4.byCategory)
    .filter(cat => cat.totalForecast > 0 || cat.spentToDate > 0)
    .sort((a, b) => b.totalForecast - a.totalForecast);

  const handleExport = () => {
    const report = buildForecastV4DiagnosticsReport({
      result: v4, v3ProjectedExpenses, backtest: backtest ?? undefined,
    });
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sunny-forecast-v4-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="glass-card rounded-2xl p-5 space-y-5 border border-gold/20">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gold/15 text-gold">Admin · V4</span>
          <span className="text-xs text-tertiary">planned · seasonal · budget-aware</span>
        </div>
        <h2 className="text-lg font-bold text-primary tracking-[-0.03em]">Previsione V4</h2>
      </div>

      {/* Total + V3 comparison */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Kpi label="V4" value={fmt(v4.totalForecast)} highlight />
        <Kpi label="V3" value={fmt(comparison.v3Total)} />
        <Kpi
          label="Differenza"
          value={`${comparison.delta >= 0 ? '+' : ''}${fmt(comparison.delta)}`}
          sub={`${comparison.deltaPct >= 0 ? '+' : ''}${comparison.deltaPct}%`}
        />
      </div>

      {/* Component decomposition */}
      <div>
        <p className="text-[10px] text-tertiary uppercase tracking-wide mb-1.5">Composizione</p>
        <div className="space-y-1">
          <CompRow label="Speso finora" value={c.spentToDate} weight={weights.spentToDate} />
          <CompRow label="Pianificato manuale" value={c.plannedManualRemaining} weight={weights.plannedManualRemaining} />
          <CompRow label="Ricorrente futuro" value={c.recurringRemaining} weight={weights.recurringRemaining} />
          <CompRow label="Stagionale rilevato" value={c.seasonalDetectedRemaining} weight={weights.seasonalDetectedRemaining} />
          <CompRow label="Residuo statistico (P60)" value={c.residualStatisticalRemaining} weight={weights.residualStatisticalRemaining} />
          <CompRow label="Aggiustamento budget" value={c.budgetSignalAdjustment} weight={weights.budgetSignalAdjustment} signed />
          <div className="flex justify-between items-baseline pt-1 border-t border-divider">
            <span className="text-xs font-semibold text-primary">Totale V4</span>
            <span className="text-xs font-bold text-primary">{fmt(v4.totalForecast)}</span>
          </div>
        </div>
      </div>

      {/* Confidence + planned coverage + toggle */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${CONF_META[overall].cls}`}>
          Affidabilità {CONF_META[overall].label}
        </span>
        <span className="text-[11px] text-tertiary">
          Copertura pianificata {pct(v4.diagnostics.plannedCoverageRatio)}
        </span>
        <button
          onClick={() => setApplyBudget(v => !v)}
          className={`text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${applyBudget ? 'bg-gold/15 text-gold' : 'bg-elevated text-tertiary'}`}
        >
          Segnale budget {applyBudget ? 'ON' : 'OFF'}
        </button>
      </div>

      {/* Warning */}
      <p className="text-[11px] text-tertiary bg-elevated/50 rounded-lg p-2.5 leading-relaxed">
        ⚠ {FORECAST_V4_WARNING}
      </p>

      {/* Per-category */}
      <div>
        <p className="text-[10px] text-tertiary uppercase tracking-wide mb-2">Dettaglio categorie</p>
        <div className="space-y-2">
          {categories.map(cat => (
            <CategoryRowV4 key={cat.categoryId} cat={cat} />
          ))}
        </div>
      </div>

      {/* Backtest */}
      <div className="border-t border-divider pt-3">
        <button
          onClick={() => setShowBacktest(s => !s)}
          className="w-full flex items-center justify-between text-sm font-medium text-primary"
        >
          <span>Backtest V4 — confronto modelli</span>
          <span className="text-tertiary text-xs">{showBacktest ? '−' : '+'}</span>
        </button>
        {showBacktest && backtest && <BacktestTable results={backtest} />}
        {showBacktest && !backtest && <p className="text-xs text-tertiary mt-2">Calcolo…</p>}
      </div>

      <button
        onClick={handleExport}
        className="w-full py-2.5 rounded-xl bg-gold/15 text-gold font-medium text-sm hover:bg-gold/25 transition-colors"
      >
        Esporta diagnostica V4 (JSON)
      </button>
    </div>
  );
}

function Kpi({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-tertiary mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-gold' : 'text-primary'}`}>{value}</p>
      {sub && <p className="text-[10px] text-tertiary">{sub}</p>}
    </div>
  );
}

function CompRow({ label, value, weight, signed }: { label: string; value: number; weight: number; signed?: boolean }) {
  if (value === 0) return null;
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-secondary flex-1">{label}</span>
      <span className="text-[10px] text-tertiary">{weight}%</span>
      <span className="text-xs font-medium text-primary w-20 text-right">
        {signed ? fmtSigned(value) : fmt(value)}
      </span>
    </div>
  );
}

function CategoryRowV4({ cat }: { cat: ForecastV4CategoryResult }) {
  const [open, setOpen] = useState(false);
  const conf = CONF_META[cat.confidence];
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-card-hover transition-colors">
        <span className="flex-1 text-sm font-medium text-primary truncate">{cat.categoryLabel}</span>
        <span className="text-sm font-semibold text-primary">{fmt(cat.totalForecast)}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${conf.cls}`}>{conf.label}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-divider pt-2 space-y-1">
          <DetailRow label="Speso finora" value={fmt(cat.spentToDate)} />
          {cat.plannedManualRemaining > 0 && <DetailRow label="Pianificato manuale" value={fmt(cat.plannedManualRemaining)} />}
          {cat.recurringRemaining > 0 && <DetailRow label="Ricorrente futuro" value={fmt(cat.recurringRemaining)} />}
          {cat.seasonalDetectedRemaining > 0 && <DetailRow label="Stagionale rilevato" value={fmt(cat.seasonalDetectedRemaining)} />}
          {cat.residualStatisticalRemaining > 0 && <DetailRow label="Residuo statistico (P60)" value={fmt(cat.residualStatisticalRemaining)} />}
          <DetailRow label="Forecast prima del budget" value={fmt(cat.forecastBeforeBudget)} />
          {cat.budget != null && (
            <>
              <DetailRow label="Budget inserito" value={fmt(cat.budget)} />
              <DetailRow label="Gap" value={fmtSigned(cat.budgetGap ?? 0)} />
              <DetailRow label="Reliability" value={pct(cat.budgetReliability ?? 0)} />
              <DetailRow label="Aggiustamento applicato" value={fmtSigned(cat.budgetSignalAdjustment ?? 0)} highlight />
            </>
          )}
          <div className="flex justify-between items-baseline pt-1 border-t border-divider">
            <span className="text-xs font-semibold text-primary">Forecast finale</span>
            <span className="text-xs font-bold text-primary">{fmt(cat.totalForecast)}</span>
          </div>
          {cat.reasons.length > 0 && (
            <div className="pt-1">
              {cat.reasons.map((r, i) => (
                <p key={i} className="text-[10px] text-tertiary italic">· {r}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-secondary">{label}</span>
      <span className={`text-xs font-medium ${highlight ? 'text-gold' : 'text-primary'}`}>{value}</span>
    </div>
  );
}

function BacktestTable({ results }: { results: ForecastBacktestV4Result[] }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-tertiary text-[10px] uppercase">
              <th className="text-left font-medium py-1">Modello</th>
              <th className="text-right font-medium py-1">WAPE</th>
              <th className="text-right font-medium py-1">MAE</th>
              <th className="text-right font-medium py-1">Bias</th>
              <th className="text-right font-medium py-1">RMSE</th>
              <th className="text-right font-medium py-1">R²</th>
            </tr>
          </thead>
          <tbody>
            {results.map(r => (
              <tr key={r.modelName} className="border-t border-divider/50">
                <td className="py-1.5 text-secondary">{r.modelName}</td>
                <td className="py-1.5 text-right font-semibold text-primary">{r.wape}%</td>
                <td className="py-1.5 text-right text-primary">{fmt(r.mae)}</td>
                <td className="py-1.5 text-right text-primary">{fmtSigned(r.bias)}</td>
                <td className="py-1.5 text-right text-primary">{fmt(r.rmse)}</td>
                <td className="py-1.5 text-right text-primary">{r.r2}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Budget signal impact (from V4 + budget) */}
      {(() => {
        const v4b = results.find(r => r.modelName === 'V4 + budget');
        if (!v4b) return null;
        const helped = v4b.diagnostics.budgetSignalHelped.slice(0, 5);
        const hurt = v4b.diagnostics.budgetSignalHurt.slice(0, 5);
        return (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-[#8A9270] uppercase tracking-wide mb-1">Budget ha aiutato</p>
              {helped.length === 0 && <p className="text-[10px] text-tertiary">—</p>}
              {helped.map(h => (
                <p key={h.categoryId} className="text-[10px] text-secondary">{h.categoryLabel} ({fmt(h.errorDelta)})</p>
              ))}
            </div>
            <div>
              <p className="text-[10px] text-[#C0706A] uppercase tracking-wide mb-1">Budget ha peggiorato</p>
              {hurt.length === 0 && <p className="text-[10px] text-tertiary">—</p>}
              {hurt.map(h => (
                <p key={h.categoryId} className="text-[10px] text-secondary">{h.categoryLabel} (+{fmt(h.errorDelta)})</p>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
