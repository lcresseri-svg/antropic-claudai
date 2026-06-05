import { useState } from 'react';
import { Transaction, CategoryDef } from '../../types';
import { useForecastV2 } from './useForecastV2';
import { CategoryForecastV2, BacktestResult } from './forecastTypes';

interface Props {
  transactions: Transaction[];
  expenseCategories: CategoryDef[];
  monthlyIncome: number;
  monthlyInvestments: number;
  monthlyExpenses: number;  // from existing engine (for comparison)
}

export function ForecastV2Screen({
  transactions,
  expenseCategories,
  monthlyIncome,
  monthlyInvestments,
  monthlyExpenses,
}: Props) {
  const [showBacktest, setShowBacktest] = useState(false);

  const { forecast, backtest } = useForecastV2({
    transactions,
    expenseCategories,
    monthlyIncome,
    monthlyInvestments,
    withBacktest: showBacktest,
  });

  const fmt = (n: number) => `€${Math.round(Math.abs(n)).toLocaleString('it-IT')}`;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const reliabilityLabel = (r: number) => r >= 0.7 ? 'Alta' : r >= 0.4 ? 'Media' : 'Bassa';
  const reliabilityColor = (r: number) => r >= 0.7 ? 'text-[#8A9270]' : r >= 0.4 ? 'text-gold' : 'text-[#C0706A]';

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gold/10 text-gold">
            Admin · Beta
          </span>
          <span className="text-xs text-tertiary">Motore V2</span>
        </div>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.03em]">Previsione V2</h1>
        <p className="text-sm text-secondary mt-0.5">
          Modello multi-segnale: curva importi + curva frequenza transazioni
        </p>
      </div>

      {/* Summary card */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-tertiary uppercase tracking-wide mb-1">Spese previste</p>
            <p className="text-3xl font-bold text-primary tracking-[-0.04em]">
              {fmt(forecast.projectedExpenses)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-tertiary mb-1">Risparmio previsto</p>
            <p className={`text-xl font-semibold ${forecast.savings >= 0 ? 'text-[#8A9270]' : 'text-[#C0706A]'}`}>
              {forecast.savings >= 0 ? '+' : ''}{fmt(forecast.savings)}
            </p>
          </div>
        </div>

        {/* Comparison with V1 */}
        <div className="h-px bg-divider" />
        <div className="grid grid-cols-3 gap-3 text-center">
          <Kpi label="Motore V1" value={fmt(monthlyExpenses)} sub="già registrate" />
          <Kpi label="Motore V2" value={fmt(forecast.projectedExpenses)} sub="proiettate fine mese" />
          <Kpi
            label="Differenza"
            value={`${forecast.projectedExpenses >= monthlyExpenses ? '+' : ''}${fmt(forecast.projectedExpenses - monthlyExpenses)}`}
            sub={`V2 ${forecast.projectedExpenses > monthlyExpenses ? 'più alto' : 'più basso'}`}
          />
        </div>

        {/* Reliability */}
        <div className="flex items-center gap-2 pt-1">
          <ReliabilityBar value={forecast.overallReliability} />
          <span className={`text-xs font-medium ${reliabilityColor(forecast.overallReliability)}`}>
            Affidabilità {reliabilityLabel(forecast.overallReliability)} · {pct(forecast.overallReliability)}
          </span>
        </div>
      </div>

      {/* Category breakdown */}
      <div>
        <h2 className="text-base font-semibold text-primary mb-3">Per categoria</h2>
        <div className="space-y-2">
          {forecast.categories
            .filter(c => c.projected > 0 || c.actualSoFar > 0)
            .sort((a, b) => b.projected - a.projected)
            .map(c => (
              <CategoryRow
                key={c.categoryId}
                data={c}
                label={expenseCategories.find(x => x.id === c.categoryId)?.label ?? c.categoryId}
                icon={expenseCategories.find(x => x.id === c.categoryId)?.icon ?? ''}
                reliabilityColor={reliabilityColor}
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
          <span>Backtest storico</span>
          <ChevronIcon open={showBacktest} />
        </button>
        {showBacktest && backtest && (
          <div className="px-5 pb-5 space-y-4 border-t border-divider">
            <BacktestPanel result={backtest} fmt={fmt} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-xs text-tertiary mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-primary">{value}</p>
      <p className="text-[11px] text-tertiary">{sub}</p>
    </div>
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
  data, label, icon, reliabilityColor,
}: {
  data: CategoryForecastV2;
  label: string;
  icon: string;
  reliabilityColor: (r: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const fmt = (n: number) => `€${Math.round(n).toLocaleString('it-IT')}`;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const comp = data.composition;
  const tb = data.treatmentBreakdown;
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
        <span className="text-sm font-semibold text-primary">{fmt(data.projected)}</span>
        <span className={`text-xs ml-1 ${reliabilityColor(data.reliability)}`}>
          {pct(data.reliability)}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-divider space-y-2 pt-3">
          {/* Composizione della proiezione */}
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
          <div className="h-px bg-divider" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <DetailRow label="Curva importi" value={fmt(data.amountCurveRemaining)} muted />
            <DetailRow label="Curva frequenza" value={fmt(data.countCurveRemaining)} muted />
            <DetailRow label="Peso curva importi" value={pct(data.blendAlpha)} muted />
            <DetailRow label="Peso frequenza" value={pct(1 - data.blendAlpha)} muted />
          </div>
          {/* Classificazione transazioni del mese */}
          {treatmentChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {treatmentChips.map(c => (
                <span key={c.label} className="text-[10px] px-2 py-0.5 rounded-full bg-elevated text-tertiary">
                  {c.label} · {c.count}
                </span>
              ))}
            </div>
          )}
          {data.explanation && (
            <p className="text-xs text-tertiary pt-1 italic">{data.explanation}</p>
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

function BacktestPanel({ result, fmt }: { result: BacktestResult; fmt: (n: number) => string }) {
  if (result.months.length === 0) {
    return <p className="text-sm text-tertiary pt-3">Nessun dato storico sufficiente per il backtest.</p>;
  }

  return (
    <div className="space-y-4 pt-3">
      {/* Metrics */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Kpi label="MAE" value={fmt(result.mae)} sub="errore assoluto medio" />
        <Kpi label="MAPE" value={`${result.mape}%`} sub="errore relativo mediano" />
        <Kpi label="R²" value={`${result.r2}`} sub="coefficiente determinaz." />
      </div>

      {/* Month-by-month table */}
      <div className="space-y-1">
        <p className="text-xs text-tertiary uppercase tracking-wide">Mese per mese</p>
        {result.months.map(m => (
          <div key={m.monthKey} className="flex items-center gap-3 py-1.5 border-b border-divider last:border-0">
            <span className="text-xs text-secondary w-16">{m.monthKey}</span>
            <span className="text-xs text-primary flex-1">Reale: {fmt(m.actual)}</span>
            <span className="text-xs text-primary flex-1">Prev: {fmt(m.predicted)}</span>
            <span className={`text-xs font-medium ${Math.abs(m.relError) <= 0.1 ? 'text-[#8A9270]' : Math.abs(m.relError) <= 0.2 ? 'text-gold' : 'text-[#C0706A]'}`}>
              {m.error >= 0 ? '+' : ''}{fmt(m.error)} ({Math.round(m.relError * 100)}%)
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
      className={`text-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
