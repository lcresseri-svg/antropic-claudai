// Investment position detail — bottom sheet on mobile, right side-panel on
// desktop. Speculare ad AccountDetailSheet: stessa shell, focus management
// (Escape + focus iniziale + trap), scroll lock. Mostra KPI di performance
// (XIRR money-weighted), il capitale versato nel tempo, le statistiche della
// posizione e i movimenti recenti.

import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Transaction, CategoryDef, FUND_TYPE_META } from '../../types';
import { formatCurrency, formatDate, capitalize } from '../../utils';
import { useScrollLock } from '../../shared/useScrollLock';
import { useSettings } from '../../shared/providers/settings';
import { isStaleValue } from './investmentTransactionBuilder';
import {
  buildPositionPerformance, buildPaidInSeries, collectPositionMovements, withdrawalProceeds,
} from './investmentPerformance';
import { statsSpreadOf, monthlyInvestmentStats, addMonths } from './investmentStatsSpread';
import { AccountBalanceLineChart } from '../dashboard/AccountBalanceLineChart';

interface Props {
  category: CategoryDef;
  transactions: Transaction[];
  /** Versato netto della posizione (da investmentByCategory). */
  deposited: number;
  /** Controvalore totale del portafoglio (per il peso %). */
  portfolioTotal: number;
  onClose: () => void;
  onDeposit: () => void;
  onWithdraw: () => void;
  onSetValue: () => void;
}

const GREEN = 'var(--accent-green)';
const RED = 'var(--accent-red)';

const fmtPct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(1)}%`;

function durationLabel(years: number): string {
  const months = Math.round(years * 12);
  if (months < 1) return '< 1 mese';
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return `${m} ${m === 1 ? 'mese' : 'mesi'}`;
  if (m === 0) return `${y} ${y === 1 ? 'anno' : 'anni'}`;
  return `${y} ${y === 1 ? 'anno' : 'anni'} e ${m} mesi`;
}

export function InvestmentDetailSheet({
  category, transactions, deposited, portfolioTotal, onClose, onDeposit, onWithdraw, onSetValue,
}: Props) {
  const navigate = useNavigate();
  const { getAcc } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock();

  // Escape chiude; focus iniziale sul pannello; trap Tab dentro al dialog.
  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const todayISO = new Date().toISOString().slice(0, 10);
  const curMonth = todayISO.slice(0, 7);

  const perf = useMemo(
    () => buildPositionPerformance({ category, transactions, todayISO }),
    [category, transactions, todayISO],
  );
  const movements = useMemo(
    () => collectPositionMovements(transactions, category.id),
    [transactions, category.id],
  );

  // Grafico: capitale versato ricostruito nel tempo (punti reali, mai storico
  // di mercato inventato). Bucket mensile per leggibilità.
  const paidInPoints = useMemo(() => {
    const series = buildPaidInSeries(category, transactions, todayISO);
    if (series.length < 2) return [];
    const byMonth = new Map<string, number>();
    for (const p of series) byMonth.set(p.date.slice(0, 7), p.value); // last of the month wins
    const months = [...byMonth.keys()].sort();
    const first = months[0];
    const out: { label: string; value: number }[] = [];
    let last = 0;
    for (let m = first; m <= curMonth; m = addMonths(m, 1)) {
      if (byMonth.has(m)) last = byMonth.get(m)!;
      out.push({ label: capitalize(new Date(`${m}-01T00:00:00`).toLocaleString('it-IT', { month: 'short' }).replace('.', '')), value: last });
      if (out.length > 400) break; // hard guard
    }
    // Thin the labels for long ranges: keep ~8 buckets.
    if (out.length > 16) {
      const step = Math.ceil(out.length / 12);
      return out.filter((_, i) => i % step === 0 || i === out.length - 1);
    }
    return out;
  }, [category, transactions, todayISO, curMonth]);

  // Statistiche spread-aware della posizione (quote mensili di competenza).
  const catInvestTx = useMemo(
    () => transactions.filter(t => t.type === 'investment' && t.category === category.id),
    [transactions, category.id],
  );
  const statByMonth = useMemo(
    () => monthlyInvestmentStats(catInvestTx, { untilMonth: curMonth }),
    [catInvestTx, curMonth],
  );
  const statThisMonth = statByMonth.get(curMonth) ?? 0;
  const last12 = useMemo(() => {
    let s = 0;
    for (let i = 0; i < 12; i++) s += statByMonth.get(addMonths(curMonth, -i)) ?? 0;
    return s;
  }, [statByMonth, curMonth]);

  // Frequenza versamenti: depositi / mesi coperti (prima → ultima operazione).
  const frequency = useMemo(() => {
    const dep = movements.deposits;
    if (dep.length < 2) return null;
    const firstM = dep[0].date.slice(0, 7);
    const lastM = dep[dep.length - 1].date.slice(0, 7);
    let span = 1;
    for (let m = firstM; m < lastM; m = addMonths(m, 1)) span++;
    return dep.length / span;
  }, [movements.deposits]);

  const controvalore = category.currentValue ?? null;
  const stale = controvalore != null && isStaleValue(category.lastValueUpdate);
  const weight = portfolioTotal > 0 ? (controvalore ?? deposited) / portfolioTotal : null;
  const firstOp = movements.flows[0]?.date ?? null;
  const lastOp = movements.flows[movements.flows.length - 1]?.date ?? null;

  const dash = '—';

  const kpis: { label: string; value: string; tone?: string; hint?: string }[] = [
    { label: 'Capitale investito netto', value: formatCurrency(perf.netCapital) },
    { label: 'Controvalore', value: controvalore != null ? formatCurrency(controvalore) : dash, hint: stale ? 'da aggiornare' : undefined },
    {
      label: 'Guadagno totale',
      value: perf.totalGain != null
        ? `${formatCurrency(perf.totalGain, { sign: true })}${perf.totalGainPct != null ? ` · ${fmtPct(perf.totalGainPct)}` : ''}`
        : dash,
      tone: perf.totalGain != null ? (perf.totalGain >= 0 ? 'text-green' : 'text-red') : undefined,
    },
    { label: 'Guadagno medio annuo', value: perf.avgAnnualGain != null ? `${formatCurrency(perf.avgAnnualGain, { sign: true })}/anno` : dash,
      tone: perf.avgAnnualGain != null ? (perf.avgAnnualGain >= 0 ? 'text-green' : 'text-red') : undefined },
    {
      label: 'Rendimento annualizzato',
      value: perf.annualizedReturn != null ? fmtPct(perf.annualizedReturn) : dash,
      tone: perf.annualizedReturn != null ? (perf.annualizedReturn >= 0 ? 'text-green' : 'text-red') : undefined,
      hint: perf.annualizedReturn == null
        ? (perf.annualizedUnavailableReason === 'no-current-value' ? 'serve il controvalore'
          : perf.annualizedUnavailableReason === 'no-subscription-date' ? 'serve la data di sottoscrizione'
          : 'dati insufficienti')
        : undefined,
    },
    { label: 'Durata', value: perf.years != null ? durationLabel(perf.years) : dash },
  ];

  const stats: { label: string; value: string }[] = [
    { label: 'Versamenti lordi', value: formatCurrency(perf.grossDeposits) },
    { label: 'Versamenti netti', value: formatCurrency(perf.grossDeposits - perf.capitalReturned) },
    { label: 'Disinvestito (incassato)', value: perf.proceeds > 0 ? formatCurrency(perf.proceeds) : dash },
    { label: 'Versamento medio', value: perf.depositCount > 0 ? formatCurrency(perf.grossDeposits / perf.depositCount) : dash },
    { label: 'Quota statistica del mese', value: statThisMonth !== 0 ? formatCurrency(statThisMonth) : dash },
    { label: 'Versamenti ultimi 12 mesi', value: last12 !== 0 ? formatCurrency(last12) : dash },
    { label: 'Frequenza versamenti', value: frequency != null ? `${frequency.toFixed(1)}/mese` : dash },
    { label: 'Commissioni', value: perf.fees > 0 ? formatCurrency(perf.fees) : dash },
    { label: 'Guadagno realizzato', value: perf.realizedGain !== 0 ? formatCurrency(perf.realizedGain, { sign: true }) : dash },
    { label: 'Guadagno latente', value: perf.latentGain != null ? formatCurrency(perf.latentGain, { sign: true }) : dash },
    { label: 'TFR totale', value: perf.tfrTotal > 0 ? `${formatCurrency(perf.tfrTotal)}${perf.contributed > 0 ? ` · ${Math.round((perf.tfrTotal / perf.contributed) * 100)}%` : ''}` : dash },
    { label: 'Peso nel portafoglio', value: weight != null ? `${Math.round(weight * 100)}%` : dash },
    { label: 'Prima operazione', value: firstOp ? capitalize(formatDate(firstOp)) : dash },
    { label: 'Ultima operazione', value: lastOp ? capitalize(formatDate(lastOp)) : dash },
    { label: 'Numero movimenti', value: String(movements.flows.length) },
  ];

  const recent = [...movements.flows].reverse().slice(0, 5);

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true"
      aria-label={`Dettaglio investimento ${category.label}`}>
      <button aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/70 animate-fade-in-fast" />

      <div ref={panelRef} tabIndex={-1}
        className="relative w-full md:w-[460px] md:max-w-[92vw] md:h-full max-h-[88vh] md:max-h-none
                   glass-elevated rounded-t-3xl md:rounded-t-none md:rounded-l-3xl shadow-float
                   flex flex-col animate-sheet-up overflow-hidden outline-none">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-divider">
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ backgroundColor: category.color + '1f' }}>
            {category.icon}
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-[17px] font-bold text-primary tracking-[-0.02em] truncate">{category.label}</h2>
            <p className="text-[11px] text-secondary mt-0.5">
              {category.fundType ? FUND_TYPE_META[category.fundType].label : 'Investimento'}
              {controvalore != null && category.lastValueUpdate && (
                <> · aggiornato {formatDate(category.lastValueUpdate)}{stale && <span style={{ color: 'var(--accent)' }}> · da aggiornare</span>}</>
              )}
            </p>
          </div>
          <button onClick={onClose} aria-label="Chiudi"
            className="w-8 h-8 rounded-full bg-elevated flex items-center justify-center text-secondary hover:text-primary transition-colors flex-shrink-0">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          {/* Controvalore + azioni */}
          <div>
            <p className="label-caps text-secondary mb-1">Controvalore</p>
            <p className="text-[30px] leading-none font-bold text-primary balance-num">
              {controvalore != null ? formatCurrency(controvalore) : dash}
            </p>
            {controvalore == null && (
              <p className="text-[11px] text-secondary mt-1">Imposta il controvalore per vedere guadagni e rendimento.</p>
            )}
            <div className="flex gap-2 mt-3">
              <button onClick={onDeposit}
                className="flex-1 py-2.5 rounded-xl font-semibold text-[13px] transition-transform active:scale-[0.98]"
                style={{ backgroundColor: 'var(--accent-hi)', color: 'var(--accent-on)' }}>
                + Versa
              </button>
              <button onClick={onWithdraw}
                className="flex-1 py-2.5 rounded-xl font-semibold text-[13px] text-primary bg-elevated active:bg-card-hover transition-colors">
                ↓ Disinvesti
              </button>
              <button onClick={onSetValue}
                className="flex-1 py-2.5 rounded-xl font-semibold text-[13px] text-primary bg-elevated active:bg-card-hover transition-colors">
                ✎ Controvalore
              </button>
            </div>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 gap-2">
            {kpis.map(k => (
              <div key={k.label} className="bg-card rounded-xl px-3 py-2.5">
                <p className={`text-[14px] font-semibold balance-num ${k.tone ?? 'text-primary'}`}>{k.value}</p>
                <p className="text-[10px] text-secondary mt-0.5 truncate">
                  {k.label}{k.hint && <span style={{ color: 'var(--accent)' }}> · {k.hint}</span>}
                </p>
              </div>
            ))}
          </div>

          {/* Capitale versato nel tempo */}
          <div>
            <p className="label-caps text-secondary mb-2">Capitale versato nel tempo</p>
            <AccountBalanceLineChart points={paidInPoints} formatValue={formatCurrency} />
            <p className="text-[10px] text-secondary/70 mt-1 leading-snug">
              {controvalore != null && category.lastValueUpdate
                ? `Il controvalore è un dato reale inserito a mano, disponibile dal ${formatDate(category.lastValueUpdate)}: la curva mostra solo il capitale versato, non l'andamento di mercato.`
                : 'La curva mostra il capitale versato ricostruito dai movimenti reali; nessuno storico di mercato viene stimato.'}
            </p>
          </div>

          {/* Statistiche */}
          <div>
            <p className="label-caps text-secondary mb-2">Statistiche</p>
            <div className="bg-card rounded-2xl px-4 py-1.5 divide-y divide-divider">
              {stats.map(s => (
                <div key={s.label} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[12px] text-secondary">{s.label}</span>
                  <span className="text-[12px] font-semibold text-primary balance-num text-right">{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Movimenti recenti */}
          <div>
            <p className="label-caps text-secondary mb-2">Movimenti recenti</p>
            {recent.length === 0 ? (
              <p className="text-[12px] text-secondary py-3 text-center">Nessun movimento registrato su questa posizione.</p>
            ) : (
              <div className="space-y-2.5">
                {recent.map(t => {
                  const out = t.direction === 'out';
                  const spread = statsSpreadOf(t);
                  return (
                    <div key={t.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-primary truncate">
                          {t.description}
                          {spread != null && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-gold/15 text-gold text-[10px] font-semibold px-1.5 py-0.5 leading-none align-middle">
                              Distribuito su {spread} mesi
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-secondary truncate">
                          {capitalize(formatDate(t.date))} · {t.account ? getAcc(t.account).label : 'Apporto esterno'}
                          {t.tfr ? ` · TFR ${formatCurrency(t.tfr)}` : ''}
                        </p>
                      </div>
                      <span className="text-[13px] font-semibold balance-num flex-shrink-0"
                        style={{ color: out ? RED : GREEN }}>
                        {out ? '−' : '+'}{formatCurrency(out ? withdrawalProceeds(t) : t.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="border-t border-divider px-5 py-3 safe-bottom">
          <button onClick={() => { onClose(); navigate(`/transactions?investment=${encodeURIComponent(category.id)}`); }}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl glass-cta-gold text-[13px] font-semibold active:opacity-80 transition-opacity">
            Vedi tutti i movimenti
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
