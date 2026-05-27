import { formatMonthShort, formatCurrency, capitalize } from '../utils';

interface Props {
  data: { key: string; income: number; expense: number }[];
}

export function TrendChart({ data }: Props) {
  const max = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));

  return (
    <div className="bg-card rounded-2xl p-5">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-primary">Andamento</h3>
        <div className="flex items-center gap-3 text-[11px] text-secondary">
          <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-green inline-block" /> Entrate</span>
          <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-gold inline-block" /> Uscite</span>
        </div>
      </div>

      <div className="flex items-end justify-between gap-2 h-32">
        {data.map(d => (
          <div key={d.key} className="flex-1 flex flex-col items-center gap-2 group">
            <div className="w-full flex items-end justify-center gap-1 h-full">
              <Bar value={d.income} max={max} className="bg-green" />
              <Bar value={d.expense} max={max} className="bg-gold" />
            </div>
            <span className="text-[10px] text-secondary">{capitalize(formatMonthShort(d.key))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const h = Math.max(value > 0 ? 6 : 2, (value / max) * 100);
  return (
    <div className="relative flex-1 max-w-[14px] h-full flex items-end">
      <div
        className={`w-full rounded-t-md ${className} transition-all duration-500`}
        style={{ height: `${h}%`, opacity: value > 0 ? 1 : 0.25 }}
        title={formatCurrency(value)}
      />
    </div>
  );
}
