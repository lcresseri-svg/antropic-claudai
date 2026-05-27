import { formatMonthShort, formatCurrency, capitalize } from '../utils';

interface Props {
  data: { key: string; income: number; expense: number }[];
}

const BAR_H = 96;

export function TrendChart({ data }: Props) {
  const max = Math.max(1, ...data.flatMap(d => [d.income, d.expense]));
  const hasData = data.some(d => d.income > 0 || d.expense > 0);

  return (
    <div className="bg-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-primary">Andamento 6 mesi</h3>
        <div className="flex items-center gap-3 text-[11px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#8A9270' }} /> Entrate
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: '#E6B95C' }} /> Uscite
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center text-secondary text-xs" style={{ height: BAR_H }}>
          Aggiungi transazioni per vedere il grafico
        </div>
      ) : (
        <div className="flex items-end justify-between gap-1">
          {data.map(d => (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex items-end justify-center gap-0.5" style={{ height: BAR_H }}>
                <Bar value={d.income} max={max} color="#8A9270" label={formatCurrency(d.income)} />
                <Bar value={d.expense} max={max} color="#E6B95C" label={formatCurrency(d.expense)} />
              </div>
              <span className="text-[10px] text-secondary">{capitalize(formatMonthShort(d.key))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = (value / max) * 100;
  const h = value > 0 ? Math.max(5, pct) : 2;
  return (
    <div className="flex-1 flex items-end" style={{ height: BAR_H }}>
      <div className="w-full rounded-t-sm transition-all duration-700"
        title={label}
        style={{ height: `${h}%`, backgroundColor: color, opacity: value > 0 ? 1 : 0.15 }} />
    </div>
  );
}
