import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, FundType, FUND_TYPE_META, FUND_TYPE_ORDER } from '../../types';
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
  const { getCat, getAcc, categories, detailedInvestments } = useSettings();

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

  // Every investment category (even at €0), plus any other id that has a value.
  const rows = useMemo(() => {
    const ids = new Set<string>([
      ...categories.filter(c => c.kind === 'investment').map(c => c.id),
      ...Object.keys(investmentByCategory),
    ]);
    return [...ids]
      .map(id => {
        const c = getCat(id);
        return { id, label: c.label, color: c.color, icon: c.icon, value: investmentByCategory[id] ?? 0 };
      })
      .sort((a, b) => b.value - a.value);
  }, [categories, investmentByCategory, getCat]);

  const segments = rows.filter(r => r.value > 0).map(r => ({ label: r.label, value: r.value, color: r.color, icon: r.icon }));

  // Allocation by fund type (pension / bond / equity) — detailed mode only.
  // Values reuse the per-category capital already computed (initial + flows).
  const fundAlloc = useMemo(() => {
    const byType: Record<FundType, number> = { pension: 0, bond: 0, equity: 0 };
    let tfrTotal = 0;
    for (const c of categories) {
      if (c.kind !== 'investment' || !c.fundType) continue;
      byType[c.fundType] += investmentByCategory[c.id] ?? 0;
      if (c.fundType === 'pension' && c.tfrAmount) tfrTotal += c.tfrAmount;
    }
    const classifiedTotal = byType.pension + byType.bond + byType.equity;
    return { byType, tfrTotal, classifiedTotal };
  }, [categories, investmentByCategory]);

  const fundSegments = FUND_TYPE_ORDER
    .filter(ft => fundAlloc.byType[ft] > 0)
    .map(ft => ({ label: FUND_TYPE_META[ft].label, value: fundAlloc.byType[ft], color: FUND_TYPE_META[ft].color, icon: FUND_TYPE_META[ft].icon }));

  const showFundDonut = detailedInvestments && fundAlloc.classifiedTotal > 0;

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
          {rows.length > 0 && (
            <div className="glass-card rounded-2xl p-5">
              <p className="label-caps text-secondary mb-4">Allocazione per categoria</p>
              <div className="flex items-center gap-5 flex-wrap">
                <Donut segments={segments} centerLabel="Investito" size={140} />
                <ul className="flex-1 space-y-3 min-w-[180px]">
                  {rows.map(r => {
                    const count = txCountByCat[r.id] ?? 0;
                    const hasInitial = (initialByCat[r.id] ?? 0) > 0;
                    const empty = r.value <= 0;
                    return (
                      <li key={r.id} className={`flex items-center gap-2.5 min-w-0 ${empty ? 'opacity-50' : ''}`}>
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-primary truncate">{r.label}</p>
                          <p className="text-[11px] text-secondary">
                            {investmentTotal > 0 ? Math.round((r.value / investmentTotal) * 100) : 0}%
                            {count > 0 && ` · ${count} op.`}
                            {hasInitial && ' · capitale iniziale'}
                          </p>
                        </div>
                        <span className="text-[13px] font-semibold text-primary balance-num flex-shrink-0">{formatCurrency(r.value)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* Donut by fund type (detailed-investments mode) */}
          {showFundDonut && (
            <div className="glass-card rounded-2xl p-5">
              <p className="label-caps text-secondary mb-4">Allocazione per tipo di fondo</p>
              <div className="flex items-center gap-5 flex-wrap">
                <Donut segments={fundSegments} centerLabel="Investito" size={140} />
                <ul className="flex-1 space-y-3 min-w-[180px]">
                  {FUND_TYPE_ORDER.filter(ft => fundAlloc.byType[ft] > 0).map(ft => {
                    const value = fundAlloc.byType[ft];
                    const pct = fundAlloc.classifiedTotal > 0 ? Math.round((value / fundAlloc.classifiedTotal) * 100) : 0;
                    return (
                      <li key={ft} className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: FUND_TYPE_META[ft].color }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-primary truncate">{FUND_TYPE_META[ft].icon} {FUND_TYPE_META[ft].label}</p>
                          <p className="text-[11px] text-secondary">{pct}%</p>
                        </div>
                        <span className="text-[13px] font-semibold text-primary balance-num flex-shrink-0">{formatCurrency(value)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {fundAlloc.tfrTotal > 0 && (
                <div className="mt-4 rounded-xl px-3.5 py-3 flex items-start gap-2.5" style={{ backgroundColor: 'rgba(143,176,160,0.12)' }}>
                  <span className="text-base flex-shrink-0">🛡️</span>
                  <p className="text-[12px] text-secondary leading-snug">
                    Di questo totale, <span className="font-semibold text-primary balance-num">{formatCurrency(fundAlloc.tfrTotal)}</span> proviene dal <span className="font-medium text-primary">TFR</span>
                    {investmentTotal > 0 && (
                      <> — il <span className="font-medium text-primary">{Math.round((fundAlloc.tfrTotal / investmentTotal) * 100)}%</span> del capitale totale investito</>
                    )}
                    {fundAlloc.byType.pension > 0 && (
                      <> ({Math.round((fundAlloc.tfrTotal / fundAlloc.byType.pension) * 100)}% del fondo pensionistico)</>
                    )}.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Monthly contributions */}
          {trend.some(t => t.invest > 0) && (
            <div className="glass-card rounded-2xl p-5">
              <p className="label-caps text-secondary mb-4">Versamenti ultimi 6 mesi</p>
              {/* bars — month labels live in a separate row so they don't eat bar height */}
              <div className="flex items-end justify-around gap-2" style={{ height: 130 }}>
                {trend.map(t => {
                  const h = t.invest > 0 ? Math.max(16, (t.invest / maxMonth) * 100) : 10;
                  return (
                    <div key={t.key} className="flex-1 flex flex-col items-center justify-end min-w-0">
                      {t.invest > 0 && (
                        <span className="text-[10px] text-secondary balance-num mb-1 truncate w-full text-center leading-tight">
                          {formatCurrency(t.invest)}
                        </span>
                      )}
                      <div className="w-full rounded-t-md" style={{ height: h, maxWidth: 40, backgroundColor: 'var(--accent-gold)', opacity: t.invest > 0 ? 1 : 0.15 }} />
                    </div>
                  );
                })}
              </div>
              {/* month label row — separate so bars use the full height above */}
              <div className="flex justify-around gap-2 mt-2">
                {trend.map(t => (
                  <span key={t.key} className="flex-1 text-[10px] text-secondary text-center truncate min-w-0">
                    {capitalize(formatMonthShort(t.key))}
                  </span>
                ))}
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
