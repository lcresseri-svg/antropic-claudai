/**
 * Baseline backtest (admin-only diagnostics, flag `forecast_unified`).
 *
 * Rolling backtest over up to 12 CLOSED months that compares an engine's
 * end-of-month expense estimate against four naive baselines:
 *
 *   - mediana degli ultimi 3 mesi,
 *   - media robusta (winsorizzata a 2.5× la mediana),
 *   - ultimo mese,
 *   - stesso mese dell'anno precedente.
 *
 * Metrics per model: MAE, MdAE, bias (signed), errore relativo mediano
 * (|err| / actual, only on months with actual > ε) and — for the engine, which
 * carries an interval — coverage (fraction of months whose actual fell inside
 * [low, high]). Everything is deterministic and computed on demand; nothing is
 * persisted.
 */
import { Transaction, ownShare } from '../../../types';

export interface BaselinePrediction {
  month: string;            // YYYY-MM being predicted
  actual: number;
  predicted: number | null; // null = baseline not computable for this month
}

export interface BaselineMetrics {
  model: string;
  samples: number;
  mae: number | null;
  mdae: number | null;
  bias: number | null;       // mean signed error (predicted − actual)
  relErrMedian: number | null; // median |err|/actual on months with actual > 1€
  /** Engine only: fraction of months with actual inside [low, high]. */
  coverage: number | null;
  predictions: BaselinePrediction[];
}

export interface EngineMonthEstimate {
  month: string;
  predicted: number;
  low?: number;
  high?: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Realized total expenses (own share) per YYYY-MM, ascending keys. */
export function monthlyExpenseTotals(transactions: Transaction[], uptoISO: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of transactions) {
    if (t.projected || t.type !== 'expense' || t.date > uptoISO) continue;
    const key = t.date.slice(0, 7);
    out.set(key, (out.get(key) ?? 0) + ownShare(t));
  }
  return new Map([...out.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Winsorized mean: values above 2.5× the median are capped (same spirit as budgetUtils.robustAvg). */
function robustMean(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length <= 2) return values.reduce((a, b) => a + b, 0) / values.length;
  const med = median(values.filter(v => v > 0)) ?? 0;
  const cap = med * 2.5;
  const capped = med > 0 ? values.map(v => Math.min(v, cap)) : values;
  return capped.reduce((a, b) => a + b, 0) / capped.length;
}

function prevMonthKey(key: string, back = 1): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return d.toISOString().slice(0, 7);
}

export type BaselineModel = 'median3' | 'robust_mean' | 'last_month' | 'same_month_last_year';

export const BASELINE_LABELS: Record<BaselineModel, string> = {
  median3: 'Mediana ultimi 3 mesi',
  robust_mean: 'Media robusta (6 mesi)',
  last_month: 'Ultimo mese',
  same_month_last_year: 'Stesso mese anno precedente',
};

/** Predict `month` with a baseline, using ONLY months strictly before it. */
export function baselinePredict(
  model: BaselineModel,
  month: string,
  totals: Map<string, number>,
): number | null {
  const past = (n: number) => {
    const out: number[] = [];
    for (let i = 1; i <= n; i++) {
      const v = totals.get(prevMonthKey(month, i));
      if (v != null) out.push(v);
    }
    return out;
  };
  switch (model) {
    case 'median3': return median(past(3));
    case 'robust_mean': return robustMean(past(6));
    case 'last_month': return totals.get(prevMonthKey(month, 1)) ?? null;
    case 'same_month_last_year': return totals.get(prevMonthKey(month, 12)) ?? null;
  }
}

function metricsFor(model: string, predictions: BaselinePrediction[], intervals?: Map<string, { low: number; high: number }>): BaselineMetrics {
  const usable = predictions.filter(p => p.predicted != null) as (BaselinePrediction & { predicted: number })[];
  if (usable.length === 0) {
    return { model, samples: 0, mae: null, mdae: null, bias: null, relErrMedian: null, coverage: null, predictions };
  }
  const errs = usable.map(p => p.predicted - p.actual);
  const absErrs = errs.map(Math.abs);
  const rel = usable.filter(p => p.actual > 1).map(p => Math.abs(p.predicted - p.actual) / p.actual);
  let coverage: number | null = null;
  if (intervals) {
    const withInterval = usable.filter(p => intervals.has(p.month));
    if (withInterval.length > 0) {
      const inside = withInterval.filter(p => {
        const i = intervals.get(p.month)!;
        return p.actual >= i.low && p.actual <= i.high;
      }).length;
      coverage = r2(inside / withInterval.length);
    }
  }
  return {
    model,
    samples: usable.length,
    mae: r2(absErrs.reduce((a, b) => a + b, 0) / absErrs.length),
    mdae: r2(median(absErrs) ?? 0),
    bias: r2(errs.reduce((a, b) => a + b, 0) / errs.length),
    relErrMedian: rel.length > 0 ? r2(median(rel) ?? 0) : null,
    coverage,
    predictions,
  };
}

export interface BaselineBacktestResult {
  /** Months evaluated (closed months, ascending). */
  months: string[];
  baselines: BaselineMetrics[];
  /** Metrics for the engine estimates, when provided. */
  engine: BaselineMetrics | null;
}

/**
 * Rolling backtest over up to `maxMonths` closed months (current month always
 * excluded). `engineEstimates` — one full-month estimate per closed month —
 * are optional: baselines alone still produce a useful reference table.
 */
export function runBaselineBacktest(
  transactions: Transaction[],
  opts?: { now?: Date; maxMonths?: number; engineEstimates?: EngineMonthEstimate[] },
): BaselineBacktestResult {
  const now = opts?.now ?? new Date();
  const nowISO = now.toISOString().slice(0, 10);
  const currentMonth = nowISO.slice(0, 7);
  const maxMonths = opts?.maxMonths ?? 12;

  const totals = monthlyExpenseTotals(transactions, nowISO);
  const closed = [...totals.keys()].filter(k => k < currentMonth);
  const months = closed.slice(-maxMonths);

  const models: BaselineModel[] = ['median3', 'robust_mean', 'last_month', 'same_month_last_year'];
  const baselines = models.map(model => metricsFor(
    BASELINE_LABELS[model],
    months.map(month => ({
      month,
      actual: r2(totals.get(month) ?? 0),
      predicted: (() => { const p = baselinePredict(model, month, totals); return p == null ? null : r2(p); })(),
    })),
  ));

  let engine: BaselineMetrics | null = null;
  if (opts?.engineEstimates && opts.engineEstimates.length > 0) {
    const byMonth = new Map(opts.engineEstimates.map(e => [e.month, e]));
    const intervals = new Map(
      opts.engineEstimates
        .filter(e => e.low != null && e.high != null)
        .map(e => [e.month, { low: e.low as number, high: e.high as number }]),
    );
    engine = metricsFor(
      'Motore',
      months.map(month => ({
        month,
        actual: r2(totals.get(month) ?? 0),
        predicted: byMonth.has(month) ? r2(byMonth.get(month)!.predicted) : null,
      })),
      intervals,
    );
  }

  return { months, baselines, engine };
}
