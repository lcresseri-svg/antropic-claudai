// Forecast unificato (admin-only, flag `forecast_unified`): stesso contratto di
// output su motori intercambiabili (V3 baseline / V4 sperimentale) + backtest
// contro le baseline naive. Tutti i numeri da forecastService/forecastBaselines.
import { useMemo, useState } from 'react';
import { Transaction, CategoryDef } from '../../../types';
import { formatCurrency } from '../../../utils';
import { computeUnifiedForecast, ForecastEngineName, ForecastServiceInput } from './forecastService';
import { runBaselineBacktest } from './forecastBaselines';

interface Props {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  categoryBudgets?: Record<string, number>;
  budgetHistory?: ForecastServiceInput['budgetHistory'];
  currentMonthBudgetStatus?: ForecastServiceInput['currentMonthBudgetStatus'];
}

const CONF_LABEL = { low: 'bassa', medium: 'media', high: 'alta' } as const;

export function UnifiedForecastPanel(p: Props) {
  const [engine, setEngine] = useState<ForecastEngineName>('v3');
  const now = useMemo(() => new Date(), []);

  const unified = useMemo(() => computeUnifiedForecast(engine, {
    transactions: p.transactions,
    expenseCategories: p.expenseCategories,
    monthlyIncome: p.monthlyIncome,
    monthlyInvestments: p.monthlyInvestments,
    categoryBudgets: p.categoryBudgets,
    budgetHistory: p.budgetHistory,
    currentMonthBudgetStatus: p.currentMonthBudgetStatus,
    now,
  }), [engine, p.transactions, p.expenseCategories, p.monthlyIncome, p.monthlyInvestments,
    p.categoryBudgets, p.budgetHistory, p.currentMonthBudgetStatus, now]);

  const backtest = useMemo(
    () => runBaselineBacktest(p.transactions, { now }),
    [p.transactions, now],
  );

  const b = unified.breakdown;
  const breakdown: { label: string; value: number }[] = [
    { label: 'Registrato', value: b.recorded },
    { label: 'Programmato', value: b.scheduled },
    { label: 'Ricorrente', value: b.recurring },
    { label: 'Variabile stimato', value: b.variable },
    { label: 'Eccezionale / stagionale', value: b.exceptional },
    { label: 'Segnale budget', value: b.budgetSignal },
    { label: 'Correzione residua', value: b.residual },
  ];

  return (
    <section className="bg-card rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-primary">Forecast unificato (anteprima admin)</h2>
          <p className="text-[11px] text-secondary">
            Mese {unified.targetMonth} · confidenza {CONF_LABEL[unified.confidence]} ·
            storico {unified.dataQuality.monthsOfHistory} mesi
          </p>
        </div>
        <div className="flex gap-1.5" role="tablist" aria-label="Motore">
          {(['v3', 'v4'] as const).map(e => (
            <button key={e} type="button" role="tab" aria-selected={engine === e}
              onClick={() => setEngine(e)}
              className={`px-3 py-2 min-h-[36px] rounded-xl text-xs font-medium transition-colors ${
                engine === e ? 'bg-gold/12 text-gold' : 'text-secondary hover:text-primary bg-elevated'
              }`}>
              {e.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-3xl font-bold text-primary tracking-[-0.03em]">{formatCurrency(unified.central)}</p>
        <p className="text-[11px] text-secondary">
          {unified.low !== unified.high
            ? <>Intervallo {formatCurrency(unified.low)} – {formatCurrency(unified.high)}</>
            : 'Il motore V4 non emette ancora un intervallo (mai inventato).'}
        </p>
      </div>

      <dl className="space-y-1.5 text-sm">
        {breakdown.map(r => (
          <div key={r.label} className="flex justify-between">
            <dt className="text-secondary">{r.label}</dt>
            <dd className="text-primary">{formatCurrency(r.value)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-divider pt-1.5 font-semibold">
          <dt className="text-primary">Totale (stima centrale)</dt>
          <dd className="text-primary">{formatCurrency(unified.central)}</dd>
        </div>
      </dl>

      {unified.drivers.length > 0 && (
        <div>
          <p className="text-[11px] text-secondary mb-1">Driver principali</p>
          <ul className="space-y-1">
            {unified.drivers.map(d => (
              <li key={d.categoryId} className="flex justify-between text-xs">
                <span className="text-secondary">{d.label}</span>
                <span className="text-primary">{formatCurrency(d.projected)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(unified.warnings.length > 0 || unified.dataQuality.notes.length > 0) && (
        <ul className="space-y-0.5">
          {unified.warnings.map((w, i) => <li key={`w${i}`} className="text-[11px] text-gold">⚠ {w}</li>)}
          {unified.dataQuality.notes.map((n, i) => <li key={`n${i}`} className="text-[11px] text-secondary">· {n}</li>)}
        </ul>
      )}

      <div>
        <p className="text-[11px] text-secondary mb-1.5">
          Backtest baseline (ultimi {backtest.months.length} mesi chiusi) — riferimento per validare i motori
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-secondary">
                <th className="py-1 pr-2 font-medium">Modello</th>
                <th className="py-1 pr-2 font-medium text-right">MAE</th>
                <th className="py-1 pr-2 font-medium text-right">MdAE</th>
                <th className="py-1 pr-2 font-medium text-right">Bias</th>
                <th className="py-1 font-medium text-right">Err. rel.</th>
              </tr>
            </thead>
            <tbody>
              {backtest.baselines.map(m => (
                <tr key={m.model} className="text-primary border-t border-divider">
                  <td className="py-1.5 pr-2">{m.model}</td>
                  <td className="py-1.5 pr-2 text-right">{m.mae != null ? formatCurrency(m.mae) : '—'}</td>
                  <td className="py-1.5 pr-2 text-right">{m.mdae != null ? formatCurrency(m.mdae) : '—'}</td>
                  <td className="py-1.5 pr-2 text-right">{m.bias != null ? formatCurrency(m.bias) : '—'}</td>
                  <td className="py-1.5 text-right">{m.relErrMedian != null ? `${Math.round(m.relErrMedian * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-secondary mt-1.5">
          I vecchi motori restano la baseline finché il forecast unificato non li batte stabilmente qui.
        </p>
      </div>
    </section>
  );
}
