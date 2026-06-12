import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, CategoryDef, FundType, FUND_TYPE_META, FUND_TYPE_ORDER, investSign } from '../../types';
import { useSettings } from '../../shared/providers/settings';
import { formatCurrency, formatDate, formatMonthShort, capitalize } from '../../utils';
import { Donut } from './Donut';
import { plusMinusLatente, isStaleValue } from '../investments/investmentTransactionBuilder';
import { InvestmentDepositSheet } from '../investments/InvestmentDepositSheet';
import { InvestmentWithdrawSheet } from '../investments/InvestmentWithdrawSheet';
import { SetCurrentValueSheet } from '../investments/SetCurrentValueSheet';

interface Props {
  investmentByCategory: Record<string, number>;
  investmentTotal: number;
  monthlyInvestments: number;
  trend: { key: string; income: number; expense: number; invest: number }[];
  transactions: Transaction[];
  onAddTransactions: (txs: Omit<Transaction, 'id'>[]) => void;
}

const GREEN = '#8FB89A';
const RED = '#E05555';
const AMBER = '#C9A24B';

export function InvestmentsScreen({ investmentByCategory, investmentTotal, monthlyInvestments, trend, transactions, onAddTransactions }: Props) {
  const navigate = useNavigate();
  const { getCat, getAcc, categories, detailedInvestments, saveCurrentValue } = useSettings();

  const [menuOpen, setMenuOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawPreselect, setWithdrawPreselect] = useState<string | undefined>();
  const [valueCat, setValueCat] = useState<CategoryDef | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [showAllOps, setShowAllOps] = useState(false);

  const investTx = useMemo(
    () => transactions.filter(t => t.type === 'investment').sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  );

  const txCountByCat = useMemo(() => {
    const r: Record<string, number> = {};
    for (const t of investTx) r[t.category] = (r[t.category] ?? 0) + 1;
    return r;
  }, [investTx]);

  // TFR per pension category: pre-Sunny tfrAmount + per-contribution tfr.
  const tfrByCat = useMemo(() => {
    const r: Record<string, number> = {};
    for (const c of categories) {
      if (c.kind === 'investment' && c.fundType === 'pension' && c.tfrAmount) r[c.id] = c.tfrAmount;
    }
    for (const t of investTx) {
      if (t.tfr) r[t.category] = (r[t.category] ?? 0) + t.tfr;
    }
    return r;
  }, [categories, investTx]);

  // ── Positions: every investment category, with market value & latent P/L ────
  const positions = useMemo(() => {
    const investCats = categories.filter(c => c.kind === 'investment');
    return investCats
      .map(c => {
        const versato = investmentByCategory[c.id] ?? 0;
        const pm = plusMinusLatente(versato, c.currentValue);
        return {
          cat: c,
          versato,
          controvalore: c.currentValue ?? null,
          // Portfolio weight uses the market value, falling back to deposited.
          weightValue: c.currentValue ?? versato,
          pm,
          stale: c.currentValue != null && isStaleValue(c.lastValueUpdate),
          count: txCountByCat[c.id] ?? 0,
          tfr: tfrByCat[c.id] ?? 0,
        };
      })
      .sort((a, b) => b.weightValue - a.weightValue);
  }, [categories, investmentByCategory, txCountByCat, tfrByCat]);

  // ── Portfolio totals (§3) ────────────────────────────────────────────────────
  const versatoTotale = investmentTotal;
  const controvaloreTotale = positions.reduce((s, p) => s + p.weightValue, 0);
  const plusMinusTotale = controvaloreTotale - versatoTotale;
  const pmPct = versatoTotale > 0 ? (plusMinusTotale / versatoTotale) * 100 : 0;

  // ── Fund-type allocation (detailed mode) — unchanged computation ────────────
  const fundAlloc = useMemo(() => {
    const byType: Record<FundType, number> = { pension: 0, bond: 0, equity: 0 };
    let tfrTotal = 0;
    for (const c of categories) {
      if (c.kind !== 'investment' || !c.fundType) continue;
      byType[c.fundType] += investmentByCategory[c.id] ?? 0;
    }
    for (const v of Object.values(tfrByCat)) tfrTotal += v;
    const classifiedTotal = byType.pension + byType.bond + byType.equity;
    return { byType, tfrTotal, classifiedTotal };
  }, [categories, investmentByCategory, tfrByCat]);

  const fundSegments = FUND_TYPE_ORDER
    .filter(ft => fundAlloc.byType[ft] > 0)
    .map(ft => ({ label: FUND_TYPE_META[ft].label, value: fundAlloc.byType[ft], color: FUND_TYPE_META[ft].color, icon: FUND_TYPE_META[ft].icon }));

  const showFundDonut = detailedInvestments && fundAlloc.classifiedTotal > 0;

  // ── 6-month net contributions (trend.invest is direction-aware) ─────────────
  const last6 = trend.slice(-6);
  const maxAbs = Math.max(1, ...last6.map(t => Math.abs(t.invest)));
  const hasFlows = last6.some(t => t.invest !== 0);
  const currentKey = last6[last6.length - 1]?.key;

  const hasAnything = positions.length > 0 || investTx.length > 0;

  const openWithdraw = (catId?: string) => { setWithdrawPreselect(catId); setWithdrawOpen(true); };

  return (
    <div className="pb-32 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <button onClick={() => navigate('/')} aria-label="Indietro"
          className="w-9 h-9 -ml-2 flex items-center justify-center text-secondary active:text-primary">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h1 className="text-2xl font-bold text-primary tracking-[-0.03em] flex-1">Investimenti</h1>
        <div className="relative">
          <button onClick={() => setMenuOpen(o => !o)} aria-label="Menu"
            className="w-9 h-9 flex items-center justify-center text-secondary active:text-primary tracking-widest font-bold">
            •••
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-[35]" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-10 z-[40] rounded-2xl py-1 w-48 animate-fade-in-fast border border-divider shadow-float glass-elevated">
                <button onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                  className="w-full px-4 py-2.5 text-sm text-primary hover:bg-card-hover transition-colors text-left rounded-2xl">
                  Gestisci categorie
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Hero: portfolio ── */}
      <div className="rounded-[18px] p-5"
        style={{
          border: '0.5px solid rgba(230,185,92,0.18)',
          background: 'linear-gradient(180deg, rgba(230,185,92,0.08) 0%, rgba(230,185,92,0.02) 100%)',
        }}>
        <p className="label-caps text-secondary mb-2">Controvalore totale</p>
        <p className="text-[30px] leading-none font-medium balance-num text-primary">{formatCurrency(controvaloreTotale)}</p>
        <div className="flex items-center gap-2 mt-3">
          {versatoTotale > 0 && (
            <span className="text-[12px] font-semibold balance-num px-2 py-0.5 rounded-full"
              style={{
                color: plusMinusTotale >= 0 ? GREEN : RED,
                backgroundColor: plusMinusTotale >= 0 ? 'rgba(143,184,154,0.14)' : 'rgba(224,85,85,0.14)',
              }}>
              {plusMinusTotale >= 0 ? '+' : '−'}{formatCurrency(Math.abs(plusMinusTotale))} · {plusMinusTotale >= 0 ? '+' : '−'}{Math.abs(pmPct).toFixed(1)}%
            </span>
          )}
          <span className="text-[12px] text-secondary balance-num ml-auto">versato {formatCurrency(versatoTotale)}</span>
        </div>
      </div>

      {/* ── Primary actions ── */}
      <div className="flex gap-2.5">
        <button onClick={() => setDepositOpen(true)}
          className="flex-1 py-3 rounded-2xl font-semibold text-sm transition-transform active:scale-[0.98]"
          style={{ backgroundColor: '#E6B95C', color: '#0D0D0D' }}>
          + Versa
        </button>
        <button onClick={() => openWithdraw()}
          className="flex-1 py-3 rounded-2xl font-semibold text-sm text-primary transition-transform active:scale-[0.98]"
          style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
          ↓ Disinvesti
        </button>
      </div>

      {!hasAnything && (
        <div className="glass-card rounded-2xl p-10 text-center">
          <p className="text-3xl mb-3 opacity-60">📈</p>
          <p className="text-sm text-secondary">Nessun investimento registrato</p>
          <p className="text-xs text-secondary/70 mt-1">Versa il primo importo o imposta un capitale iniziale nelle categorie investimento</p>
        </div>
      )}

      {/* ── Positions ── */}
      {positions.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <p className="label-caps text-secondary">Posizioni</p>
            <p className="text-[11px] text-secondary">{positions.length} categorie</p>
          </div>
          {positions.map(p => {
            const empty = p.versato <= 0 && p.controvalore == null;
            const pctOf = controvaloreTotale > 0 ? p.weightValue / controvaloreTotale : 0;
            const pmPctCat = p.pm != null && p.versato > 0 ? (p.pm / p.versato) * 100 : null;
            const expanded = expandedCat === p.cat.id;
            const catOps = expanded ? investTx.filter(t => t.category === p.cat.id) : [];
            return (
              <div key={p.cat.id} className={`glass-card rounded-2xl ${empty ? 'opacity-50' : ''}`}>
                <button type="button" className="w-full text-left px-4 pt-3.5 pb-3"
                  onClick={() => setExpandedCat(e => e === p.cat.id ? null : p.cat.id)}>
                  {/* Row 1 — identity + value */}
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                      style={{ backgroundColor: p.cat.color + '22' }}>{p.cat.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-primary truncate">{p.cat.label}</p>
                      <p className="text-[11px] text-secondary truncate">
                        {p.count} operazioni
                        {p.cat.fundType && ` · ${FUND_TYPE_META[p.cat.fundType].label}`}
                        {p.tfr > 0 && (
                          <span className="ml-1.5 px-1.5 py-px rounded-full text-[10px] font-medium"
                            style={{ backgroundColor: 'rgba(143,176,160,0.16)', color: '#8FB0A0' }}>
                            TFR {formatCurrency(p.tfr)}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[15px] font-medium text-primary balance-num">
                        {p.controvalore != null ? formatCurrency(p.controvalore) : '—'}
                      </p>
                      {p.pm != null && (
                        <p className="text-[11px] font-semibold balance-num" style={{ color: p.pm >= 0 ? GREEN : RED }}>
                          {p.pm >= 0 ? '+' : '−'}{formatCurrency(Math.abs(p.pm))}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Row 2 — allocation bar */}
                  <div className="mt-3 h-[6px] rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctOf * 100)}%`, backgroundColor: p.cat.color }} />
                  </div>
                  {/* Row 3 — operational */}
                  <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                    <span className="text-secondary balance-num">Versato {formatCurrency(p.versato)}</span>
                    {pmPctCat != null && (
                      <span className="font-semibold balance-num" style={{ color: pmPctCat >= 0 ? GREEN : RED }}>
                        {pmPctCat >= 0 ? '+' : '−'}{Math.abs(pmPctCat).toFixed(1)}%
                      </span>
                    )}
                    {(p.controvalore == null || p.stale) && (
                      <span role="button" tabIndex={0}
                        onClick={e => { e.stopPropagation(); setValueCat(p.cat); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setValueCat(p.cat); } }}
                        className="flex items-center gap-1 font-medium cursor-pointer" style={{ color: AMBER }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
                        </svg>
                        {p.controvalore == null ? 'imposta controvalore' : 'valore da aggiornare'}
                      </span>
                    )}
                    {p.versato > 0 && (
                      <span role="button" tabIndex={0}
                        onClick={e => { e.stopPropagation(); openWithdraw(p.cat.id); }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); openWithdraw(p.cat.id); } }}
                        className="ml-auto text-secondary font-medium cursor-pointer active:text-primary">
                        Disinvesti ↓
                      </span>
                    )}
                  </div>
                </button>
                {/* Detail: operations of this category */}
                {expanded && catOps.length > 0 && (
                  <div className="border-t border-white/[0.05] px-4 pb-3 divide-y divide-divider">
                    {catOps.slice(0, 20).map(t => <OpRow key={t.id} t={t} accLabel={t.account ? getAcc(t.account).label : 'Senza conto'} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 6-month net contributions ── */}
      {hasFlows && (
        <div className="glass-card rounded-2xl p-5">
          <p className="label-caps text-secondary mb-4">Andamento versamenti</p>
          <div className="flex items-end justify-around gap-2" style={{ height: 130 }}>
            {last6.map(t => {
              const neg = t.invest < 0;
              const h = t.invest !== 0 ? Math.max(16, (Math.abs(t.invest) / maxAbs) * 100) : 10;
              return (
                <div key={t.key} className="flex-1 flex flex-col items-center justify-end min-w-0">
                  {t.invest !== 0 && (
                    <span className="text-[10px] balance-num mb-1 truncate w-full text-center leading-tight"
                      style={{ color: neg ? RED : 'var(--c-text-secondary, #9A9A9A)' }}>
                      {neg ? '−' : ''}{formatCurrency(Math.abs(t.invest))}
                    </span>
                  )}
                  <div className="w-full rounded-t-md" style={{
                    height: h, maxWidth: 40,
                    backgroundColor: neg ? 'rgba(224,85,85,0.75)' : 'var(--accent-gold)',
                    opacity: t.invest === 0 ? 0.15 : (neg || t.key === currentKey ? 1 : 0.55),
                  }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-around gap-2 mt-2">
            {last6.map(t => (
              <span key={t.key} className="flex-1 text-[10px] text-secondary text-center truncate min-w-0">
                {capitalize(formatMonthShort(t.key))}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-secondary">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'var(--accent-gold)' }} /> Versato</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: 'rgba(224,85,85,0.75)' }} /> Disinvestito</span>
            <span className="ml-auto balance-num">{formatCurrency(monthlyInvestments)} netti questo mese</span>
          </div>
        </div>
      )}

      {/* ── Fund-type allocation (detailed mode) ── */}
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
                {versatoTotale > 0 && (
                  <> — il <span className="font-medium text-primary">{Math.round((fundAlloc.tfrTotal / versatoTotale) * 100)}%</span> del capitale totale investito</>
                )}
                {fundAlloc.byType.pension > 0 && (
                  <> ({Math.round((fundAlloc.tfrTotal / fundAlloc.byType.pension) * 100)}% del fondo pensionistico)</>
                )}.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Operations ── */}
      {investTx.length > 0 && (
        <div className="glass-card rounded-2xl p-4">
          <p className="label-caps text-secondary mb-1 px-1">Operazioni</p>
          <div className="divide-y divide-divider">
            {(showAllOps ? investTx.slice(0, 50) : investTx.slice(0, 5)).map(t => (
              <OpRow key={t.id} t={t} icon={getCat(t.category).icon} color={getCat(t.category).color}
                label={t.description || getCat(t.category).label}
                accLabel={t.account ? getAcc(t.account).label : 'Senza conto'} />
            ))}
          </div>
          {investTx.length > 5 && !showAllOps && (
            <button onClick={() => setShowAllOps(true)}
              className="w-full mt-2 py-2.5 rounded-xl bg-elevated text-gold text-sm font-medium">
              Mostra tutte ({investTx.length})
            </button>
          )}
        </div>
      )}

      {/* ── Sheets ── */}
      <InvestmentDepositSheet
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        onSave={onAddTransactions}
      />
      <InvestmentWithdrawSheet
        open={withdrawOpen}
        investmentByCategory={investmentByCategory}
        preselectCategory={withdrawPreselect}
        onClose={() => setWithdrawOpen(false)}
        onSave={(catId, _cv, result) => {
          onAddTransactions(result.transactions);
          saveCurrentValue(catId, result.newCurrentValue);
        }}
      />
      <SetCurrentValueSheet
        open={!!valueCat}
        category={valueCat}
        deposited={valueCat ? (investmentByCategory[valueCat.id] ?? 0) : 0}
        onSave={v => { if (valueCat) saveCurrentValue(valueCat.id, v); }}
        onClose={() => setValueCat(null)}
      />
    </div>
  );
}

/** One operation row — withdrawals get a distinct icon and red amount. */
function OpRow({ t, icon, color, label, accLabel }: {
  t: Transaction; icon?: string; color?: string; label?: string; accLabel: string;
}) {
  const out = t.direction === 'out';
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
        style={{ backgroundColor: out ? 'rgba(224,85,85,0.14)' : (color ?? '#E6B95C') + '18' }}>
        {out ? '↓' : (icon ?? '↑')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-primary truncate">{label ?? t.description}</p>
        <p className="text-[11px] text-secondary">{formatDate(t.date)} · {accLabel}</p>
      </div>
      <span className="text-[13px] font-semibold balance-num flex-shrink-0" style={{ color: out ? RED : '#E6B95C' }}>
        {out ? '−' : ''}{formatCurrency(t.amount)}
      </span>
    </div>
  );
}
