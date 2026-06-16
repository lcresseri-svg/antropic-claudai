// Account detail — bottom sheet on mobile, right side-panel on desktop.
// Speculare a CategoryDetailSheet, but centred on the account BALANCE (a stock):
// final balance + period Δ, the balance curve, the period flows (income / expense
// / investment) and net transfers. Density follows the global insightDepth.

import { useEffect, useMemo } from 'react';
import { Transaction, AccountDef } from '../../types';
import { InsightDepth } from '../../shared/providers/settings';
import { formatCurrency, formatDate, capitalize } from '../../utils';
import { PeriodType, getPeriodRange } from './categoryAnalytics';
import {
  aggregateAccountFlow, aggregateAccountBalanceTrend, getAccountMovements, signedDelta,
} from './accountAnalytics';
import { AccountBalanceLineChart } from './AccountBalanceLineChart';
import { useScrollLock } from '../../shared/useScrollLock';

interface Props {
  account: AccountDef;
  transactions: Transaction[];
  period: PeriodType;
  offset: number;
  periodLabel: string;
  now: Date;
  depth: InsightDepth;
  onClose: () => void;
  onSeeAll: () => void;
}

const tone = (d: number) => (d > 0.005 ? 'text-green' : d < -0.005 ? 'text-red' : 'text-secondary');

export function AccountDetailSheet({
  account, transactions, period, offset, periodLabel, now, depth, onClose, onSeeAll,
}: Props) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const range = useMemo(() => getPeriodRange(period, offset, now), [period, offset, now]);
  const flow = useMemo(() => aggregateAccountFlow(transactions, account, range, { now }), [transactions, account, range, now]);
  const trend = useMemo(() => aggregateAccountBalanceTrend(transactions, account, period, offset, now), [transactions, account, period, offset, now]);
  const movements = useMemo(() => getAccountMovements(transactions, account, range, now), [transactions, account, range, now]);

  const months = range.months;
  const chartPoints = trend.map(p => ({ label: p.label, value: p.balance }));
  const balances = trend.map(p => p.balance);
  const minBal = balances.length ? Math.min(...balances) : 0;
  const maxBal = balances.length ? Math.max(...balances) : 0;
  const hasTransfer = Math.abs(flow.transferNet) > 0.005;

  const note = useMemo(() => deltaNote(flow, account.label), [flow, account.label]);

  // KPI cells, by density.
  const kpis: { label: string; value: string; tone?: string }[] = [];
  if (depth !== 'minimal') {
    kpis.push({ label: 'Entrate', value: formatCurrency(flow.income), tone: flow.income > 0 ? 'text-green' : undefined });
    kpis.push({ label: 'Uscite', value: formatCurrency(flow.expense), tone: flow.expense > 0 ? 'text-red' : undefined });
    kpis.push({ label: 'Investimenti', value: formatCurrency(flow.investment) });
  }
  if (depth === 'advanced') {
    kpis.push({ label: 'Saldo minimo', value: formatCurrency(minBal), tone: minBal < 0 ? 'text-red' : undefined });
    kpis.push({ label: 'Saldo massimo', value: formatCurrency(maxBal) });
    kpis.push({ label: 'Uscite/mese', value: formatCurrency(flow.expense / months) });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-stretch md:justify-end" role="dialog" aria-modal="true">
      <button aria-label="Chiudi" onClick={onClose} className="absolute inset-0 bg-black/70 animate-fade-in-fast" />

      <div className="relative w-full md:w-[460px] md:max-w-[92vw] md:h-full max-h-[88vh] md:max-h-none
                      glass-elevated rounded-t-3xl md:rounded-t-none md:rounded-l-3xl shadow-float
                      flex flex-col animate-sheet-up overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-divider">
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ backgroundColor: account.color + '1f' }}>
            {account.icon}
          </span>
          <div className="flex-1 min-w-0 pt-0.5">
            <h2 className="text-[17px] font-bold text-primary tracking-[-0.02em] truncate">{account.label}</h2>
            <p className="text-[11px] text-secondary mt-0.5">{capitalize(periodLabel)}</p>
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
          {/* Final balance + Δ */}
          <div>
            <p className="label-caps text-secondary mb-1">Saldo a fine periodo</p>
            <p className="text-[30px] leading-none font-bold text-primary balance-num">{formatCurrency(flow.closingBalance)}</p>
            <p className={`text-[12px] mt-1.5 balance-num ${tone(flow.delta)}`}>
              {formatCurrency(flow.delta, { sign: true })}
              <span className="text-secondary"> nel periodo</span>
            </p>
          </div>

          {/* KPIs */}
          {kpis.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {kpis.map(k => (
                <div key={k.label} className="bg-card rounded-xl px-3 py-2.5">
                  <p className={`text-[14px] font-semibold balance-num ${k.tone ?? 'text-primary'}`}>{k.value}</p>
                  <p className="text-[10px] text-secondary mt-0.5 truncate">{k.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Net transfers chip — only when there were transfers in the period. */}
          {depth !== 'minimal' && hasTransfer && (
            <div className="inline-flex items-center gap-1.5 bg-card rounded-full px-3 py-1.5">
              <span className="text-[11px] text-secondary">Trasferimenti netti</span>
              <span className={`text-[12px] font-semibold balance-num ${tone(flow.transferNet)}`}>
                {formatCurrency(flow.transferNet, { sign: true })}
              </span>
            </div>
          )}

          {/* Balance curve */}
          <div>
            <p className="label-caps text-secondary mb-2">{period === '1m' ? 'Andamento del mese' : 'Andamento nel tempo'}</p>
            <AccountBalanceLineChart points={chartPoints} formatValue={formatCurrency} />
          </div>

          {/* Sunny note */}
          {depth !== 'minimal' && (
            <div className="bg-card rounded-2xl px-4 py-3">
              <p className="label-caps text-secondary mb-1">Sunny nota</p>
              <p className="text-[13px] text-primary leading-snug">{note}</p>
            </div>
          )}

          {/* Movements */}
          <div>
            <p className="label-caps text-secondary mb-2">Movimenti recenti</p>
            {movements.length === 0 ? (
              <p className="text-[12px] text-secondary py-3 text-center">Nessun movimento su questo conto nel periodo selezionato.</p>
            ) : (
              <div className="space-y-2.5">
                {movements.slice(0, 6).map(t => {
                  const d = signedDelta(t, account.id);
                  return (
                    <div key={t.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-primary truncate">{t.description || capitalize(t.type)}</p>
                        <p className="text-[11px] text-secondary">{capitalize(formatDate(t.date))}</p>
                      </div>
                      <span className={`text-[13px] font-semibold balance-num flex-shrink-0 ${tone(d)}`}>
                        {formatCurrency(d, { sign: true })}
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
          <button onClick={onSeeAll}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl glass-cta-gold text-[13px] font-semibold active:opacity-80 transition-opacity">
            Vedi tutti i movimenti
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Deterministic one-liner naming the main driver of the period's balance change. */
function deltaNote(
  flow: { delta: number; income: number; expense: number; investment: number; transferNet: number },
  accountLabel: string,
): string {
  const { delta, income, expense, investment, transferNet } = flow;
  if (Math.abs(delta) < 1) return `Il saldo di ${accountLabel} è rimasto sostanzialmente stabile nel periodo.`;
  const drivers = [
    { k: 'le entrate', v: income },
    { k: 'le uscite', v: -expense },
    { k: 'un investimento', v: -investment },
    { k: 'i trasferimenti', v: transferNet },
  ]
    .filter(d => Math.sign(d.v) === Math.sign(delta) && Math.abs(d.v) > 0.005)
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const driver = drivers[0]?.k;
  if (delta > 0) return driver ? `Saldo in crescita nel periodo, trainato soprattutto da ${driver}.` : `Saldo in crescita nel periodo.`;
  return driver ? `Saldo in calo nel periodo, soprattutto per ${driver}.` : `Saldo in calo nel periodo.`;
}
