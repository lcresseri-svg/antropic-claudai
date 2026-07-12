/**
 * Patrimonio V2 (admin-only, flag `wealth_v2`) — pure analytics, no React/Firestore.
 *
 * Builds ON TOP of wealthAnalytics (the official versato-based series, which
 * stays untouched) and adds:
 *
 *  - the period-delta DECOMPOSITION
 *        Δ patrimonio = risparmio netto + rendimento investimenti + rettifiche
 *    On the versato-based series the "rendimento" term is 0 BY CONSTRUCTION
 *    (deposits move cash→invested without changing the total, market gains are
 *    not historicized). We never invent history: the realized-return term only
 *    becomes non-zero when wealthSnapshots provide real past market values.
 *    Today's LATENT gain (controvalore − versato) is reported separately.
 *  - composition (per-account cash, per-category investments at market value
 *    where available) with per-value freshness (lastValueUpdate vs STALE_DAYS),
 *  - per-period comparisons (1M/3M/6M/1A/Tutto) with initial/final values,
 *  - contribution of each component to the period delta.
 *
 * Transfers between tracked accounts never move the total (inherited from the
 * shared sampling engine) and deposits are NEVER counted as returns.
 */
import { Transaction, AccountDef, CategoryDef, ownShare, investSign, STALE_DAYS } from '../../types';
import {
  WealthPeriod, WealthPeriodSummary, WealthComparison,
  buildWealthPeriodSummary, buildWealthComparisons, getWealthRange,
} from '../dashboard/wealthAnalytics';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface WealthV2Decomposition {
  /** end − start of the (versato-based) total over the period. */
  deltaTotal: number;
  /** Entrate − uscite (own share) realized inside the period. */
  netSavings: number;
  /** Net deposits − withdrawals inside the period. Moves cash→invested;
   *  contributes 0 to the total — shown to keep it separate from returns. */
  investmentFlows: number;
  /** Realized investment return inside the period. 0 on the versato series;
   *  populated only when real snapshot history provides market values. */
  investmentReturn: number;
  /** Residual: deltaTotal − netSavings − investmentReturn. Captures per-category
   *  floors at 0 and legacy inconsistencies. Normally ≈ 0. */
  adjustments: number;
}

export interface WealthV2MarketToday {
  /** Net deposited capital (versato) — same figure as the dashboard. */
  investedCapital: number;
  /** Market value: Σ currentValue (fallback: versato per category). */
  marketValue: number;
  /** Latent gain: marketValue − investedCapital. NOT part of the series. */
  marketGain: number;
  /** marketGain / investedCapital, null when capital ≈ 0. */
  marketGainPct: number | null;
  /** Total net worth at market value (liquidity + marketValue). */
  netWorthAtMarket: number;
}

export interface WealthV2CompositionEntry {
  id: string;
  label: string;
  value: number;
  /** Share of its group total (0..1); 0 when the group total is ~0. */
  share: number;
}

export interface WealthV2InvestmentEntry extends WealthV2CompositionEntry {
  /** Net deposited capital for this category. */
  invested: number;
  /** True when the shown value comes from a manual market value. */
  hasMarketValue: boolean;
  /** ISO date of the last manual update, if any. */
  lastValueUpdate?: string;
  /** True when the manual value is older than STALE_DAYS (or missing). */
  stale: boolean;
}

export interface WealthV2Summary {
  period: WealthPeriod;
  /** The untouched official series/summary (versato-based). */
  base: WealthPeriodSummary;
  decomposition: WealthV2Decomposition;
  marketToday: WealthV2MarketToday;
  composition: {
    accounts: WealthV2CompositionEntry[];
    investments: WealthV2InvestmentEntry[];
  };
  /** 1M/3M/6M/1A start→end variations for total/liquidity/investments. */
  comparisons: WealthComparison[];
  /** Human-readable notes on data quality (stale values, missing history). */
  warnings: string[];
}

/** "Today" must match the dashboard convention (UTC toISOString). */
const dashboardToday = (now: Date) => now.toISOString().slice(0, 10);

/** Realized (non-projected, non-future) transactions inside (startISO, endISO]. */
function realizedInPeriod(transactions: Transaction[], startISO: string, endISO: string): Transaction[] {
  return transactions.filter(t => !t.projected && t.date > startISO && t.date <= endISO);
}

export function buildWealthV2Summary(
  transactions: Transaction[],
  accounts: AccountDef[],
  categories: CategoryDef[],
  period: WealthPeriod,
  opts?: { now?: Date; customStart?: string; customEnd?: string },
): WealthV2Summary {
  const now = opts?.now ?? new Date();
  const todayISO = dashboardToday(now);

  const base = buildWealthPeriodSummary(transactions, accounts, categories, period, opts);
  const range = getWealthRange(period, transactions, opts);

  // ── Decomposition ───────────────────────────────────────────────────────────
  const inPeriod = realizedInPeriod(transactions, range.startISO, range.endISO)
    .filter(t => t.date <= todayISO);
  let income = 0, expenses = 0, invFlows = 0;
  for (const t of inPeriod) {
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expenses += ownShare(t);
    else if (t.type === 'investment') invFlows += investSign(t) * t.amount;
    // transfers: intentionally ignored — they never change the total.
  }
  const netSavings = r2(income - expenses);
  const deltaTotal = base.total.delta;
  // No snapshot history wired yet → realized return is 0 (never invented).
  const investmentReturn = 0;
  const adjustments = r2(deltaTotal - netSavings - investmentReturn);

  // ── Today at market value ───────────────────────────────────────────────────
  // Per-category invested capital (versato): initial + deposits − withdrawals,
  // floored at 0 — same convention as useTransactions/wealthAnalytics.
  const invested: Record<string, number> = {};
  for (const c of categories) {
    if (c.kind === 'investment' && c.initialBalance) invested[c.id] = (invested[c.id] ?? 0) + c.initialBalance;
  }
  for (const t of transactions) {
    if (t.projected || t.type !== 'investment' || t.date > todayISO) continue;
    invested[t.category] = (invested[t.category] ?? 0) + investSign(t) * t.amount;
  }

  const investmentEntries: WealthV2InvestmentEntry[] = [];
  let investedCapital = 0, marketValue = 0;
  for (const c of categories) {
    if (c.kind !== 'investment' || c.archived) continue;
    const versato = Math.max(0, invested[c.id] ?? 0);
    const hasMarketValue = typeof c.currentValue === 'number';
    const value = hasMarketValue ? (c.currentValue as number) : versato;
    if (versato <= 0 && value <= 0) continue;
    const ageDays = c.lastValueUpdate
      ? Math.floor((Date.parse(todayISO) - Date.parse(c.lastValueUpdate)) / 86_400_000)
      : null;
    const stale = hasMarketValue ? (ageDays === null || ageDays > STALE_DAYS) : true;
    investedCapital += versato;
    marketValue += value;
    investmentEntries.push({
      id: c.id, label: c.label, value: r2(value), share: 0,
      invested: r2(versato), hasMarketValue, lastValueUpdate: c.lastValueUpdate, stale,
    });
  }
  for (const e of investmentEntries) e.share = marketValue > 0 ? r2(e.value / marketValue) : 0;
  investmentEntries.sort((a, b) => b.value - a.value);

  const liquidityToday = base.liquidity.endValue;
  const marketGain = r2(marketValue - investedCapital);
  const marketToday: WealthV2MarketToday = {
    investedCapital: r2(investedCapital),
    marketValue: r2(marketValue),
    marketGain,
    marketGainPct: investedCapital > 0.005 ? r2((marketGain / investedCapital) * 100) : null,
    netWorthAtMarket: r2(liquidityToday + marketValue),
  };

  // ── Composition: cash per account (today) ──────────────────────────────────
  const balances: Record<string, number> = {};
  for (const a of accounts) if (a.initialBalance) balances[a.id] = a.initialBalance;
  const bal = (id: string, d: number) => { if (!id) return; balances[id] = (balances[id] ?? 0) + d; };
  for (const t of transactions) {
    if (t.projected || t.date > todayISO) continue;
    if (t.type === 'income') bal(t.account, t.amount);
    else if (t.type === 'expense') bal(t.account, -ownShare(t));
    else if (t.type === 'investment') bal(t.account, -investSign(t) * t.amount);
    else if (t.type === 'transfer') { bal(t.account, -t.amount); if (t.toAccount) bal(t.toAccount, t.amount); }
  }
  const accountEntries: WealthV2CompositionEntry[] = accounts
    .filter(a => !a.archived && Math.abs(balances[a.id] ?? 0) > 0.005)
    .map(a => ({ id: a.id, label: a.label, value: r2(balances[a.id] ?? 0), share: 0 }));
  const cashTotal = accountEntries.reduce((s, e) => s + e.value, 0);
  for (const e of accountEntries) e.share = Math.abs(cashTotal) > 0.005 ? r2(e.value / cashTotal) : 0;
  accountEntries.sort((a, b) => b.value - a.value);

  // ── Warnings (honest data-quality notes, no false precision) ───────────────
  const warnings: string[] = [];
  const staleCount = investmentEntries.filter(e => e.hasMarketValue && e.stale).length;
  const noValueCount = investmentEntries.filter(e => !e.hasMarketValue).length;
  if (staleCount > 0) warnings.push(`${staleCount === 1 ? 'Un controvalore non è aggiornato' : `${staleCount} controvalori non sono aggiornati`} da più di ${STALE_DAYS} giorni.`);
  if (noValueCount > 0) warnings.push(`${noValueCount === 1 ? 'Un investimento è valutato' : `${noValueCount} investimenti sono valutati`} al capitale versato (nessun controvalore inserito).`);
  warnings.push('Il rendimento del periodo sarà calcolabile quando esisterà uno storico di snapshot patrimoniali; oggi è mostrato solo il rendimento latente.');

  return {
    period,
    base,
    decomposition: { deltaTotal, netSavings, investmentFlows: r2(invFlows), investmentReturn, adjustments },
    marketToday,
    composition: { accounts: accountEntries, investments: investmentEntries },
    comparisons: buildWealthComparisons(transactions, accounts, categories, { now }),
    warnings,
  };
}
