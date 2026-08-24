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
import { InvestmentDetailSheet } from '../investments/InvestmentDetailSheet';
import { monthlyInvestmentStats, statsSpreadOf, addMonths } from '../investments/investmentStatsSpread';
import { InvestmentTrendChart, InvestmentTrendPoint } from './InvestmentTrendChart';
import { AnalysisHeader } from './AnalysisHeader';

interface Props {
  investmentByCategory: Record<string, number>;
  investmentTotal: number;
  monthlyInvestments: number;
  trend: { key: string; income: number; expense: number; invest: number }[];
  transactions: Transaction[];
  onAddTransactions: (txs: Omit<Transaction, 'id'>[]) => Promise<void> | void;
}

const GREEN = 'var(--accent-green)';
const RED = 'var(--accent-red)';
const AMBER = 'var(--accent)';

export function InvestmentsScreen({ investmentByCategory, investmentTotal, monthlyInvestments, trend, transactions, onAddTransactions }: Props) {
  const navigate = useNavigate();
  // Allocation lists enumerate VISIBLE investment categories (archived ones are
  // hidden); getCat still resolves archived categories on the operations rows.
  const { getCat, getAcc, visibleCategories, detailedInvestments, saveCurrentValue } = useSettings();

  const [menuOpen, setMenuOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawPreselect, setWithdrawPreselect] = useState<string | undefined>();
  const [valueCat, setValueCat] = useState<CategoryDef | null>(null);
  const [detailCat, setDetailCat] = useState<CategoryDef | null>(null);
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
    for (const c of visibleCategories) {
      if (c.kind === 'investment' && c.fundType === 'pension' && c.tfrAmount) r[c.id] = c.tfrAmount;
    }
    for (const t of investTx) {
      if (t.tfr) r[t.category] = (r[t.category] ?? 0) + t.tfr;
    }
    return r;
  }, [visibleCategories, investTx]);

  // ── Positions: every investment category, with market value & latent P/L ────
  const positions = useMemo(() => {
    const investCats = visibleCategories.filter(c => c.kind === 'investment');
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
  }, [visibleCategories, investmentByCategory, txCountByCat, tfrByCat]);

  // ── Portfolio totals (§3) ────────────────────────────────────────────────────
  // Sum of the VISIBLE positions so the hero stays consistent with the list
  // (an archived investment category is excluded here too). `investmentTotal`
  // (full, incl. archived) still backs net worth elsewhere.
  const versatoTotale = positions.reduce((s, p) => s + p.versato, 0);
  const controvaloreTotale = positions.reduce((s, p) => s + p.weightValue, 0);
  const plusMinusTotale = controvaloreTotale - versatoTotale;
  const pmPct = versatoTotale > 0 ? (plusMinusTotale / versatoTotale) * 100 : 0;

  // ── Fund-type allocation (detailed mode) — unchanged computation ────────────
  const fundAlloc = useMemo(() => {
    const byType: Record<FundType, number> = { pension: 0, bond: 0, equity: 0 };
    let tfrTotal = 0;
    for (const c of visibleCategories) {
      if (c.kind !== 'investment' || !c.fundType) continue;
      byType[c.fundType] += investmentByCategory[c.id] ?? 0;
    }
    for (const v of Object.values(tfrByCat)) tfrTotal += v;
    const classifiedTotal = byType.pension + byType.bond + byType.equity;
    return { byType, tfrTotal, classifiedTotal };
  }, [visibleCategories, investmentByCategory, tfrByCat]);

  const fundSegments = FUND_TYPE_ORDER
    .filter(ft => fundAlloc.byType[ft] > 0)
    .map(ft => ({ label: FUND_TYPE_META[ft].label, value: fundAlloc.byType[ft], color: FUND_TYPE_META[ft].color, icon: FUND_TYPE_META[ft].icon }));

  const showFundDonut = detailedInvestments && fundAlloc.classifiedTotal > 0;

  // ── 6-month contributions — STATISTICAL (spread-aware) ─────────────────────
  // One-off deposits with statsSpreadMonths are ripartiti per quota mensile di
  // competenza (fino al mese corrente); everything else lands on its real month.
  // The cash flow / recap keep the real amounts — this chart is a trend.
  const last6 = useMemo(() => {
    const curMonth = new Date().toISOString().slice(0, 7);
    const stat = monthlyInvestmentStats(investTx, { untilMonth: curMonth });
    return trend.slice(-6).map(t => ({ key: t.key, invest: stat.get(t.key) ?? 0 }));
  }, [trend, investTx]);
  const maxAbs = Math.max(1, ...last6.map(t => Math.abs(t.invest)));
  const hasFlows = last6.some(t => t.invest !== 0);
  const currentKey = last6[last6.length - 1]?.key;

  // Versato cumulato mese per mese sugli ultimi 12: parte dal capitale che
  // c'era PRIMA della finestra, così la curva non riparte da zero.
  const trend12: InvestmentTrendPoint[] = useMemo(() => {
    const keys = trend.map(t => t.key);
    if (keys.length === 0) return [];
    const byMonth = new Map<string, number>();
    for (const t of investTx) {
      const k = t.date.slice(0, 7);
      byMonth.set(k, (byMonth.get(k) ?? 0) + investSign(t) * t.amount);
    }
    // Si parte dalla FINE: l'ultimo punto deve valere esattamente il versato
    // mostrato nell'hero, qualunque cosa ci sia dietro (capitali iniziali,
    // categorie archiviate, arrotondamenti per categoria). Camminare in avanti
    // da uno zero ricostruito farebbe finire la curva altrove.
    const out: InvestmentTrendPoint[] = new Array(keys.length);
    let running = versatoTotale;
    for (let i = keys.length - 1; i >= 0; i--) {
      out[i] = { key: keys[i], versato: Math.max(0, running) };
      running -= byMonth.get(keys[i]) ?? 0;
    }
    return out;
  }, [trend, investTx, versatoTotale]);

  // Un solo avviso per i controvalori fermi, invece dell'azione ripetuta su
  // ogni riga: dice QUALI e da quanto, e porta direttamente alla prima.
  const stalePositions = useMemo(() => positions.filter(p => p.stale || p.controvalore == null), [positions]);

  const hasAnything = positions.length > 0 || investTx.length > 0;

  const openWithdraw = (catId?: string) => { setWithdrawPreselect(catId); setWithdrawOpen(true); };

  return (
    <div className="pb-32 space-y-5">
      <AnalysisHeader title="Investimenti" subtitle="Quanto vale il portafoglio e come si muove"
        backTo="/wealth"
        action={
          <div className="relative flex-none">
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
        }
      />

      {/* ── Hero: portfolio ── */}
      <section className="hero-card rounded-[26px] shadow-elev-2 p-[22px] animate-rise-in">
        <p className="label-caps text-secondary mb-2">Controvalore totale</p>
        <p className="text-[38px] leading-none font-bold balance-num text-primary">{formatCurrency(controvaloreTotale)}</p>
        {versatoTotale > 0 && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className={`text-[11.5px] font-semibold balance-num px-2 py-[3px] rounded-full ${
              plusMinusTotale >= 0 ? 'text-green bg-green/[0.14]' : 'text-red bg-red/[0.14]'}`}>
              {plusMinusTotale >= 0 ? '+' : '−'}{formatCurrency(Math.abs(plusMinusTotale))} · {plusMinusTotale >= 0 ? '+' : '−'}{Math.abs(pmPct).toFixed(1)}%
            </span>
            <span className="text-[11.5px] text-secondary balance-num">versato {formatCurrency(versatoTotale)}</span>
          </div>
        )}
        {trend12.length >= 2 && (
          <div className="mt-4">
            <InvestmentTrendChart points={trend12}
              controvalore={controvaloreTotale > 0 ? controvaloreTotale : null} />
          </div>
        )}
      </section>

      {/* ── Un solo avviso per i controvalori fermi ── */}
      {stalePositions.length > 0 && (
        <div className="rounded-[18px] border border-gold/30 bg-gold/10 px-4 py-3.5 flex items-start gap-3">
          <span className="text-gold text-base flex-none">⏱️</span>
          <p className="flex-1 text-[12.5px] text-secondary leading-relaxed">
            {stalePositions.length === 1
              ? <>Un controvalore non è aggiornato: <span className="text-primary font-semibold">{stalePositions[0].cat.label}</span>.</>
              : <>{stalePositions.length} controvalori non sono aggiornati: <span className="text-primary font-semibold">{stalePositions.map(p => p.cat.label).join(', ')}</span>.</>}
          </p>
          <button type="button" onClick={() => setValueCat(stalePositions[0].cat)}
            className="text-[12px] font-semibold text-gold flex-none">Aggiorna</button>
        </div>
      )}

      {/* ── Primary actions ── */}
      <div className="flex gap-2.5">
        <button onClick={() => setDepositOpen(true)}
          className="flex-1 py-3 rounded-2xl cta-gold-fill font-semibold text-sm transition-transform active:scale-[0.98]">
          + Versa
        </button>
        <button onClick={() => openWithdraw()}
          className="flex-1 py-3 rounded-2xl font-semibold text-sm text-primary border border-divider-strong transition-transform active:scale-[0.98]">
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
            return (
              // Nessuna azione dentro la riga: il tap apre il dettaglio, che le
              // ha già tutte (Versa / Disinvesti / Aggiorna valore). Prima ogni
              // card ne mostrava due o tre, ripetute per ogni posizione.
              <button key={p.cat.id} type="button"
                aria-label={`Apri dettaglio di ${p.cat.label}`}
                onClick={() => setDetailCat(p.cat)}
                className={`w-full text-left glass-card rounded-[18px] shadow-elev-1 p-4
                            active:scale-[0.99] transition-transform ${empty ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-base flex-shrink-0"
                    style={{ backgroundColor: p.cat.color + '26' }}>{p.cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-primary truncate">{p.cat.label}</p>
                    <p className="text-[11.5px] truncate">
                      {p.controvalore == null || p.stale ? (
                        <span className="text-gold">valore da aggiornare</span>
                      ) : (
                        <span className="text-secondary">
                          {Math.round(pctOf * 100)}% del portafoglio · {p.count} {p.count === 1 ? 'operazione' : 'operazioni'}
                        </span>
                      )}
                      {p.tfr > 0 && (
                        <span className="ml-1.5 px-1.5 py-px rounded-full text-[10px] font-medium"
                          style={{ backgroundColor: 'rgba(143,176,160,0.16)', color: '#8FB0A0' }}>
                          TFR {formatCurrency(p.tfr)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[16px] font-bold text-primary balance-num">
                      {p.controvalore != null ? formatCurrency(p.controvalore) : '—'}
                    </p>
                    {p.pm != null && (
                      <p className="text-[12px] font-semibold balance-num" style={{ color: p.pm >= 0 ? GREEN : RED }}>
                        {p.pm >= 0 ? '+' : '−'}{formatCurrency(Math.abs(p.pm))}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 h-2 rounded-full overflow-hidden progress-track">
                  <div className="h-full rounded-full bar-grow"
                    style={{ width: `${Math.min(100, pctOf * 100)}%`, backgroundColor: p.cat.color }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── 6-month net contributions ── */}
      {hasFlows && (
        <div className="glass-card rounded-2xl p-5">
          <p className="label-caps text-secondary mb-4">Andamento versamenti</p>
          <div className="flex items-end justify-around gap-2" style={{ height: 104 }}>
            {last6.map(t => {
              const neg = t.invest < 0;
              const h = t.invest !== 0 ? Math.max(16, (Math.abs(t.invest) / maxAbs) * 100) : 10;
              return (
                <div key={t.key} className="flex-1 flex flex-col items-center justify-end min-w-0">
                  {/* Solo il mese corrente porta l'etichetta: sei numeri in
                      fila si leggevano come una tabella, non come un ritmo. */}
                  {t.invest !== 0 && (t.key === currentKey || neg) && (
                    <span className="text-[10px] balance-num mb-1 truncate w-full text-center leading-tight"
                      style={{ color: neg ? RED : 'rgb(var(--c-secondary))' }}>
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
            <span className="ml-auto balance-num">{formatCurrency(monthlyInvestments)} netti reali questo mese</span>
          </div>
          <p className="text-[10px] text-secondary/70 mt-1.5 leading-snug">
            Trend per competenza: i versamenti una tantum distribuiti contano per quota mensile.
            Saldi e flusso di cassa restano sugli importi reali.
          </p>
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

      {/* ── Operations — riga collassata: l'elenco è un dettaglio, non la
             cosa da guardare arrivando qui ── */}
      {investTx.length > 0 && (
        showAllOps ? (
          <div className="glass-card rounded-[18px] p-4">
            <div className="flex items-center justify-between mb-1 px-1">
              <p className="label-caps text-secondary">Operazioni</p>
              <button onClick={() => setShowAllOps(false)} className="text-[12px] font-semibold text-gold">Chiudi</button>
            </div>
            <div className="divide-y divide-divider">
              {investTx.slice(0, 50).map(t => (
                <OpRow key={t.id} t={t} icon={getCat(t.category).icon} color={getCat(t.category).color}
                  label={t.description || getCat(t.category).label}
                  accLabel={t.account ? getAcc(t.account).label : 'Apporto esterno'} />
              ))}
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAllOps(true)}
            className="w-full glass-card rounded-[18px] px-4 py-3.5 flex items-center justify-between gap-3 text-left">
            <span className="text-[13.5px] text-primary">
              Operazioni<span className="text-secondary"> · {investTx.length}</span>
            </span>
            <span className="text-[12px] font-semibold text-gold flex-none">Apri ›</span>
          </button>
        )
      )}

      {/* ── Sheets ── */}
      <InvestmentDepositSheet
        open={depositOpen}
        onClose={() => setDepositOpen(false)}
        // The controvalore update now happens atomically inside the write
        // (investmentValueSync): no separate saveCurrentValue bump here.
        onSave={txs => onAddTransactions(txs)}
      />
      <InvestmentWithdrawSheet
        open={withdrawOpen}
        investmentByCategory={investmentByCategory}
        preselectCategory={withdrawPreselect}
        onClose={() => setWithdrawOpen(false)}
        // The 'out' leg carries valueDelta = −cash, so the atomic sync lands the
        // position exactly on result.newCurrentValue — no separate write.
        onSave={(_catId, _cv, result) => onAddTransactions(result.transactions)}
      />
      <SetCurrentValueSheet
        open={!!valueCat}
        category={valueCat}
        deposited={valueCat ? (investmentByCategory[valueCat.id] ?? 0) : 0}
        onSave={v => { if (valueCat) saveCurrentValue(valueCat.id, v); }}
        onClose={() => setValueCat(null)}
      />
      {detailCat && (
        <InvestmentDetailSheet
          // Resolve the LIVE category (currentValue may change while open).
          category={visibleCategories.find(c => c.id === detailCat.id) ?? detailCat}
          transactions={transactions}
          deposited={investmentByCategory[detailCat.id] ?? 0}
          portfolioTotal={controvaloreTotale}
          onClose={() => setDetailCat(null)}
          onDeposit={() => { setDetailCat(null); setDepositOpen(true); }}
          onWithdraw={() => { const id = detailCat.id; setDetailCat(null); openWithdraw(id); }}
          onSetValue={() => { const c = detailCat; setDetailCat(null); setValueCat(c); }}
        />
      )}
    </div>
  );
}

/** One operation row — withdrawals get a distinct icon and red amount. */
function OpRow({ t, icon, color, label, accLabel }: {
  t: Transaction; icon?: string; color?: string; label?: string; accLabel: string;
}) {
  const out = t.direction === 'out';
  const spread = statsSpreadOf(t);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0"
        style={{ backgroundColor: out ? 'rgba(224,85,85,0.14)' : (color ?? '#E6B95C') + '18' }}>
        {out ? '↓' : (icon ?? '↑')}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-primary truncate">
          {label ?? t.description}
          {spread != null && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-gold/15 text-gold text-[10px] font-semibold px-1.5 py-0.5 leading-none align-middle">
              Distribuito su {spread} mesi
            </span>
          )}
        </p>
        <p className="text-[11px] text-secondary">
          {formatDate(t.date)} · {accLabel}
          {t.tfr ? ` · TFR ${formatCurrency(t.tfr)}` : ''}
        </p>
      </div>
      <span className="text-[13px] font-semibold balance-num flex-shrink-0" style={{ color: out ? RED : 'var(--accent)' }}>
        {out ? '−' : ''}{formatCurrency(t.amount)}
      </span>
    </div>
  );
}
