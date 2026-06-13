import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, ownShare } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, capitalize } from '../../utils';
import { CategoryBubbles } from './CategoryBubbles';

type Period = '1m' | '3m' | '6m' | '1y';

const PERIOD_OPTS: { value: Period; label: string; months: number }[] = [
  { value: '1m', label: 'Mese',   months: 1 },
  { value: '3m', label: '3 mesi', months: 3 },
  { value: '6m', label: '6 mesi', months: 6 },
  { value: '1y', label: 'Anno',   months: 12 },
];

interface Props {
  transactions: Transaction[];
}

export function CategorySpendingScreen({ transactions }: Props) {
  const navigate = useNavigate();
  const { getCat } = useSettings();
  const [period, setPeriod] = useState<Period>('1m');
  const [offset, setOffset] = useState(0);

  const now = useMemo(() => new Date(), []);
  const months = PERIOD_OPTS.find(o => o.value === period)!.months;

  const { start, end, label, prevStart, prevEnd, prevLabel } = useMemo(() => {
    const cm = now.getMonth(), cy = now.getFullYear();
    const endMonth = new Date(cy, cm - offset, 1);
    const startMonth = new Date(cy, cm - offset - (months - 1), 1);
    const isCurrent = offset === 0;
    const end = isCurrent ? now : new Date(endMonth.getFullYear(), endMonth.getMonth() + 1, 0, 23, 59, 59);
    const fmtM = (d: Date) => capitalize(d.toLocaleString('it-IT', { month: 'short' }).replace('.', ''));
    let label: string;
    if (months === 1) {
      label = capitalize(endMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' }));
    } else if (startMonth.getFullYear() === endMonth.getFullYear()) {
      label = `${fmtM(startMonth)}–${fmtM(endMonth)} ${endMonth.getFullYear()}`;
    } else {
      label = `${fmtM(startMonth)} ${startMonth.getFullYear()} – ${fmtM(endMonth)} ${endMonth.getFullYear()}`;
    }
    const prevEndMonth   = new Date(cy, cm - offset - months, 1);
    const prevStartMonth = new Date(cy, cm - offset - months - (months - 1), 1);
    const prevEnd        = new Date(prevEndMonth.getFullYear(), prevEndMonth.getMonth() + 1, 0, 23, 59, 59);
    let prevLabel: string;
    if (months === 1) {
      prevLabel = capitalize(prevEndMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' }));
    } else if (prevStartMonth.getFullYear() === prevEndMonth.getFullYear()) {
      prevLabel = `${fmtM(prevStartMonth)}–${fmtM(prevEndMonth)} ${prevEndMonth.getFullYear()}`;
    } else {
      prevLabel = `${fmtM(prevStartMonth)} ${prevStartMonth.getFullYear()} – ${fmtM(prevEndMonth)} ${prevEndMonth.getFullYear()}`;
    }
    return { start: startMonth, end, label, prevStart: prevStartMonth, prevEnd, prevLabel };
  }, [now, offset, months]);

  const prevCatSpend = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const d = new Date(t.date);
      if (d < prevStart || d > prevEnd) continue;
      r[t.category] = (r[t.category] ?? 0) + ownShare(t);
    }
    return r;
  }, [transactions, prevStart, prevEnd]);

  const { total, cats, segments } = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'expense') continue;
      const d = new Date(t.date);
      if (d < start || d > end) continue;
      r[t.category] = (r[t.category] ?? 0) + ownShare(t);
    }
    const total = Object.values(r).reduce((s, v) => s + v, 0);
    const cats = Object.entries(r)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([id, amount]) => ({
        id,
        amount,
        pct: total > 0 ? Math.round((amount / total) * 100) : 0,
        prevAmount: prevCatSpend[id] ?? 0,
        delta: amount - (prevCatSpend[id] ?? 0),
      }));
    const segments = cats.map(({ id, amount }) => {
      const c = getCat(id);
      return { id, label: c.label, value: amount, color: c.color, icon: c.icon };
    });
    return { total, cats, segments };
  }, [transactions, start, end, getCat, prevCatSpend]);

  return (
    <div className="pb-32">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
          className="w-9 h-9 rounded-2xl bg-elevated flex items-center justify-center text-secondary active:scale-95 transition-transform flex-shrink-0"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <h1 className="text-xl font-bold text-primary tracking-[-0.03em]">Spese per categoria</h1>
      </div>

      {/* Period selector */}
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

      {/* Period navigator */}
      <div className="flex items-center justify-between bg-card rounded-xl px-1.5 py-1.5 mb-5">
        <button
          onClick={() => setOffset(o => o + 1)}
          aria-label="Periodo precedente"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-primary">{label}</span>
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
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>
      </div>

      {/* Bubbles + legend */}
      {total > 0 && (
        <div className="glass-card rounded-2xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="label-caps text-secondary">Distribuzione</p>
            <span className="text-[13px] font-semibold balance-num text-primary">{formatCurrency(total)}</span>
          </div>
          <CategoryBubbles segments={segments} count={5} onSelect={(id) => navigate(`/transactions?cat=${id}`)} />
          <ul className="mt-4 space-y-2.5">
            {segments.slice(0, 5).map(s => (
              <li key={s.label} className="flex items-center gap-2.5 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-[13px] text-secondary truncate flex-1">{s.label}</span>
                <span className="text-[13px] font-medium text-primary balance-num flex-shrink-0 w-14 text-right">{formatCurrency(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Category list */}
      {cats.length === 0 ? (
        <div className="glass-card rounded-2xl px-5 py-10 text-center text-secondary text-[13px]">
          Nessuna spesa in questo periodo
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          {cats.map(({ id, amount, pct, prevAmount, delta }, i) => {
            const cat = getCat(id);
            const deltaText =
              prevAmount === 0
                ? `Nessuna spesa in ${prevLabel}`
                : delta === 0
                ? `Stabile rispetto a ${prevLabel}`
                : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta))} rispetto a ${prevLabel}`;
            const deltaColor =
              delta > 0 ? 'text-[#E08B8B]'
              : delta < 0 ? 'text-[#7B9E87]'
              : 'text-secondary';
            return (
              <div
                key={id}
                className={`px-4 py-3.5 ${i < cats.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
                    style={{ backgroundColor: cat.color + '1a' }}
                  >
                    {cat.icon}
                  </span>
                  <span className="text-[13px] text-primary flex-1 truncate">{cat.label}</span>
                  <span className="text-[11px] text-secondary balance-num w-8 text-right flex-shrink-0">{pct}%</span>
                  <span className="text-[13px] font-semibold balance-num text-primary flex-shrink-0">
                    {formatCurrency(amount)}
                  </span>
                </div>
                {/* Proportional bar */}
                <div
                  className="h-[3px] rounded-full overflow-hidden ml-11"
                  style={{ backgroundColor: 'var(--progress-track)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: cat.color }}
                  />
                </div>
                <p className={`text-xs mt-1 ml-11 ${deltaColor}`}>{deltaText}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
