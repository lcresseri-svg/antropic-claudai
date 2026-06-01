import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatDate, formatMonthShort, capitalize } from '../../utils';
import { Donut } from './Donut';

interface Props {
  investmentByCategory: Record<string, number>;
  investmentTotal: number;
  monthlyInvestments: number;
  trend: { key: string; income: number; expense: number; invest: number }[];
  transactions: Transaction[];
}

export function InvestmentsScreen({ investmentByCategory, investmentTotal, monthlyInvestments, trend, transactions }: Props) {
  const navigate = useNavigate();
  const { getCat, getAcc, categories } = useSettings();

  const investTx = useMemo(
    () => transactions.filter(t => t.type === 'investment').sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  );

  const txCountByCat = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of investTx) r[t.category] = (r[t.category] ?? 0) + 1;
    return r;
  }, [investTx]);

  const initialByCat = useMemo(() => {
    const r: Record<string, number> = {};
    for (const c of categories) if (c.kind === 'investment' && c.initialBalance) r[c.id] = c.initialBalance;
    return r;
  }, [categories]);

  const entries = Object.entries(investmentByCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a);

  const segments = entries.map(([id, value]) => {
    const c = getCat(id);
    return { label: c.label, value, color: c.color, icon: c.icon };
  });

  const maxMonth = Math.max(1, ...trend.map(t => t.invest));

  return (
    <div className="pb-32 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/')} aria-label="Indietro"
          className="w-9 h-9 -ml-2 flex items-center justify-center text-secondary active:text-primary">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] flex-1">Investimenti</h1>
      </div>

      {investmentTotal <= 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3 opacity-60">📈</p>
          <p className="text-sm text-secondary">Nessun investimento registrato</p>
          <p className="text-xs text-secondary/70 mt-1">Aggiungi transazioni di tipo "Investimento" o imposta un capitale iniziale nelle categorie investimento</p>
        </div>
      ) : (
        <>
          {/* Hero total */}
          <div className="glass-card rounded-2xl p-5">
            <p className="label-caps text-secondary mb-2">Capitale investito</p>
            <p className="text-[40px] leading-none font-bold balance-num text-gold">{formatCurrency(investmentTotal)}</p>
            <p className="text-[13px] text-secondary mt-2.5">
              {formatCurrency(monthlyInvestments)} investiti questo mese · {investTx.length} operazioni totali
            </p>
          </div>

          {/* Donut by category */}
          {segments.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <p className="label-caps text-secondary mb-4">Allocazione per categoria</p>
              <div className="flex items-center gap-5 flex-wrap">
                <Donut segments={segments} centerLabel="Investito" size={140} />
                <ul className="flex-1 space-y-3 min-w-[180px]">
                  {segments.map(s => {
                    const id = entries.find(e => getCat(e[0]).label === s.label)?.[0] ?? '';
                    const count = txCountByCat[id] ?? 0;
                    const hasInitial = (initialByCat[id] ?? 0) > 0;
                    return (
                      <li key={s.label} className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-primary truncate">{s.label}</p>
                          <p className="text-[11px] text-secondary">
                            {Math.round((s.value / investmentTotal) * 100)}%
                            {count > 0 && ` · ${count} op.`}
                            {hasInitial && ' · capitale iniziale'}
                          </p>
                        </div>
                        <span className="text-[13px] font-semibold text-primary balance-num flex-shrink-0">{formatCurrency(s.value)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* Monthly contributions */}
          {trend.some(t => t.invest > 0) && (
            <div className="glass-card rounded-2xl p-5">
              <p className="label-caps text-secondary mb-4">Versamenti ultimi 6 mesi</p>
              <div className="flex items-end justify-around gap-2" style={{ height: 100 }}>
                {trend.map(t => {
                  const h = Math.max(2, (t.invest / maxMonth) * 84);
                  return (
                    <div key={t.key} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
                      <span className="text-[10px] text-secondary balance-num truncate w-full text-center">
                        {t.invest > 0 ? formatCurrency(t.invest) : ''}
                      </span>
                      <div className="w-full rounded-t-md" style={{ height: h, maxWidth: 40, backgroundColor: 'var(--accent-gold)', opacity: t.invest > 0 ? 1 : 0.25 }} />
                      <span className="text-[10px] text-secondary">{capitalize(formatMonthShort(t.key))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transactions */}
          {investTx.length > 0 && (
            <div className="glass-card rounded-2xl p-4">
              <p className="label-caps text-secondary mb-1 px-1">Operazioni</p>
              <div className="divide-y divide-divider">
                {investTx.slice(0, 50).map(t => {
                  const c = getCat(t.category);
                  return (
                    <div key={t.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: c.color + '18' }}>{c.icon}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-primary truncate">{t.description || c.label}</p>
                        <p className="text-[11px] text-secondary">{formatDate(t.date)} · {getAcc(t.account).label}</p>
                      </div>
                      <span className="text-[13px] font-semibold balance-num text-gold flex-shrink-0">{formatCurrency(t.amount)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
