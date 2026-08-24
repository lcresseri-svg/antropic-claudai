// "Ultimi movimenti" — solo desktop, nella colonna di destra della home: lo
// spazio orizzontale c'è e la domanda "cosa è successo di recente?" non merita
// un salto ai Movimenti. Su mobile la card non esiste (la home resta corta).
//
// Le ultime tre righe realizzate più, se c'è, la prossima programmata —
// smorzata, perché non è ancora successa.

import { useMemo } from 'react';
import { Transaction, ownShare } from '../../types';
import { isPending } from '../../shared/recurrence';
import { formatCurrency, formatDate } from '../../utils';
import { useSettings } from '../../shared/providers/settings';
import { localISO } from './categoryAnalytics';

interface Props {
  transactions: Transaction[];
  onSeeAll: () => void;
  now?: Date;
}

const REALIZED_ROWS = 3;

export function RecentMovementsCard({ transactions, onSeeAll, now }: Props) {
  const { getCat, getAcc } = useSettings();

  const rows = useMemo(() => {
    const todayISO = localISO(now ?? new Date());
    const realized: Transaction[] = [];
    const upcoming: Transaction[] = [];
    for (const t of transactions) {
      (isPending(t, todayISO) ? upcoming : realized).push(t);
    }
    realized.sort((a, b) => (a.date === b.date ? (b.createdAt ?? 0) - (a.createdAt ?? 0) : b.date.localeCompare(a.date)));
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    const next = upcoming[0];
    return [
      ...realized.slice(0, next ? REALIZED_ROWS : REALIZED_ROWS + 1).map(t => ({ t, pending: false })),
      ...(next ? [{ t: next, pending: true }] : []),
    ];
  }, [transactions, now]);

  if (rows.length === 0) return null;

  return (
    <section className="glass-card rounded-[22px] shadow-elev-1 px-[18px] pt-[18px] pb-2 animate-rise-in"
      style={{ animationDelay: '0.3s' }}>
      <div className="flex items-center justify-between mb-1">
        <p className="label-caps text-secondary">Ultimi movimenti</p>
        <button type="button" onClick={onSeeAll} className="text-[12px] font-medium text-gold">
          Tutti ›
        </button>
      </div>
      <ul>
        {rows.map(({ t, pending }, i) => {
          const cat = getCat(t.category);
          const outgoing = t.type === 'expense' || t.type === 'investment';
          return (
            <li key={t.id}
              className={`flex items-center gap-2.5 py-3 ${i < rows.length - 1 ? 'border-b border-divider' : ''} ${
                pending ? 'opacity-[0.65]' : ''}`}>
              <span className="w-8 h-8 rounded-[11px] flex items-center justify-center text-[14px] flex-none"
                style={{ backgroundColor: `${cat.color}26` }}>{cat.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] text-primary truncate">{t.description}</p>
                <p className="text-[11px] text-tertiary truncate">
                  {pending ? 'Programmato · ' : ''}{formatDate(t.date)} · {getAcc(t.account).label}
                </p>
              </div>
              <span className={`balance-num text-[13.5px] font-semibold flex-none ${
                t.type === 'income' ? 'text-green' : t.type === 'investment' ? 'text-gold' : 'text-primary'}`}>
                {outgoing ? '−' : ''}{formatCurrency(t.type === 'expense' ? ownShare(t) : t.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
